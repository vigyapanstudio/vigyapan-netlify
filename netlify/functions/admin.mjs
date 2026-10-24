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
import { siteUrl, esc, cleanText, WHATSAPP, SELLER, DAY, CHECK_PRICE, CHECK_HOURS, BASE_PRICE, inr, istDate } from '../lib/config.mjs';
import { listThreads, getThread, addFromAdmin, markSeenByAdmin } from '../lib/messages.mjs';
import { listCoupons, saveCoupon, getCoupon } from '../lib/coupons.mjs';
import { getAddons, allAddons, setAddonStatus } from '../lib/addons.mjs';
import { listCarts } from '../lib/carts.mjs';
import { isUnsub, unsubUrl } from '../lib/prefs.mjs';
import { waNotifyReady, waReady, waTemplates, sendTemplate } from '../lib/whatsapp.mjs';
import { lastFestivalDate } from '../lib/festivals.mjs';
import { parsePromo } from '../lib/pricing.mjs';

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
      const stats = { total: 0, active: 0, ending: 0, expired: 0, revenue: 0, revenue30: 0, checks: 0, checksWaiting: 0 };
      for (const c of customers) {
        const pays = await getPayments(c.cid);
        const m = computeMembership(pays, now);
        const dl = await getDeliveries(c.cid);
        const paid = pays.reduce((s, p) => s + p.amount, 0);
        stats.total++; stats.revenue += paid;
        pays.forEach((p) => { if (now - p.paidAt < 30 * 86400000) stats.revenue30 += p.amount; });
        if (m) stats[m.status]++;
        const lastCheck = pays.filter((p) => p.product === 'check').reduce((mx, p) => Math.max(mx, p.paidAt), 0);
        const checkWaiting = lastCheck && !dl.some((d) => d.uploadedAt >= lastCheck);   // paid for a Quick Page Check, nothing delivered yet
        if (lastCheck) stats.checks++;
        if (checkWaiting) stats.checksWaiting++;
        rows.push({
          cid: c.cid, name: c.name, email: c.email, phone: c.phone, ig: c.ig, biz: c.biz,
          status: m ? m.status : (pays.length ? 'check' : 'none'), checkDue: checkWaiting ? lastCheck + CHECK_HOURS * 3600000 : 0, expiresAt: m ? m.expiresAt : 0, daysLeft: m ? m.daysLeft : 0,
          payments: pays.length, totalPaid: paid, deliveries: dl.length,
          lastDelivery: dl.reduce((mx, d) => Math.max(mx, d.uploadedAt), 0), hasNote: !!c.nextNote
        });
      }
      rows.sort((a, c) => (a.expiresAt || 0) - (c.expiresAt || 0));
      let newLeads = 0, pendingReviews = 0;
      for (const k of await db.keys(S.leads)) { const l = await db.get(S.leads, k); if (l && l.status === 'new') newLeads++; }
      for (const k of await db.keys(S.reviews)) { const r = await db.get(S.reviews, k); if (r && r.publish && !r.approved) pendingReviews++; }
      stats.newLeads = newLeads; stats.pendingReviews = pendingReviews;
      let newEnq = 0, activeProjects = 0;
      for (const k of await db.keys(S.enquiries)) { const e = await db.get(S.enquiries, k); if (e && e.status === 'new') newEnq++; }
      for (const k of await db.keys(S.projects)) { const pr = await db.get(S.projects, k); if (pr && ['accepted', 'building', 'testing'].includes(pr.status)) activeProjects++; }
      stats.newEnquiries = newEnq; stats.activeProjects = activeProjects;
      stats.unreadMessages = (await listThreads()).filter((t) => t.unreadAdmin).length;
      stats.newAddons = (await allAddons()).filter((a) => a.status !== 'done').length;
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
        payments: pays.slice().reverse().map((p) => ({ paymentId: p.paymentId, invoiceNo: invoiceNumber(p.raw), amount: p.amount, paidAt: p.paidAt, bump: p.bump, renewal: p.renewal, months: p.product === 'check' ? 0 : (p.months || 1), check: p.product === 'check', promo: p.promo || '' })),
        quick: c.check || null,
        deliveries: (await getDeliveries(cid)).slice().sort((a, d) => d.uploadedAt - a.uploadedAt),
        addons: (await getAddons(cid)).map((a) => ({ paymentId: a.paymentId, items: a.items.map((i) => i.name), amount: a.amount, paidAt: a.paidAt, status: a.status })),
        prefs: { emailsOff: await isUnsub(c.email), waOptIn: !!c.waOptIn },
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
      const carts = (await listCarts()).map((c) => ({ rid: c.rid, name: c.name, phone: c.phone, email: c.email, ig: c.ig, type: c.type, total: c.total, months: c.months, updatedAt: c.updatedAt, emailedAt: c.emailedAt || 0 }));
      return json(200, { leads: out.slice(0, 300), carts: carts.slice(0, 200) });
    }
    if (action === 'enquiries') {
      const out = [];
      for (const k of await db.keys(S.enquiries)) { const e = await db.get(S.enquiries, k); if (e) out.push(e); }
      out.sort((x, y) => y.createdAt - x.createdAt);
      return json(200, { enquiries: out.slice(0, 300) });
    }
    if (action === 'enquiry-status') {
      const id = String(b.id || '');
      const e = await db.get(S.enquiries, id);
      if (!e) return json(404, { error: 'Not found.' });
      e.status = b.status === 'done' ? 'done' : 'new';
      await db.put(S.enquiries, id, e);
      return json(200, { ok: true });
    }
    if (action === 'enquiry-delete') {
      const id = String(b.id || '');
      if (!(await db.get(S.enquiries, id))) return json(404, { error: 'Not found.' });
      await db.del(S.enquiries, id);
      return json(200, { ok: true });
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
      const pays = await getPayments(cid), onlyCheck = pays.length && !computeMembership(pays, Date.now());
      const creditLive = onlyCheck && c.check && !c.check.used && c.check.until > Date.now();
      if (b.notify && mailReady() && onlyCheck) {
        // Quick Page Check delivery: also offers the full plan, with the check price credited.
        try {
          const site = siteUrl();
          const full = BASE_PRICE - CHECK_PRICE;
          await sendMail({
            to: c.email, subject: 'Your Quick Page Check is ready | Vigyapan Studio',
            html: shell({ preheader: 'Your 1-page report and 3 fixes are ready', heading: 'Your Quick Page Check is ready',
              bodyHtml: '<p style="margin:0 0 12px">Hi ' + esc(String(c.name || 'there').split(' ')[0]) + ', your <b>' + esc(title) + '</b> is ready. Log in with this email address to download it.</p>' +
                (creditLive ? '<p style="margin:0 0 12px"><b>Want the full picture?</b> The full Growth Report with a 30-day content plan is ' + inr(BASE_PRICE) + '. Because you did a Quick Page Check, <b>' + inr(CHECK_PRICE) + ' is credited: you pay ' + inr(full) + '</b>. Open your dashboard and tap the button there. This credit is yours until ' + istDate(c.check.until) + '.</p>' : '') +
                '<p style="margin:0">Start with the 3 fixes in your report: they are quick to do.</p>',
              button: site ? { text: creditLive ? 'Get the full plan for ' + inr(full) : 'Open my dashboard', url: site + '/login' } : null }),
            text: 'Your ' + title + ' is ready. Log in to download it' + (site ? ': ' + site + '/login' : '.') + (creditLive ? ' The full plan is ' + inr(full) + ' for you (' + inr(CHECK_PRICE) + ' credited).' : ''), idemKey: 'vs-rdy-' + cid + '-' + id
          });
          emailed = true;
        } catch (e) { console.error('check-ready email failed', String(e)); }
      } else if (b.notify && mailReady()) {
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
      let whatsapped = false;
      if (b.notify) whatsapped = await waNotifyReady(c);
      return json(200, { ok: true, delivery: d, emailed, whatsapped });
    }

    if (action === 'delete-delivery') {
      const cid = String(b.cid || ''), id = String(b.id || '');
      const list = await getDeliveries(cid);
      if (!list.some((x) => x.id === id)) return json(404, { error: 'File not found.' });
      await db.put(S.deliveries, cid, list.filter((x) => x.id !== id));
      await db.del(S.files, cid + '/' + id);
      return json(200, { ok: true });
    }


    // ---- messages (questions from clients) ----
    if (action === 'messages') {
      const out = [];
      for (const t of await listThreads()) {
        const c = await getCustomer(t.cid);
        const last = t.msgs[t.msgs.length - 1];
        out.push({ cid: t.cid, name: c ? c.name : '', email: c ? c.email : '', ig: c ? c.ig : '', unread: !!t.unreadAdmin, updatedAt: t.updatedAt, last: last ? last.text.slice(0, 120) : '', lastFrom: last ? last.from : '' });
      }
      return json(200, { threads: out });
    }
    if (action === 'msg-thread') {
      const cid = String(b.cid || '');
      const c = await getCustomer(cid);
      if (!c) return json(404, { error: 'Customer not found.' });
      const t = await getThread(cid);
      await markSeenByAdmin(cid);
      return json(200, { name: c.name, email: c.email, ig: c.ig, phone: c.phone, msgs: t.msgs });
    }
    if (action === 'msg-reply') {
      const cid = String(b.cid || '');
      const c = await getCustomer(cid);
      if (!c) return json(404, { error: 'Customer not found.' });
      const text = cleanText(b.text, 1000);
      if (text.length < 2) return json(400, { error: 'Type your reply first.' });
      const t = await addFromAdmin(cid, text);
      let emailed = false;
      if (mailReady()) {
        try {
          const site = siteUrl();
          await sendMail({ to: c.email, subject: 'Reply from Vigyapan Studio',
            html: shell({ preheader: text.slice(0, 80), heading: 'We replied to your question',
              bodyHtml: '<p style="margin:0 0 12px;white-space:pre-wrap">' + esc(text) + '</p><p style="margin:0;color:#7a948f;font-size:13px">You can reply from your dashboard, or just reply to this email.</p>',
              button: site ? { text: 'Open my dashboard', url: site + '/login' } : null }),
            text: text + (site ? '\n\nDashboard: ' + site + '/login' : ''), idemKey: 'vs-msg-' + cid + '-' + t.updatedAt });
          emailed = true;
        } catch (e) { console.error('reply email failed', String(e)); }
      }
      return json(200, { ok: true, emailed });
    }

    // ---- discount codes ----
    if (action === 'coupons') return json(200, { coupons: await listCoupons() });
    if (action === 'coupon-save') {
      const r = await saveCoupon(b);
      return r.error ? json(400, { error: r.error }) : json(200, { ok: true, coupon: r.coupon });
    }
    if (action === 'coupon-toggle') {
      const c = await getCoupon(b.code);
      if (!c) return json(404, { error: 'Not found.' });
      c.active = !!b.active; await db.put(S.coupons, c.code, c);
      return json(200, { ok: true });
    }
    if (action === 'coupon-delete') {
      const c = await getCoupon(b.code);
      if (!c) return json(404, { error: 'Not found.' });
      if (c.builtIn) return json(400, { error: 'This is a built-in pop-up code. Switch it Off instead of deleting it.' });
      await db.del(S.coupons, c.code);
      return json(200, { ok: true });
    }

    // ---- add-on orders ----
    if (action === 'addon-status') {
      const a = await setAddonStatus(String(b.cid || ''), String(b.paymentId || ''), b.status);
      if (!a) return json(404, { error: 'Not found.' });
      let emailed = false;
      if (a.status === 'done' && b.notify && mailReady()) {
        const c = await getCustomer(a.cid);
        try {
          const site = siteUrl();
          await sendMail({ to: a.email, subject: 'Your add-on is ready | Vigyapan Studio',
            html: shell({ preheader: 'Your add-on is ready', heading: 'Your add-on is ready',
              bodyHtml: '<p style="margin:0 0 12px">Hi ' + esc(String((c && c.name) || 'there').split(' ')[0]) + ', your <b>' + esc(a.items.map((i) => i.name).join(', ')) + '</b> is ready. Log in to download it from your dashboard.</p>',
              button: site ? { text: 'Open my dashboard', url: site + '/login' } : null }),
            text: 'Your add-on is ready. Log in to download it' + (site ? ': ' + site + '/login' : '.'), idemKey: 'vs-addone-' + a.paymentId });
          emailed = true;
        } catch (e) { console.error('add-on ready email failed', String(e)); }
      }
      return json(200, { ok: true, emailed });
    }

    if (action === 'addons-list') {
      const out = [];
      for (const a of await allAddons()) { const c = await getCustomer(a.cid); out.push({ cid: a.cid, paymentId: a.paymentId, name: c ? c.name : '', ig: c ? c.ig : '', email: a.email, phone: c ? c.phone : '', items: a.items.map((i) => i.name), amount: a.amount, paidAt: a.paidAt, status: a.status }); }
      out.sort((x, y) => (x.status === y.status ? y.paidAt - x.paidAt : x.status === 'new' ? -1 : 1));
      return json(200, { addons: out });
    }
    // ---- charts and numbers ----
    if (action === 'insights') return json(200, await buildInsights());

    // ---- downloads (CSV opens in Excel / Google Sheets) ----
    if (action === 'export') return json(200, await buildExport(String(b.what || 'customers')));

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
        { key: 'RAZORPAY_WEBHOOK_SECRET', ok: has('RAZORPAY_WEBHOOK_SECRET'), hint: 'The Razorpay backup notification.' },
        { key: 'META_PIXEL_ID', ok: has('META_PIXEL_ID') || undefined, optional: true, value: process.env.META_PIXEL_ID || '', hint: 'Optional. Your Meta Pixel ID (digits) for ad tracking.' },
        { key: 'WHATSAPP_TOKEN + WHATSAPP_PHONE_ID', ok: waReady() || undefined, optional: true, hint: 'Optional. Turns on automatic WhatsApp messages (Meta WhatsApp Business API).' },
        { key: 'WHATSAPP_TPL_ENDING / WHATSAPP_TPL_READY', ok: (waTemplates().ending && waTemplates().ready) || undefined, optional: true, value: [waTemplates().ending, waTemplates().ready].filter(Boolean).join(', '), hint: 'Names of your approved WhatsApp templates.' }
      ];
      const festEnd = lastFestivalDate();
      if (festEnd < new Date(Date.now() + 120 * DAY).toISOString().slice(0, 10)) checks.push({ key: 'Festival calendar', ok: false, value: 'ends ' + festEnd, hint: 'Add next year’s festival dates in netlify/lib/festivals.mjs.' });
      const out = { checks };
      if (b.sendWaTest) {
        const to = String(b.sendWaTest).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
        const r = await sendTemplate(to, waTemplates().ready, [SELLER.proprietor.split(' ')[0]]).catch((e) => ({ ok: false, reason: String(e) }));
        out.waTest = r;
      }
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


// ---------------------------------------------------------------- numbers for the Insights tab
const istMonth = (ms) => new Date(ms + 19800000).toISOString().slice(0, 7);
const monthLabel = (key) => new Date(key + '-15T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });

async function buildInsights() {
  const now = Date.now();
  const customers = await listCustomers();
  const addonRows = await allAddons();
  const keys = []; // last 12 months, oldest first
  { const d = new Date(now + 19800000); d.setUTCDate(1); for (let i = 11; i >= 0; i--) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)); keys.push(x.toISOString().slice(0, 7)); } }
  const months = {}; keys.forEach((k) => { months[k] = { key: k, label: monthLabel(k), plans: 0, addons: 0, orders: 0, newCustomers: 0 }; });
  const status = { active: 0, ending: 0, expired: 0 }, types = {}, discounts = { total: 0, byKind: {}, byCode: {} };
  let revenue = 0, orders = 0, eligible = 0, renewed = 0, friends = 0, credits = 0, wa = 0, off = 0;
  const quick = { sold: 0, upgraded: 0 };
  const phones = new Set(), emails = new Set();
  for (const c of customers) {
    const pays = await getPayments(c.cid);
    const m = computeMembership(pays, now);
    if (m) status[m.status] = (status[m.status] || 0) + 1;
    phones.add(c.phone); emails.add(c.email);
    types[c.type || 'Not given'] = (types[c.type || 'Not given'] || 0) + 1;
    friends += (c.referred || []).length; credits += c.credits || 0; if (c.waOptIn) wa++;
    if (await isUnsub(c.email)) off++;
    const planPays = pays.filter((p) => p.product !== 'check');
    if (pays.some((p) => p.product === 'check')) { quick.sold++; if (planPays.length) quick.upgraded++; }
    if (planPays.length) {
      const k0 = istMonth(planPays[0].paidAt); if (months[k0]) months[k0].newCustomers++;
      if (now - planPays[0].paidAt >= 30 * DAY) { eligible++; if (planPays.length > 1) renewed++; }
    }
    pays.forEach((p) => {
      revenue += p.amount; orders++;
      const k = istMonth(p.paidAt); if (months[k]) { months[k].plans += p.amount; months[k].orders++; }
      if (p.promo) { const amt = p.promoAmt || (parsePromo((p.notes || {}).promo) || {}).amount || 0; discounts.total += amt; discounts.byKind[p.promo] = (discounts.byKind[p.promo] || 0) + amt; if (p.promoCode && p.promo === 'coupon') discounts.byCode[p.promoCode] = (discounts.byCode[p.promoCode] || 0) + amt; }
    });
  }
  const addonItems = {}; let addonRevenue = 0;
  addonRows.forEach((a) => { addonRevenue += a.amount; const k = istMonth(a.paidAt); if (months[k]) { months[k].addons += a.amount; months[k].orders++; } a.items.forEach((i) => { addonItems[i.name] = (addonItems[i.name] || 0) + 1; }); });
  let leads = 0, converted = 0, manage = 0;
  for (const k of await db.keys(S.leads)) {
    const l = await db.get(S.leads, k); if (!l) continue;
    if (l.kind === 'manage') { manage++; continue; }
    leads++; if ((l.email && emails.has(String(l.email).toLowerCase())) || (l.phone && phones.has(l.phone))) converted++;
  }
  const series = keys.map((k) => months[k]);
  const last30 = series.length ? series[series.length - 1] : null;
  return {
    series, status, revenue, addonRevenue, orders, quick: { sold: quick.sold, upgraded: quick.upgraded, rate: quick.sold ? Math.round(quick.upgraded / quick.sold * 100) : 0 }, customers: customers.length,
    avgOrder: orders ? Math.round(revenue / orders) : 0,
    renewal: { eligible, renewed, rate: eligible ? Math.round(renewed / eligible * 100) : 0 },
    leads: { total: leads, converted, rate: leads ? Math.round(converted / leads * 100) : 0, manage },
    openCarts: (await listCarts()).filter((c) => !c.emailedAt || now - c.updatedAt < 3 * DAY).length,
    referral: { friends, credits }, discounts,
    types: Object.keys(types).map((k) => ({ name: k, n: types[k] })).sort((a, b) => b.n - a.n),
    addonItems: Object.keys(addonItems).map((k) => ({ name: k, n: addonItems[k] })).sort((a, b) => b.n - a.n),
    waOptIn: wa, emailsStopped: off, thisMonth: last30
  };
}

// ---------------------------------------------------------------- CSV downloads
const csvCell = (v) => {
  let t = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;                 // stops Excel from running formulas typed by customers
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
};
const csv = (head, rows) => '\ufeff' + [head].concat(rows).map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
const istStamp = (ms) => (ms ? new Date(ms + 19800000).toISOString().slice(0, 16).replace('T', ' ') : '');

async function buildExport(what) {
  const day = istStamp(Date.now()).slice(0, 10);
  const now = Date.now();
  if (what === 'customers') {
    const rows = [];
    for (const c of await listCustomers()) {
      const pays = await getPayments(c.cid), m = computeMembership(pays, now), ad = await getAddons(c.cid);
      rows.push([c.name, c.email, c.phone, '@' + c.ig, c.biz, c.type, c.city, c.followers, c.goal, m ? m.status : 'none', m ? istStamp(m.expiresAt).slice(0, 10) : '',
        pays.length, pays.reduce((t, p) => t + p.amount, 0), ad.reduce((t, a) => t + a.amount, 0), c.refCode || '', c.credits || 0, c.waOptIn ? 'yes' : 'no', (await isUnsub(c.email)) ? 'yes' : 'no', istStamp(c.createdAt).slice(0, 10)]);
    }
    return { filename: 'vigyapan-customers-' + day + '.csv', csv: csv(['Name', 'Email', 'WhatsApp', 'Instagram', 'Business', 'Type', 'City', 'Followers', 'Goal', 'Plan status', 'Plan ends', 'Payments', 'Total paid (Rs)', 'Add-ons paid (Rs)', 'Referral code', 'Referral credits', 'WhatsApp updates', 'Emails stopped', 'Customer since'], rows) };
  }
  if (what === 'payments') {
    const rows = [];
    for (const c of await listCustomers()) {
      for (const p of await getPayments(c.cid)) rows.push([istStamp(p.paidAt), invoiceNumber(p.raw), p.product === 'check' ? 'Quick Page Check' : 'Plan', c.name, c.email, p.amount, p.product === 'check' ? '' : (p.months || 1), p.product === 'check' ? '' : (p.upgrade ? 'upgrade' : p.renewal ? 'renewal' : 'first'), p.bump ? 'yes' : 'no', p.promo || '', p.promoCode || '', p.promoAmt || '', p.method, p.paymentId]);
      for (const a of await getAddons(c.cid)) rows.push([istStamp(a.paidAt), invoiceNumber(a.raw), 'Add-on', c.name, c.email, a.amount, '', '', '', '', '', '', a.method, a.paymentId + ' (' + a.items.map((i) => i.name).join(' + ') + ')']);
    }
    rows.sort((x, y) => (x[0] < y[0] ? 1 : -1));
    return { filename: 'vigyapan-sales-' + day + '.csv', csv: csv(['Date (IST)', 'Invoice', 'Kind', 'Customer', 'Email', 'Amount (Rs)', 'Months', 'First/renewal', 'Reel add-on', 'Discount type', 'Discount code', 'Discount (Rs)', 'Method', 'Payment ID'], rows) };
  }
  if (what === 'leads') {
    const rows = [];
    for (const k of await db.keys(S.leads)) { const l = await db.get(S.leads, k); if (l) rows.push([istStamp(l.createdAt), l.kind === 'manage' ? 'Manage my page' : 'Free audit', l.name, l.phone, l.email || '', l.ig ? '@' + l.ig : '', l.type || '', l.status, l.note || '']); }
    rows.sort((x, y) => (x[0] < y[0] ? 1 : -1));
    return { filename: 'vigyapan-leads-' + day + '.csv', csv: csv(['Date (IST)', 'Kind', 'Name', 'WhatsApp', 'Email', 'Instagram', 'Business type', 'Status', 'Note'], rows) };
  }
  return { filename: 'empty.csv', csv: '' };
}
