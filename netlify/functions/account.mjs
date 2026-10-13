// Customer dashboard API: login by email code, "me", profile edits and renewal orders.
import { json, readJson } from '../lib/http.mjs';
import { authReady, requestCode, verifyCode, sessionCookieFor, clearCookie, getSession } from '../lib/auth.mjs';
import { getCustomer, getPayments, computeMembership, getDeliveries, updateCustomer, normEmail, ensureRefCode } from '../lib/members.mjs';
import { getCal, tickDay, viewFor } from '../lib/calendar.mjs';
import { quote, creditOffer, winbackOffer, planNote, promoNote, cleanMonths } from '../lib/pricing.mjs';
import * as db from '../lib/db.mjs';
import { STORES as S } from '../lib/db.mjs';
import { sendMail, shell, mailReady } from '../lib/mail.mjs';
import { invoiceNumber } from '../lib/invoice.mjs';
import { rzpCreateOrder, razorpayReady } from '../lib/razorpay.mjs';
import { BASE_PRICE, BUMP_PRICE, PACK3_PRICE, REFERRAL_PCT, WINBACK_OFF, WHATSAPP, EMAIL_RE, SELLER, cleanText, esc, siteUrl, addons as addonCatalogue } from '../lib/config.mjs';
import { upcoming } from '../lib/festivals.mjs';
import { libraryFor } from '../lib/library.mjs';
import { getThread, addFromClient, markSeenByClient } from '../lib/messages.mjs';
import { getAddons, priceItems } from '../lib/addons.mjs';
import { checkCoupon, cleanCode } from '../lib/coupons.mjs';
import { couponOffer } from '../lib/pricing.mjs';
import { isUnsub, setUnsub } from '../lib/prefs.mjs';
import { waReady } from '../lib/whatsapp.mjs';
import { allow } from '../lib/limits.mjs';

export const config = { path: '/api/account' };

// Which discounts this customer can use right now on a renewal.
function renewalOffers(cust, now) {
  const offers = [];
  if ((cust.credits || 0) > 0) offers.push(creditOffer());
  const w = cust.winback;
  if (w && !w.used && w.until && now <= w.until) offers.push(winbackOffer());
  return offers;
}

export default async (req, context) => {
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
      const now = Date.now();
      const payments = await getPayments(sess.cid);
      const m = computeMembership(payments, now);
      const deliveries = (await getDeliveries(sess.cid)).slice().sort((a, c) => c.uploadedAt - a.uploadedAt);
      const code = await ensureRefCode(cust);
      const site = siteUrl();
      const cal = m ? viewFor(await getCal(sess.cid), m.periodKey) : { ideas: [], ticks: [] };
      const review = await db.get(S.reviews, sess.cid);
      const w = cust.winback && !cust.winback.used && cust.winback.until > now ? cust.winback : null;
      const thread = await getThread(sess.cid);
      const addonOrders = await getAddons(sess.cid);
      return json(200, {
        festivals: upcoming(now, 75, 6),
        library: libraryFor(cust.type, cust.city),
        messages: { msgs: thread.msgs.slice(-30), unread: !!thread.unreadClient },
        addons: { items: addonCatalogue().map((a) => ({ id: a.id, name: a.name, price: a.price, desc: a.desc })),
          orders: addonOrders.map((a) => ({ paymentId: a.paymentId, invoiceNo: invoiceNumber(a.raw), items: a.items.map((i) => i.name), amount: a.amount, paidAt: a.paidAt, status: a.status })) },
        prefs: { emailsOff: await isUnsub(cust.email), waOptIn: !!cust.waOptIn, waAvailable: waReady() },
        customer: { name: cust.name, email: cust.email, phone: cust.phone, ig: cust.ig, biz: cust.biz, type: cust.type, city: cust.city, followers: cust.followers, goal: cust.goal, comp: cust.comp, about: cust.about, nextNote: cust.nextNote || '' },
        membership: m && { status: m.status, expiresAt: m.expiresAt, startedAt: m.startedAt, daysLeft: m.daysLeft, periodStart: m.periodStart, periodEnd: m.periodEnd, periodNo: m.periodNo, packMonths: m.packMonths },
        calendar: m && { startMs: m.periodStart, periodNo: m.periodNo, packMonths: m.packMonths, ideas: cal.ideas, ticks: cal.ticks },
        deliveries: deliveries.map((d) => ({ id: d.id, title: d.title, month: d.month, filename: d.filename, size: d.size, uploadedAt: d.uploadedAt })),
        payments: payments.slice().reverse().map((p) => ({ paymentId: p.paymentId, invoiceNo: invoiceNumber(p.raw), amount: p.amount, paidAt: p.paidAt, method: p.method, bump: p.bump, renewal: p.renewal, months: p.months || 1 })),
        referral: { code, link: (site || '') + '/?ref=' + code, credits: cust.credits || 0, friends: (cust.referred || []).length },
        offers: { credit: (cust.credits || 0) > 0, winback: w ? { until: w.until } : null },
        review: review ? { rating: review.rating, text: review.text, name: review.name, publish: !!review.publish, approved: !!review.approved } : null,
        canReview: deliveries.length > 0,
        prices: { renew: BASE_PRICE, bump: BUMP_PRICE, pack3: PACK3_PRICE, pct: REFERRAL_PCT, winbackOff: WINBACK_OFF }, whatsapp: WHATSAPP
      });
    }

    if (action === 'tick') {
      const m = computeMembership(await getPayments(sess.cid), Date.now());
      if (!m) return json(400, { error: 'No active plan.' });
      const day = Number(b.day);
      if (!Number.isInteger(day) || day < 1 || day > 30) return json(400, { error: 'Bad day.' });
      const ticks = await tickDay(sess.cid, m.periodKey, day, b.done === true);
      return json(200, { ok: true, ticks });
    }

    if (action === 'review') {
      const deliveries = await getDeliveries(sess.cid);
      if (!deliveries.length) return json(400, { error: 'You can review once your first report is ready.' });
      const rating = Number(b.rating);
      const text = cleanText(b.text, 600);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json(400, { error: 'Please choose a star rating.' });
      if (text.length < 10) return json(400, { error: 'Please write a sentence or two about your experience.' });
      const prev = await db.get(S.reviews, sess.cid);
      const rec = { cid: sess.cid, rating, text, name: cleanText(b.name, 40) || String(cust.name || '').split(' ')[0], biz: cust.biz || '', publish: b.publish === true,
        approved: false, createdAt: (prev && prev.createdAt) || Date.now(), updatedAt: Date.now() };
      await db.put(S.reviews, sess.cid, rec);
      if (mailReady()) {
        try {
          await sendMail({ to: process.env.OWNER_EMAIL || SELLER.email, replyTo: cust.email, subject: 'New review (' + rating + '/5) from ' + (cust.name || cust.email),
            html: shell({ preheader: 'A client left a review', heading: 'New review: ' + rating + ' out of 5',
              bodyHtml: '<p style="margin:0 0 10px">' + esc(text) + '</p><p style="margin:0;color:#7a948f;font-size:13px">' + esc(rec.name) + (rec.biz ? ', ' + esc(rec.biz) : '') + '. ' +
                (rec.publish ? 'They said you may show it on your website. Approve it in Admin, Reviews.' : 'They did NOT allow it to be shown publicly.') + '</p>' }),
            text: 'New review ' + rating + '/5 from ' + cust.email + ': ' + text });
        } catch (e) { console.error('review notice failed', String(e)); }
      }
      return json(200, { ok: true });
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

    if (action === 'msg-send') {
      const text = cleanText(b.text, 1000);
      if (text.length < 2) return json(400, { error: 'Please type your question.' });
      if (!(await allow('msg', sess.cid, 12, 3600000))) return json(429, { error: 'You have sent a lot of messages. Please wait a little before sending more.' });
      await addFromClient(sess.cid, text);
      if (mailReady()) {
        try {
          const site = siteUrl();
          await sendMail({ to: process.env.OWNER_EMAIL || SELLER.email, replyTo: cust.email, subject: 'New question from ' + (cust.name || cust.email) + (cust.ig ? ' (@' + cust.ig + ')' : ''),
            html: shell({ preheader: text.slice(0, 80), heading: 'New question from a client',
              bodyHtml: '<p style="margin:0 0 10px;white-space:pre-wrap">' + esc(text) + '</p><p style="margin:0;color:#7a948f;font-size:13px">' + esc(cust.name || '') + ' | ' + esc(cust.email) + '. Reply in Admin, Messages' + (site ? ' (' + esc(site) + '/admin)' : '') + ', or on WhatsApp +91 ' + esc(cust.phone) + '.</p>' }),
            text: 'New question from ' + cust.email + ': ' + text });
        } catch (e) { console.error('message notice failed', String(e)); }
      }
      const t = await getThread(sess.cid);
      return json(200, { ok: true, messages: { msgs: t.msgs.slice(-30), unread: false } });
    }
    if (action === 'msg-seen') { await markSeenByClient(sess.cid); return json(200, { ok: true }); }

    if (action === 'prefs') {
      if (typeof b.emailsOff === 'boolean') await setUnsub(cust.email, b.emailsOff);
      if (typeof b.waOptIn === 'boolean') await updateCustomer(sess.cid, { waOptIn: b.waOptIn });
      return json(200, { ok: true });
    }

    if (action === 'manage-enquiry') {
      if (!(await allow('manage', sess.cid, 1, 86400000))) return json(200, { ok: true, again: true });
      const note = cleanText(b.note, 400);
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await db.put(S.leads, id, { id, kind: 'manage', name: cust.name, phone: cust.phone, email: cust.email, ig: cust.ig, type: cust.type, note, status: 'new', createdAt: Date.now() });
      if (mailReady()) {
        try {
          await sendMail({ to: process.env.OWNER_EMAIL || SELLER.email, replyTo: cust.email, subject: 'Page management enquiry: ' + (cust.name || cust.email) + ' @' + cust.ig,
            html: shell({ preheader: 'A client wants you to manage their page', heading: 'Someone wants you to manage their page',
              bodyHtml: '<p style="margin:0 0 8px"><b>' + esc(cust.name) + '</b> (@' + esc(cust.ig) + (cust.biz ? ', ' + esc(cust.biz) : '') + ') tapped "Manage my page for me".</p>' + (note ? '<p style="margin:0 0 8px;white-space:pre-wrap">' + esc(note) + '</p>' : '') +
                '<p style="margin:0"><a href="https://wa.me/91' + esc(cust.phone) + '">Open WhatsApp chat</a> | ' + esc(cust.email) + '</p>' }),
            text: 'Page management enquiry from ' + cust.email + ' / +91 ' + cust.phone + (note ? ' / ' + note : ''), idemKey: 'vs-mng-' + id });
        } catch (e) { console.error('manage notice failed', String(e)); }
      }
      return json(200, { ok: true });
    }

    if (action === 'check-code') {
      if (!(await allow('codechk', sess.cid, 25, 3600000))) return json(429, { error: 'Too many tries. Please wait a while.' });
      const code = cleanCode(b.code);
      if (!code) return json(400, { error: 'Type your code first.' });
      const r = await checkCoupon(code, 'renewal');
      if (r.error) return json(400, { error: r.error });
      const c = r.coupon;
      return json(200, { ok: true, code: c.code, pct: c.type === 'pct' ? c.value : 0, off: c.type === 'flat' ? c.value : 0, label: c.type === 'flat' ? '₹' + c.value + ' off' : c.value + '% off' });
    }

    if (action === 'addon-order') {
      if (!razorpayReady()) return json(503, { error: 'Online payment is not switched on yet.' });
      const { items, total } = priceItems(b.ids);
      if (!items.length) return json(400, { error: 'Choose at least one add-on.' });
      const receipt = ('vsa_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 40);
      const notes = { kind: 'addon', items: items.map((i) => i.id).join(','), name: cust.name, phone: cust.phone, email: cust.email, instagram: '@' + cust.ig, business: cust.biz };
      const o = await rzpCreateOrder({ rupees: total, receipt, notes });
      return json(200, { orderId: o.id, amount: o.amount, key: process.env.RAZORPAY_KEY_ID, receipt, total, label: items.map((i) => i.name).join(', '), prefill: { name: cust.name, email: cust.email, contact: '+91' + cust.phone } });
    }

    if (action === 'renew') {
      if (!razorpayReady()) return json(503, { error: 'Online payment is not switched on yet.' });
      const bump = b.bump === true || b.bump === 'true';
      const months = cleanMonths(b.months);
      const offers = renewalOffers(cust, Date.now());
      const code = cleanCode(b.code);
      if (code) {
        const r = await checkCoupon(code, 'renewal');
        if (r.error) return json(400, { error: r.error });
        offers.push(r.offer);
      }
      const q = quote({ months, bump, offers });
      const receipt = ('vsr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).slice(0, 40);
      const notes = {
        name: cust.name, phone: cust.phone, email: cust.email, instagram: '@' + cust.ig, business: cust.biz,
        business_type: cust.type, city: cust.city, followers: cust.followers, goal: cust.goal, competitors: cust.comp, about: cust.about,
        addon_reel_scripts: bump ? 'YES' : 'no', plan: planNote(months), renewal: 'yes'
      };
      const promo = promoNote(q);
      if (promo) notes.promo = promo;
      const o = await rzpCreateOrder({ rupees: q.total, receipt, notes });
      return json(200, { orderId: o.id, amount: o.amount, key: process.env.RAZORPAY_KEY_ID, receipt, total: q.total, prefill: { name: cust.name, email: cust.email, contact: '+91' + cust.phone } });
    }
    return json(400, { error: 'Unknown request.' });
  } catch (e) {
    console.error('account error', action, String(e));
    return json(500, { error: 'Something went wrong. Please try again.' });
  }
};
