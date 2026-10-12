// Your private admin API: see customers, upload their reports, restore a payment.
import { json, readJson } from '../lib/http.mjs';
import { authReady, isAdmin, adminCookie, clearCookie, checkAdminPassword } from '../lib/auth.mjs';
import { listCustomers, getCustomer, getPayments, computeMembership, getDeliveries, cidOf, normEmail, ensureRefCode } from '../lib/members.mjs';
import { getCal, saveIdeas, viewFor } from '../lib/calendar.mjs';
import { invoiceNumber } from '../lib/invoice.mjs';
import { processPaidPayment } from '../lib/receipt.mjs';
import { sendMail, shell, mailReady } from '../lib/mail.mjs';
import * as db from '../lib/db.mjs';
import { STORES as S } from '../lib/db.mjs';
import { siteUrl, esc, cleanText, WHATSAPP, SELLER } from '../lib/config.mjs';

export const config = { path: '/api/admin' };
const MAX_FILE = 3800000; // bytes (the host allows about 6 MB per request, and base64 adds a third)

function sniff(buf) {
  if (buf.length > 4 && buf.slice(0, 4).toString('latin1') === '%PDF') return { type: 'application/pdf', ext: 'pdf' };
  if (buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { type: 'image/png', ext: 'png' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  return null;
}

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' }, { headers: { Allow: 'POST' } });
  if (!authReady() || !process.env.ADMIN_PASSWORD) return json(503, { error: 'The admin page is not switched on yet (add SESSION_SECRET and ADMIN_PASSWORD in Netlify).' });
  const b = await readJson(req);
  if (b === null) return json(415, { error: 'Bad request.' });
  const action = String(b.action || '');

  try {
    if (action === 'login') {
      const ip = (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || '';
      const r = await checkAdminPassword(ip, String(b.password || ''));
      if (r.limited) return json(429, { error: 'Too many tries. Please wait 15 minutes.' });
      if (!r.ok) return json(401, { error: 'Wrong password.' });
      return json(200, { ok: true }, { cookies: [adminCookie()] });
    }
    if (action === 'logout') return json(200, { ok: true }, { cookies: [clearCookie('vs_admin')] });
    if (!isAdmin(req)) return json(401, { error: 'Please log in.' });

    if (action === 'list') {
      const now = Date.now();
      const customers = await listCustomers();
      const rows = [];
      const stats = { total: 0, active: 0, ending: 0, expired: 0, revenue: 0, revenue30: 0 };
      for (const c of customers) {
        const pays = await getPayments(c.cid);
        const m = computeMembership(pays, now);
        const dl = await getDeliveries(c.cid);
        const paid = pays.reduce((s, p) => s + p.amount, 0);
        stats.total++; stats.revenue += paid;
        pays.forEach((p) => { if (now - p.paidAt < 30 * 86400000) stats.revenue30 += p.amount; });
        if (m) stats[m.status]++;
        rows.push({
          cid: c.cid, name: c.name, email: c.email, phone: c.phone, ig: c.ig, biz: c.biz,
          status: m ? m.status : 'none', expiresAt: m ? m.expiresAt : 0, daysLeft: m ? m.daysLeft : 0,
          payments: pays.length, totalPaid: paid, deliveries: dl.length,
          lastDelivery: dl.reduce((mx, d) => Math.max(mx, d.uploadedAt), 0), hasNote: !!c.nextNote
        });
      }
      rows.sort((a, c) => (a.expiresAt || 0) - (c.expiresAt || 0));
      let newLeads = 0, pendingReviews = 0;
      for (const k of await db.keys(S.leads)) { const l = await db.get(S.leads, k); if (l && l.status === 'new') newLeads++; }
      for (const k of await db.keys(S.reviews)) { const r = await db.get(S.reviews, k); if (r && r.publish && !r.approved) pendingReviews++; }
      stats.newLeads = newLeads; stats.pendingReviews = pendingReviews;
      return json(200, { customers: rows, stats });
    }

    if (action === 'customer') {
      const cid = String(b.cid || '');
      const c = await getCustomer(cid);
      if (!c) return json(404, { error: 'Customer not found.' });
      const pays = await getPayments(cid);
      const m = computeMembership(pays, Date.now());
      const cal = m ? viewFor(await getCal(cid), m.periodKey) : { ideas: [], ticks: [] };
      return json(200, {
        customer: c,
        membership: m && { status: m.status, expiresAt: m.expiresAt, daysLeft: m.daysLeft, periodNo: m.periodNo, packMonths: m.packMonths, periodStart: m.periodStart, periodEnd: m.periodEnd },
        calendar: m && { ideasText: cal.ideas.join('\n'), ticked: cal.ticks.length },
        referral: { code: c.refCode || await ensureRefCode(c), credits: c.credits || 0, friends: (c.referred || []).length, referredBy: c.referredBy || '' },
        winback: c.winback || null,
        payments: pays.slice().reverse().map((p) => ({ paymentId: p.paymentId, invoiceNo: invoiceNumber(p.raw), amount: p.amount, paidAt: p.paidAt, bump: p.bump, renewal: p.renewal, months: p.months || 1, promo: p.promo || '' })),
        deliveries: (await getDeliveries(cid)).slice().sort((a, d) => d.uploadedAt - a.uploadedAt),
        whatsapp: WHATSAPP
      });
    }

    if (action === 'set-ideas') {
      const cid = String(b.cid || '');
      if (!(await getCustomer(cid))) return json(404, { error: 'Customer not found.' });
      const m = computeMembership(await getPayments(cid), Date.now());
      if (!m) return json(400, { error: 'This customer has no plan.' });
      const lines = await saveIdeas(cid, m.periodKey, b.text);
      return json(200, { ok: true, lines: lines.length });
    }

    if (action === 'leads') {
      const out = [];
      for (const k of await db.keys(S.leads)) { const l = await db.get(S.leads, k); if (l) out.push(l); }
      out.sort((a, d) => d.createdAt - a.createdAt);
      return json(200, { leads: out.slice(0, 300) });
    }
    if (action === 'lead-status') {
      const id = String(b.id || '');
      const l = await db.get(S.leads, id);
      if (!l) return json(404, { error: 'Not found.' });
      l.status = b.status === 'done' ? 'done' : 'new';
      await db.put(S.leads, id, l);
      return json(200, { ok: true });
    }
    if (action === 'lead-delete') {
      const id = String(b.id || '');
      if (!(await db.get(S.leads, id))) return json(404, { error: 'Not found.' });
      await db.del(S.leads, id);
      return json(200, { ok: true });
    }

    if (action === 'reviews') {
      const out = [];
      for (const k of await db.keys(S.reviews)) { const r = await db.get(S.reviews, k); if (r) { const c = await getCustomer(r.cid); out.push(Object.assign({}, r, { email: c ? c.email : '' })); } }
      out.sort((a, d) => (d.updatedAt || 0) - (a.updatedAt || 0));
      return json(200, { reviews: out });
    }
    if (action === 'review-approve') {
      const cid = String(b.cid || '');
      const r = await db.get(S.reviews, cid);
      if (!r) return json(404, { error: 'Not found.' });
      if (b.approved && !r.publish) return json(400, { error: 'This client did not allow their review to be shown publicly.' });
      r.approved = !!b.approved;
      await db.put(S.reviews, cid, r);
      return json(200, { ok: true });
    }
    if (action === 'review-delete') {
      const cid = String(b.cid || '');
      if (!(await db.get(S.reviews, cid))) return json(404, { error: 'Not found.' });
      await db.del(S.reviews, cid);
      return json(200, { ok: true });
    }

    if (action === 'upload') {
      const cid = String(b.cid || '');
      const c = await getCustomer(cid);
      if (!c) return json(404, { error: 'Customer not found.' });
      const title = cleanText(b.title, 80), month = cleanText(b.month, 30);
      if (title.length < 2) return json(400, { error: 'Please give the file a title.' });
      const buf = Buffer.from(String(b.data || ''), 'base64');
      if (!buf.length) return json(400, { error: 'No file received.' });
      if (buf.length > MAX_FILE) return json(413, { error: 'File is too big. Please keep it under 3.8 MB (compress the PDF).' });
      const kind = sniff(buf);
      if (!kind) return json(400, { error: 'Only PDF, PNG or JPG files are allowed.' });
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const base = (cleanText(b.filename, 80).replace(/\.[A-Za-z0-9]{1,5}$/, '') || title).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60);
      const d = { id, title, month, filename: base + '.' + kind.ext, type: kind.type, size: buf.length, uploadedAt: Date.now() };
      await db.putBin(S.files, cid + '/' + id, buf);
      const list = await getDeliveries(cid);
      list.push(d);
      await db.put(S.deliveries, cid, list);
      let emailed = false;
      if (b.notify && mailReady()) {
        try {
          const site = siteUrl();
          await sendMail({
            to: c.email, subject: 'Your ' + (month || 'new') + ' report is ready | Vigyapan Studio',
            html: shell({ preheader: 'Your report is ready to download', heading: 'Your report is ready',
              bodyHtml: '<p style="margin:0 0 12px">Hi ' + esc(String(c.name || 'there').split(' ')[0]) + ', your <b>' + esc(title) + '</b>' + (month ? ' for <b>' + esc(month) + '</b>' : '') + ' is ready.</p><p style="margin:0">Log in with this email address to download it. Your older reports stay saved there too.</p>',
              button: site ? { text: 'Open my dashboard', url: site + '/login' } : null }),
            text: 'Your ' + title + ' is ready. Log in to download it' + (site ? ': ' + site + '/login' : '.'), idemKey: 'vs-rdy-' + cid + '-' + id
          });
          emailed = true;
        } catch (e) { console.error('report-ready email failed', String(e)); }
      }
      return json(200, { ok: true, delivery: d, emailed });
    }

    if (action === 'delete-delivery') {
      const cid = String(b.cid || ''), id = String(b.id || '');
      const list = await getDeliveries(cid);
      if (!list.some((x) => x.id === id)) return json(404, { error: 'File not found.' });
      await db.put(S.deliveries, cid, list.filter((x) => x.id !== id));
      await db.del(S.files, cid + '/' + id);
      return json(200, { ok: true });
    }

    if (action === 'diagnose') {
      const has = (k) => !!process.env[k];
      const kid = process.env.RAZORPAY_KEY_ID || '';
      const checks = [
        { key: 'SESSION_SECRET', ok: authReady(), hint: 'Needed for login. At least 32 characters.' },
        { key: 'ADMIN_PASSWORD', ok: has('ADMIN_PASSWORD'), hint: 'Your admin page password.' },
        { key: 'RESEND_API_KEY', ok: has('RESEND_API_KEY'), hint: 'From resend.com. Needed for every email.' },
        { key: 'MAIL_FROM', ok: has('MAIL_FROM'), value: process.env.MAIL_FROM || '', hint: 'Looks like: Vigyapan Studio <hello@yourdomain.com>' },
        { key: 'SITE_URL', ok: !!siteUrl(), value: siteUrl(), hint: 'Looks like: https://yourdomain.com' },
        { key: 'RAZORPAY_KEY_ID', ok: has('RAZORPAY_KEY_ID'), value: kid ? (kid.startsWith('rzp_live_') ? 'LIVE mode keys' : kid.startsWith('rzp_test_') ? 'TEST mode keys' : 'unrecognised key') : '', hint: 'Payments.' },
        { key: 'RAZORPAY_KEY_SECRET', ok: has('RAZORPAY_KEY_SECRET'), hint: 'Payments.' },
        { key: 'RAZORPAY_WEBHOOK_SECRET', ok: has('RAZORPAY_WEBHOOK_SECRET'), hint: 'The Razorpay backup notification.' }
      ];
      const out = { checks };
      if (b.sendTest) {
        const to = process.env.OWNER_EMAIL || SELLER.email;
        if (!mailReady()) out.test = { ok: false, to, error: 'RESEND_API_KEY or MAIL_FROM is missing, so no email can be sent.' };
        else {
          try {
            await sendMail({ to, subject: 'Test email from your Vigyapan Studio website', html: shell({ preheader: 'Test email', heading: 'Your email setup works', bodyHtml: '<p style="margin:0">If you can read this, login codes, invoices and reminders can reach your customers.</p>' }), text: 'Your email setup works.' });
            out.test = { ok: true, to };
          } catch (e) { out.test = { ok: false, to, error: String((e && e.message) || e).slice(0, 400) }; }
        }
      }
      return json(200, out);
    }

    if (action === 'lookup') {
      const email = normEmail(b.email);
      if (!email) return json(400, { error: 'Type an email address.' });
      const c = await getCustomer(cidOf(email));
      if (!c) return json(200, { found: false });
      const pays = await getPayments(c.cid);
      const m = computeMembership(pays, Date.now());
      return json(200, { found: true, name: c.name, payments: pays.length, status: m ? m.status : 'none', expiresAt: m ? m.expiresAt : 0 });
    }

    if (action === 'add-payment') {
      const pid = String(b.paymentId || '').trim();
      if (!/^pay_[A-Za-z0-9]{6,30}$/.test(pid)) return json(400, { error: 'A payment ID looks like pay_AbCd1234xyz. Copy it from Razorpay, Transactions, Payments.' });
      const r = await processPaidPayment(pid, { sendEmails: !!b.sendEmails });
      if (!r.ok || !r.recorded) return json(422, { error: 'Could not add it: ' + (r.reason || 'the payment was not saved') + '. Only paid (captured) payments can be added.' });
      return json(200, { ok: true });
    }
    return json(400, { error: 'Unknown request.' });
  } catch (e) {
    console.error('admin error', action, String(e));
    return json(500, { error: 'Something went wrong. Please try again.' });
  }
};
