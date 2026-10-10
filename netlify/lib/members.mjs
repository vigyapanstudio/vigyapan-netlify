// Customers, their payments, and how long their membership lasts.
//
// Every successful payment buys 30 days. We store each payment on its own (so saving the same
// payment twice changes nothing), and work out the end date by replaying the payments in order.
// If someone renews early, the new 30 days start when the old ones end, so no days are lost.
import { createHash } from 'node:crypto';
import * as db from './db.mjs';
import { STORES as S } from './db.mjs';
import { BASE_PRICE, BUMP_PRICE, PERIOD_DAYS, REMIND_DAYS, DAY, EMAIL_RE, cleanText } from './config.mjs';

export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const cidOf = (email) => createHash('sha256').update(normEmail(email)).digest('hex').slice(0, 24);

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
  const snap = {
    paymentId: payment.id, orderId: payment.order_id, amount, paidAt,
    method: payment.method || '',
    bump: /^yes/i.test(String(notes.addon_reel_scripts || '')) || amount >= BASE_PRICE + BUMP_PRICE,
    renewal: String(notes.renewal || '') === 'yes',
    raw: { id: payment.id, order_id: payment.order_id, amount: payment.amount, method: payment.method || '', created_at: payment.created_at || Math.floor(paidAt / 1000) },
    notes
  };
  await db.put(S.payments, cid + '/' + String(paidAt).padStart(13, '0') + '-' + payment.id, snap);

  const prev = await db.get(S.customers, cid);
  const fresh = profileFromNotes(notes);
  const keepOld = prev && snap.renewal;       // a renewal never overwrites details the customer edited
  const cust = Object.assign({ nextNote: '' }, prev || {}, keepOld ? {} : fresh, {
    cid, email, createdAt: (prev && prev.createdAt) || paidAt, updatedAt: Date.now()
  });
  if (keepOld) PROFILE_FIELDS.forEach((f) => { if (!cust[f]) cust[f] = fresh[f]; });
  await db.put(S.customers, cid, cust);
  return { cid, email, snap };
}

export async function getPayments(cid) {
  const ks = await db.keys(S.payments, cid + '/');
  const out = [];
  for (const k of ks) { const p = await db.get(S.payments, k); if (p) out.push(p); }
  return out.sort((a, b) => a.paidAt - b.paidAt);
}

export function computeMembership(payments, now) {
  if (!payments || !payments.length) return null;
  now = now == null ? Date.now() : now;
  let cursor = 0; const periods = [];
  for (const p of payments) {
    const start = cursor > p.paidAt ? cursor : p.paidAt;
    const end = start + PERIOD_DAYS * DAY;
    periods.push({ start, end, paymentId: p.paymentId });
    cursor = end;
  }
  const expiresAt = cursor;
  const current = periods.find((p) => p.start <= now && now < p.end) || periods[periods.length - 1];
  const daysLeft = Math.max(0, Math.ceil((expiresAt - now) / DAY));
  const status = now >= expiresAt ? 'expired' : (daysLeft <= REMIND_DAYS ? 'ending' : 'active');
  return { status, expiresAt, startedAt: periods[0].start, daysLeft, periodStart: current.start, periodEnd: current.end, periods };
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
