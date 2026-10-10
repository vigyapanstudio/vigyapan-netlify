// Customer dashboard API: login by email code, "me", profile edits and renewal orders.
import { json, readJson } from '../lib/http.mjs';
import { authReady, requestCode, verifyCode, sessionCookieFor, clearCookie, getSession } from '../lib/auth.mjs';
import { getCustomer, getPayments, computeMembership, getDeliveries, updateCustomer, normEmail } from '../lib/members.mjs';
import { invoiceNumber } from '../lib/invoice.mjs';
import { rzpCreateOrder, razorpayReady } from '../lib/razorpay.mjs';
import { BASE_PRICE, BUMP_PRICE, WHATSAPP, EMAIL_RE, cleanText } from '../lib/config.mjs';

export const config = { path: '/api/account' };

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' }, { headers: { Allow: 'POST' } });
  if (!authReady()) return json(503, { error: 'The dashboard is not switched on yet.' });
  const b = await readJson(req);
  if (b === null) return json(415, { error: 'Bad request.' });
  const action = String(b.action || '');

  try {
    if (action === 'request-code') {
      const email = normEmail(b.email);
      if (!EMAIL_RE.test(email)) return json(400, { error: 'Please enter a valid email address.' });
      try { await requestCode(email); } catch (e) { console.error('requestCode failed', String(e)); }
      return json(200, { ok: true });
    }
    if (action === 'verify-code') {
      const email = normEmail(b.email);
      const code = String(b.code || '').trim();
      if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) return json(400, { error: 'Enter the 6-digit code from your email.' });
      if (!(await verifyCode(email, code))) return json(400, { error: 'That code is not right or has expired. Please ask for a new one.' });
      return json(200, { ok: true }, { cookies: [sessionCookieFor(email)] });
    }
    if (action === 'logout') return json(200, { ok: true }, { cookies: [clearCookie('vs_session')] });

    const sess = getSession(req);
    if (!sess) return json(401, { error: 'Please log in.' });
    const cust = await getCustomer(sess.cid);
    if (!cust) return json(401, { error: 'Please log in.' }, { cookies: [clearCookie('vs_session')] });

    if (action === 'me') {
      const payments = await getPayments(sess.cid);
      const m = computeMembership(payments, Date.now());
      const deliveries = (await getDeliveries(sess.cid)).slice().sort((a, c) => c.uploadedAt - a.uploadedAt);
      return json(200, {
        customer: { name: cust.name, email: cust.email, phone: cust.phone, ig: cust.ig, biz: cust.biz, type: cust.type, city: cust.city, followers: cust.followers, goal: cust.goal, comp: cust.comp, about: cust.about, nextNote: cust.nextNote || '' },
        membership: m && { status: m.status, expiresAt: m.expiresAt, startedAt: m.startedAt, daysLeft: m.daysLeft, periodStart: m.periodStart, periodEnd: m.periodEnd },
        deliveries: deliveries.map((d) => ({ id: d.id, title: d.title, month: d.month, filename: d.filename, size: d.size, uploadedAt: d.uploadedAt })),
        payments: payments.slice().reverse().map((p) => ({ paymentId: p.paymentId, invoiceNo: invoiceNumber(p.raw), amount: p.amount, paidAt: p.paidAt, method: p.method, bump: p.bump, renewal: p.renewal })),
        prices: { renew: BASE_PRICE, bump: BUMP_PRICE }, whatsapp: WHATSAPP
      });
    }

    if (action === 'update') {
      const patch = {};
      if (b.profile && typeof b.profile === 'object') {
        const p = b.profile;
        const ig = cleanText(p.ig, 40).replace(/^@/, '');
        if (!/^[A-Za-z0-9._]{1,30}$/.test(ig)) return json(400, { error: 'Please check your Instagram handle.' });
        const name = cleanText(p.name, 80);
        if (name.length < 2) return json(400, { error: 'Please enter your name.' });
        Object.assign(patch, { name, ig, biz: cleanText(p.biz, 120), type: cleanText(p.type, 60), city: cleanText(p.city, 60), followers: cleanText(p.followers, 40), goal: cleanText(p.goal, 80), comp: cleanText(p.comp, 250), about: cleanText(p.about, 250) });
      }
      if (typeof b.nextNote === 'string') patch.nextNote = cleanText(b.nextNote, 600);
      await updateCustomer(sess.cid, patch);
      return json(200, { ok: true });
    }

    if (action === 'renew') {
      if (!razorpayReady()) return json(503, { error: 'Online payment is not switched on yet.' });
      const bump = b.bump === true || b.bump === 'true';
      const rupees = BASE_PRICE + (bump ? BUMP_PRICE : 0);
      const receipt = ('vsr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).slice(0, 40);
      const notes = {
        name: cust.name, phone: cust.phone, email: cust.email, instagram: '@' + cust.ig, business: cust.biz,
        business_type: cust.type, city: cust.city, followers: cust.followers, goal: cust.goal, competitors: cust.comp, about: cust.about,
        addon_reel_scripts: bump ? 'YES (+Rs ' + BUMP_PRICE + ')' : 'no',
        product: 'Instagram Growth Report + 30-Day Calendar (monthly renewal)', renewal: 'yes'
      };
      const o = await rzpCreateOrder({ rupees, receipt, notes });
      return json(200, { orderId: o.id, amount: o.amount, key: process.env.RAZORPAY_KEY_ID, receipt, prefill: { name: cust.name, email: cust.email, contact: '+91' + cust.phone } });
    }
    return json(400, { error: 'Unknown request.' });
  } catch (e) {
    console.error('account error', action, String(e));
    return json(500, { error: 'Something went wrong. Please try again.' });
  }
};
