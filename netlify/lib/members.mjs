// Customers, their payments, and how long their membership lasts.
//
// Every successful payment buys 30 days per month of the plan (1 or 3 months). We store each payment on
// its own (so saving the same payment twice changes nothing), and work out the end date by replaying
// the payments in order. If someone renews early, the new days start when the old ones end.
import { createHash } from 'node:crypto';
import * as db from './db.mjs';
import { STORES as S } from './db.mjs';
import { BASE_PRICE, BUMP_PRICE, PERIOD_DAYS, REMIND_DAYS, DAY, EMAIL_RE, CHECK_CREDIT_DAYS, cleanText } from './config.mjs';
import { monthsFromNote, parsePromo, isCheckPlan } from './pricing.mjs';
import { useCoupon } from './coupons.mjs';

export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const cidOf = (email) => createHash('sha256').update(normEmail(email)).digest('hex').slice(0, 24);

// Referral code for a customer: always the same for the same customer, easy to read out loud.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function refCodeOf(cid) {
  const h = createHash('sha256').update('vsref:' + cid).digest();
  let out = 'VS-'; for (let i = 0; i < 6; i++) out += CODE_CHARS[h[i] % CODE_CHARS.length];
  return out;
}
export async function ensureRefCode(cust) {
  const code = refCodeOf(cust.cid);
  const hit = await db.get(S.referrals, code);
  if (!hit) await db.put(S.referrals, code, { cid: cust.cid });
  if (cust.refCode !== code) { cust.refCode = code; await db.put(S.customers, cust.cid, cust); }
  return code;
}
export async function findByRefCode(code) {
  code = String(code || '').trim().toUpperCase();
  if (!/^VS-[A-Z0-9]{6}$/.test(code)) return null;
  const hit = await db.get(S.referrals, code);
  const c = hit && await db.get(S.customers, hit.cid);
  return c ? { code, customer: c } : null;
}

const PROFILE_FIELDS = ['name', 'phone', 'ig', 'biz', 'type', 'city', 'followers', 'goal', 'comp', 'about'];

function profileFromNotes(n) {
  return {
    name: cleanText(n.name, 80), phone: cleanText(n.phone, 14), ig: cleanText(n.instagram, 41).replace(/^@/, ''),
    biz: cleanText(n.business, 120), type: cleanText(n.business_type, 60), city: cleanText(n.city, 60),
    followers: cleanText(n.followers, 40), goal: cleanText(n.goal, 80), comp: cleanText(n.competitors, 250), about: cleanText(n.about, 250)
  };
}

export async function recordPayment(payment, order) {
  const notes = (order && order.notes) || {};
  const email = normEmail(notes.email || payment.email);
  if (!EMAIL_RE.test(email)) throw new Error('payment has no valid email');
  const cid = cidOf(email);
  const paidAt = (payment.created_at ? payment.created_at * 1000 : Date.now());
  const amount = Math.round(payment.amount / 100);
  const isCheck = isCheckPlan(notes.plan);               // Quick Page Check: a one-off report, never a membership
  const months = isCheck ? 0 : monthsFromNote(notes.plan);
  const promo = parsePromo(notes.promo);
  const snap = {
    paymentId: payment.id, orderId: payment.order_id, amount, paidAt, months, product: isCheck ? 'check' : 'plan',
    method: payment.method || '',
    bump: notes.addon_reel_scripts != null ? /^yes/i.test(String(notes.addon_reel_scripts)) : amount >= BASE_PRICE + BUMP_PRICE,
    renewal: /^(yes|upgrade)$/.test(String(notes.renewal || '')), upgrade: String(notes.renewal || '') === 'upgrade',
    promo: promo ? promo.kind : '', promoCode: promo ? promo.code : '', promoAmt: promo ? promo.amount : 0,
    raw: { id: payment.id, order_id: payment.order_id, amount: payment.amount, method: payment.method || '', created_at: payment.created_at || Math.floor(paidAt / 1000) },
    notes
  };
  const pkey = cid + '/' + String(paidAt).padStart(13, '0') + '-' + payment.id;
  const alreadySaved = !!(await db.get(S.payments, pkey));
  await db.put(S.payments, pkey, snap);

  const prev = await db.get(S.customers, cid);
  const fresh = profileFromNotes(notes);
  const keepOld = prev && snap.renewal;       // a renewal never overwrites details the customer edited
  const cust = Object.assign({ nextNote: '' }, prev || {}, keepOld ? {} : fresh, {
    cid, email, createdAt: (prev && prev.createdAt) || paidAt, updatedAt: Date.now()
  });
  if (keepOld) PROFILE_FIELDS.forEach((f) => { if (!cust[f]) cust[f] = fresh[f]; });

  // Things that must happen once per payment (never again if the same payment is saved twice).
  if (!alreadySaved && isCheck && !(prev && prev.check)) {
    // First Quick Page Check: their price is credited if they buy the full plan soon after.
    const had = (await getPayments(cid)).some((p) => p.product !== 'check' && p.paymentId !== payment.id);
    if (!had) cust.check = { paidAt, paymentId: payment.id, until: paidAt + CHECK_CREDIT_DAYS * DAY, used: false };
  }
  if (!alreadySaved && promo) {
    if (promo.kind === 'checkcredit') cust.check = Object.assign({}, cust.check || {}, { used: true, usedAt: paidAt });
    if (promo.kind === 'coupon' && promo.code) { try { await useCoupon(promo.code); } catch (e) { console.error('coupon count failed', String(e)); } }
    if (promo.kind === 'credit') cust.credits = Math.max(0, (cust.credits || 0) - 1);
    if (promo.kind === 'winback') cust.winback = Object.assign({}, cust.winback || {}, { used: true });
    if (promo.kind === 'referral' && promo.code && !cust.referredBy) {
      const ref = await findByRefCode(promo.code);
      if (ref && ref.customer.cid !== cid) {
        cust.referredBy = promo.code;
        const r = ref.customer;
        r.credits = (r.credits || 0) + 1;
        r.referred = (r.referred || []).concat([{ name: String(cust.name || '').split(' ')[0], at: paidAt, paymentId: payment.id }]).slice(-50);
        await db.put(S.customers, r.cid, r);
        console.log('REFERRAL CREDIT: ' + r.email + ' earned a 10% credit because ' + email + ' used code ' + promo.code);
      }
    }
  }
  if (!snap.renewal && String(notes.wa || '') === 'yes') cust.waOptIn = true;   // ticked "WhatsApp updates" on the order form
  await db.put(S.customers, cid, cust);
  try {   // they paid, so the unfinished-checkout reminder is no longer needed
    const idx = await db.get(S.carts, 'e-' + cid);
    if (idx) { await db.del(S.carts, 'c-' + idx.rid); await db.del(S.carts, 'e-' + cid); }
  } catch (e) { console.error('cart cleanup failed', String(e)); }
  await ensureRefCode(cust);
  return { cid, email, snap };
}

export async function getPayments(cid) {
  const ks = await db.keys(S.payments, cid + '/');
  const out = [];
  for (const k of ks) { const p = await db.get(S.payments, k); if (p) out.push(p); }
  return out.sort((a, b) => a.paidAt - b.paidAt);
}

export function computeMembership(payments, now) {
  payments = (payments || []).filter((p) => p.product !== 'check');     // a Quick Page Check never starts a membership
  if (!payments.length) return null;
  now = now == null ? Date.now() : now;
  let cursor = 0; const periods = [];
  for (const p of payments) {
    const months = p.months || 1;
    let start = cursor > p.paidAt ? cursor : p.paidAt;
    for (let i = 0; i < months; i++) {
      const end = start + PERIOD_DAYS * DAY;
      periods.push({ start, end, paymentId: p.paymentId, idx: i, months, key: p.paymentId + ':' + i });
      start = end;
    }
    cursor = start;
  }
  const expiresAt = cursor;
  const current = periods.find((p) => p.start <= now && now < p.end) || periods[periods.length - 1];
  const daysLeft = Math.max(0, Math.ceil((expiresAt - now) / DAY));
  const status = now >= expiresAt ? 'expired' : (daysLeft <= REMIND_DAYS ? 'ending' : 'active');
  return { status, expiresAt, startedAt: periods[0].start, daysLeft, periodStart: current.start, periodEnd: current.end,
    periodKey: current.key, periodNo: current.idx + 1, packMonths: current.months, periods };
}

export const getCustomer = (cid) => db.get(S.customers, cid);

export async function listCustomers() {
  const ks = await db.keys(S.customers);
  const out = [];
  for (const k of ks) { const c = await db.get(S.customers, k); if (c) out.push(c); }
  return out;
}

export async function getDeliveries(cid) { return (await db.get(S.deliveries, cid)) || []; }

export async function updateCustomer(cid, patch) {
  const c = await db.get(S.customers, cid);
  if (!c) return null;
  const next = Object.assign({}, c, patch, { updatedAt: Date.now() });
  await db.put(S.customers, cid, next);
  return next;
}
