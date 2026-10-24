// Client projects: quotation + agreement, invoices for each payment, weekly progress emails.
// Used by netlify/functions/projects.mjs (your admin) and netlify/functions/project-doc.mjs (the page your client opens).
import * as db from './db.mjs';
import { STORES as S } from './db.mjs';
import { SELLER, esc, inr, istDate, siteUrl, cleanText, DAY } from './config.mjs';
import { makeToken, readToken, authReady } from './auth.mjs';
import { sendMail, shell, mailReady } from './mail.mjs';

export const STATUSES = [
  ['quote', 'Quotation sent'], ['accepted', 'Accepted'], ['building', 'Building'],
  ['testing', 'Testing'], ['delivered', 'Delivered'], ['closed', 'Closed']
];
export const KINDS = { website: 'Business website', tool: 'Custom business tool', care: 'Monthly care plan', other: 'Other project' };
export const PAY_KINDS = { advance: 'Advance', final: 'Final payment', other: 'Payment' };
export const METHODS = { upi: 'UPI', bank: 'Bank transfer', cash: 'Cash', cheque: 'Cheque', razorpay: 'Razorpay link', other: 'Other' };
export const STEP_NAMES = ['Planning', 'Building', 'Testing', 'Delivered'];
export const stepOf = (status) => ({ quote: 1, accepted: 1, building: 2, testing: 3, delivered: 4, closed: 4 })[status] || 1;

// The default terms. You can edit them for each project before you send the quotation.
export const DEFAULT_TERMS = [
  'Payment: the advance is paid before we start, and the balance is paid when we deliver and before the website or tool goes live. We send an invoice for every payment.',
  'Time: the delivery time starts on the day we receive the advance and everything we need from you (for example your logo, photos, text and details). If you are late in sending these, the delivery date moves by the same number of days.',
  'Changes: two rounds of small changes (for example text, colours, images, small layout changes) are included. New features or big changes that are not in the list above are quoted separately, and we only start them after you agree.',
  'Free fixes: for 15 days after delivery we fix, free of charge, anything we built that is not working as agreed.',
  'Ownership: once the full payment is received, the finished website or tool belongs to you.',
  'Extra costs: domain name, hosting and any paid services (such as an SMS or WhatsApp provider) are paid by you at actual cost, and we tell you the amount before we buy anything for you.',
  'Cancelling: if you cancel after the work has started, the advance is kept for the work already done, and any part that has not been used is returned.',
  'Our portfolio: we may show screenshots of the finished work (never your private data) on our website and Instagram. Tell us if you do not want this.',
  'After delivery: for regular updates and support, you can choose our Monthly Care Plan.'
];

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const lines = (v, maxLines, maxLen) => (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map((x) => cleanText(x, maxLen || 200)).filter(Boolean).slice(0, maxLines || 20);

export async function getProject(id) { return id ? await db.get(S.projects, String(id)) : null; }
export async function saveProject(p) { p.updatedAt = Date.now(); await db.put(S.projects, p.id, p); return p; }
export async function listProjects() {
  const out = [];
  for (const k of await db.keys(S.projects)) { const p = await db.get(S.projects, k); if (p) out.push(p); }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export const paidTotal = (p) => (p.payments || []).reduce((s, x) => s + x.amount, 0);
export const advanceAmount = (p) => Math.round(p.price * (p.advancePct || 50) / 100);
export const balanceDue = (p) => Math.max(0, p.price - paidTotal(p));
export const quoteNo = (p) => { const d = new Date(p.createdAt + 5.5 * 3600000); return 'VQ-' + String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + p.id.slice(-4).toUpperCase(); };
export const invoiceNo = (pay) => { const d = new Date(pay.paidAt + 5.5 * 3600000); return 'VS-' + String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + pay.id.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase(); };
export const validUntil = (p) => (p.quoteSentAt || p.createdAt) + 15 * DAY;

// ----- links the client can open (signed, no login needed) -----
export function docToken(p, type, payId) {
  if (!authReady()) return '';
  return makeToken({ p: p.id, t: type, i: payId || '', x: Date.now() + 120 * DAY });
}
export function docUrl(p, type, payId) {
  const site = siteUrl(); const t = docToken(p, type, payId);
  return site && t ? site + '/api/project-doc?t=' + encodeURIComponent(t) : '';
}
export const readDocToken = (t) => { const o = readToken(t); return o && o.p ? o : null; };

// ----- the printable page (quotation, or invoice for one payment) -----
const css = '*{box-sizing:border-box}body{margin:0;background:#eef3f1;color:#10211f;font-family:Arial,Helvetica,sans-serif;line-height:1.55}.sheet{max-width:820px;margin:24px auto;background:#fff;border:1px solid #dfe8e4;border-radius:14px;overflow:hidden}.hd{background:#06201F;color:#fff;padding:22px 28px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start}.hd b{color:#FFB72B;font-size:22px}.hd small{display:block;color:#9DBFB9;font-size:13px}.hd .no{text-align:right;font-size:13px;color:#cfe3de}.hd .no strong{display:block;font-size:18px;color:#fff;letter-spacing:.04em}.bd{padding:24px 28px}h1{font-size:24px;margin:0 0 4px}h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b8a84;margin:26px 0 8px}.two{display:grid;grid-template-columns:1fr 1fr;gap:20px}.two div{font-size:14px}ul{margin:0;padding-left:20px}li{margin:3px 0}table{width:100%;border-collapse:collapse}td,th{padding:10px 0;border-bottom:1px solid #e6ece9;font-size:15px;text-align:left}td.r,th.r{text-align:right;white-space:nowrap}.tot td{font-weight:700;border-bottom:2px solid #10211f;font-size:17px}.terms li{font-size:13.5px;color:#33504b;margin:6px 0}.note{background:#fff7e0;border-radius:10px;padding:12px 14px;font-size:14px;color:#5a4300;margin-top:18px}.ok{background:#e9f8f1;border:1px solid #9be0c4;color:#0b5a40;border-radius:10px;padding:12px 14px;font-size:14px;margin-top:18px}.paid{display:inline-block;border:3px solid #0b7a5a;color:#0b7a5a;font-weight:700;letter-spacing:.1em;padding:4px 14px;border-radius:8px;transform:rotate(-4deg);font-size:18px}.ft{padding:16px 28px 26px;font-size:12px;color:#6b8a84;border-top:1px solid #e6ece9}.acc{margin-top:20px;border:2px dashed #b9cdc7;border-radius:12px;padding:16px}.acc label{display:block;font-size:14px;margin:8px 0}.acc input[type=text]{width:100%;padding:11px 12px;border:1px solid #b9cdc7;border-radius:9px;font-size:16px}.acc button,.pr{background:#FFB72B;color:#2A1A00;border:0;border-radius:11px;padding:13px 22px;font-size:16px;font-weight:700;cursor:pointer;margin-top:8px}.bar{max-width:820px;margin:16px auto 0;padding:0 12px;text-align:right}.msg{font-size:14px;margin-top:8px}@media(max-width:620px){.two{grid-template-columns:1fr}.hd .no{text-align:left}}@media print{body{background:#fff}.sheet{border:0;margin:0}.bar,.acc button,.noprint{display:none!important}}';

function party(p) {
  const c = p.client || {};
  return '<b>' + esc(c.name || '') + '</b>' + (c.business ? '<br>' + esc(c.business) : '') + (c.email ? '<br>' + esc(c.email) : '') + (c.phone ? '<br>+91 ' + esc(c.phone) : '');
}
function seller() {
  const gst = process.env.INVOICE_GSTIN ? '<br>GSTIN: ' + esc(process.env.INVOICE_GSTIN) : '';
  return '<b>' + esc(SELLER.name) + '</b><br>Proprietor: ' + esc(SELLER.proprietor) + '<br>' + esc(SELLER.place) + '<br>' + esc(SELLER.email) + '<br>' + esc(SELLER.phone) + '<br>Udyam Reg. No.: ' + esc(SELLER.udyam) + gst;
}
const payNote = () => esc(process.env.PAYMENT_NOTE || 'You can pay by UPI or bank transfer. We will share our payment details on request, and send an invoice for every payment.');
const head = (title, no, label) => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(title) + '</title><style>' + css + '</style></head><body>';

export function renderQuote(p, { forClient, token } = {}) {
  const adv = advanceAmount(p), bal = p.price - adv;
  const inc = (p.scope || []).map((x) => '<li>' + esc(x) + '</li>').join('') || '<li>As discussed with you</li>';
  const exc = (p.exclusions || []).map((x) => '<li>' + esc(x) + '</li>').join('');
  const terms = (p.terms && p.terms.length ? p.terms : DEFAULT_TERMS).map((x) => '<li>' + esc(x) + '</li>').join('');
  let acc = '';
  if (p.acceptedAt) {
    acc = '<div class="ok"><b>Accepted</b> by ' + esc(p.acceptedBy || (p.client && p.client.name) || 'the client') + ' on ' + esc(istDate(p.acceptedAt, true)) + (p.acceptedVia ? ' (' + esc(p.acceptedVia) + ')' : '') + '. Thank you!</div>';
  } else if (forClient && token) {
    acc = '<form class="acc" id="af"><b>To accept this quotation</b><label>Type your full name <input type="text" id="an" maxlength="80" autocomplete="name"></label>' +
      '<label><input type="checkbox" id="ag"> I have read this quotation and the terms, and I agree to them.</label>' +
      '<button type="submit">I accept</button><div class="msg" id="am" role="status"></div></form>' +
      '<script>document.getElementById("af").addEventListener("submit",function(e){e.preventDefault();var m=document.getElementById("am");var n=document.getElementById("an").value.trim();if(n.length<2){m.textContent="Please type your full name.";return;}if(!document.getElementById("ag").checked){m.textContent="Please tick the box to agree.";return;}m.textContent="Saving…";fetch("/api/project-doc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({t:' + JSON.stringify(token) + ',name:n,agree:true})}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});}).then(function(x){if(x.ok){location.reload();}else{m.textContent=x.j.error||"Could not save. Please message us on WhatsApp.";}}).catch(function(){m.textContent="Could not save. Please message us on WhatsApp.";});});</script>';
  }
  return head('Quotation ' + quoteNo(p)) +
    (forClient ? '<div class="bar"><button class="pr" onclick="window.print()">Print or save as PDF</button></div>' : '') +
    '<div class="sheet"><div class="hd"><div><b>' + esc(SELLER.name) + '</b><small>' + esc(SELLER.instagram) + ' · ' + esc(SELLER.place) + '</small></div><div class="no">QUOTATION<strong>' + esc(quoteNo(p)) + '</strong>Date: ' + esc(istDate(p.quoteSentAt || p.createdAt)) + '<br>Valid until: ' + esc(istDate(validUntil(p))) + '</div></div>' +
    '<div class="bd"><h1>' + esc(p.title) + '</h1><div style="color:#6b8a84;font-size:14px">' + esc(KINDS[p.kind] || '') + '</div>' +
    '<div class="two" style="margin-top:20px"><div><h2 style="margin-top:0">Prepared for</h2>' + party(p) + '</div><div><h2 style="margin-top:0">From</h2>' + seller() + '</div></div>' +
    '<h2>What is included</h2><ul>' + inc + '</ul>' +
    (exc ? '<h2>What is not included</h2><ul>' + exc + '</ul>' : '') +
    '<h2>Price and payment</h2><table><tr><td>Project price</td><td class="r">' + inr(p.price) + '</td></tr>' +
    '<tr><td>Advance (' + (p.advancePct || 50) + '%), paid before we start</td><td class="r">' + inr(adv) + '</td></tr>' +
    '<tr><td>Balance, paid on delivery and before it goes live</td><td class="r">' + inr(bal) + '</td></tr>' +
    '<tr class="tot"><td>Total</td><td class="r">' + inr(p.price) + '</td></tr></table>' +
    '<div class="note"><b>Delivery:</b> ' + esc(String(p.deliveryDays || 14)) + ' days after we receive the advance and the details we need from you.<br>' + payNote() + '</div>' +
    '<h2>Terms</h2><ol class="terms" style="margin:0;padding-left:20px">' + terms + '</ol>' + acc + '</div>' +
    '<div class="ft">' + esc(SELLER.name) + ' (Proprietor: ' + esc(SELLER.proprietor) + '), ' + esc(SELLER.place) + ' · Udyam Reg. No.: ' + esc(SELLER.udyam) + '</div></div></body></html>';
}

export function renderInvoice(p, pay, { forClient } = {}) {
  const paid = paidTotal(p), bal = Math.max(0, p.price - paid);
  const label = (PAY_KINDS[pay.kind] || 'Payment') + ' for ' + p.title;
  return head('Invoice ' + invoiceNo(pay)) +
    (forClient ? '<div class="bar"><button class="pr" onclick="window.print()">Print or save as PDF</button></div>' : '') +
    '<div class="sheet"><div class="hd"><div><b>' + esc(SELLER.name) + '</b><small>' + esc(SELLER.instagram) + ' · ' + esc(SELLER.place) + '</small></div><div class="no">INVOICE / RECEIPT<strong>' + esc(invoiceNo(pay)) + '</strong>Date: ' + esc(istDate(pay.paidAt)) + '</div></div>' +
    '<div class="bd"><div class="paid">PAID</div>' +
    '<div class="two" style="margin-top:18px"><div><h2 style="margin-top:0">Billed to</h2>' + party(p) + '</div><div><h2 style="margin-top:0">From</h2>' + seller() + '</div></div>' +
    '<h2>Details</h2><table><tr><th>Description</th><th class="r">Amount</th></tr><tr><td>' + esc(label) + '</td><td class="r">' + inr(pay.amount) + '</td></tr><tr class="tot"><td>Total paid</td><td class="r">' + inr(pay.amount) + '</td></tr></table>' +
    '<table style="margin-top:14px;font-size:13px"><tr><td style="color:#6b8a84;width:160px;border:0">Payment method</td><td style="border:0">' + esc(METHODS[pay.method] || 'Other') + '</td></tr>' +
    (pay.ref ? '<tr><td style="color:#6b8a84;border:0">Reference</td><td style="border:0">' + esc(pay.ref) + '</td></tr>' : '') +
    '<tr><td style="color:#6b8a84;border:0">Quotation</td><td style="border:0">' + esc(quoteNo(p)) + '</td></tr></table>' +
    '<h2>Project account</h2><table><tr><td>Project price</td><td class="r">' + inr(p.price) + '</td></tr><tr><td>Paid so far (including this payment)</td><td class="r">' + inr(paid) + '</td></tr><tr class="tot"><td>Balance remaining</td><td class="r">' + inr(bal) + '</td></tr></table>' +
    (pay.note ? '<div class="note">' + esc(pay.note) + '</div>' : '') +
    '</div><div class="ft">This is a computer-generated invoice, so no signature is needed. ' + esc(SELLER.name) + ' (Proprietor: ' + esc(SELLER.proprietor) + '), ' + esc(SELLER.place) + ' · Udyam Reg. No.: ' + esc(SELLER.udyam) + '</div></div></body></html>';
}

// ----- emails -----
const li = (arr) => '<ul style="margin:6px 0 0;padding-left:20px">' + arr.map((x) => '<li style="margin:3px 0">' + esc(x) + '</li>').join('') + '</ul>';
const first = (p) => String((p.client && p.client.name) || 'there').split(' ')[0];
const replyTo = () => process.env.OWNER_EMAIL || SELLER.email;

export async function emailQuote(p) {
  if (!mailReady()) throw new Error('Email is not set up yet (RESEND_API_KEY and MAIL_FROM in Netlify).');
  if (!p.client || !p.client.email) throw new Error('This project has no client email address.');
  const url = docUrl(p, 'quote');
  await sendMail({ to: p.client.email, replyTo: replyTo(), subject: 'Quotation ' + quoteNo(p) + ': ' + p.title + ' | Vigyapan Studio',
    html: shell({ preheader: 'Your quotation for ' + p.title, heading: 'Your quotation is ready, ' + first(p),
      bodyHtml: '<p style="margin:0 0 10px">Thank you for talking to us. Here is the quotation for <b>' + esc(p.title) + '</b>.</p>' +
        '<table role="presentation" width="100%" style="font-size:15px;margin:8px 0"><tr><td>Project price</td><td align="right"><b>' + inr(p.price) + '</b></td></tr><tr><td>Advance to start (' + (p.advancePct || 50) + '%)</td><td align="right">' + inr(advanceAmount(p)) + '</td></tr><tr><td>Balance on delivery</td><td align="right">' + inr(p.price - advanceAmount(p)) + '</td></tr><tr><td>Delivery</td><td align="right">' + esc(String(p.deliveryDays || 14)) + ' days after the advance</td></tr></table>' +
        '<p style="margin:10px 0 0">Please open the quotation, read the details and terms, and tap <b>I accept</b> if everything looks right. It is valid for 15 days.</p>',
      button: url ? { text: 'View and accept the quotation', url } : null, small: 'Questions? Just reply to this email.' }),
    text: 'Quotation ' + quoteNo(p) + ' for ' + p.title + '. Price ' + inr(p.price) + '. View and accept: ' + url, idemKey: 'vs-q-' + p.id + '-' + (p.quoteSentAt || Date.now()) });
}

export async function emailInvoice(p, pay) {
  if (!mailReady()) throw new Error('Email is not set up yet (RESEND_API_KEY and MAIL_FROM in Netlify).');
  if (!p.client || !p.client.email) throw new Error('This project has no client email address.');
  const url = docUrl(p, 'inv', pay.id); const bal = Math.max(0, p.price - paidTotal(p));
  await sendMail({ to: p.client.email, replyTo: replyTo(), subject: 'Payment received ' + inr(pay.amount) + ': invoice ' + invoiceNo(pay) + ' | Vigyapan Studio',
    html: shell({ preheader: 'Payment received. Invoice ' + invoiceNo(pay), heading: 'Payment received. Thank you, ' + first(p) + '!',
      bodyHtml: '<p style="margin:0 0 10px">We have received <b>' + inr(pay.amount) + '</b> (' + esc((PAY_KINDS[pay.kind] || 'payment').toLowerCase()) + ') for <b>' + esc(p.title) + '</b>.</p>' +
        '<table role="presentation" width="100%" style="font-size:15px;margin:8px 0"><tr><td>Invoice number</td><td align="right">' + esc(invoiceNo(pay)) + '</td></tr><tr><td>Project price</td><td align="right">' + inr(p.price) + '</td></tr><tr><td>Paid so far</td><td align="right">' + inr(paidTotal(p)) + '</td></tr><tr><td><b>Balance remaining</b></td><td align="right"><b>' + inr(bal) + '</b></td></tr></table>' +
        (bal === 0 ? '<p style="margin:10px 0 0">Your project is now fully paid. Thank you for trusting us.</p>' : ''),
      button: url ? { text: 'View invoice', url } : null, small: 'This is a computer-generated invoice. Please keep it for your records.' }),
    text: 'Payment received ' + inr(pay.amount) + ' for ' + p.title + '. Invoice ' + invoiceNo(pay) + '. Balance remaining ' + inr(bal) + '. View: ' + url, idemKey: 'vs-inv-' + p.id + '-' + pay.id });
}

export async function emailUpdate(p, u) {
  if (!mailReady()) throw new Error('Email is not set up yet (RESEND_API_KEY and MAIL_FROM in Netlify).');
  if (!p.client || !p.client.email) throw new Error('This project has no client email address.');
  const step = stepOf(u.status || p.status);
  const bar = STEP_NAMES.map((n, i) => '<td align="center" style="padding:0 3px"><div style="height:6px;border-radius:3px;background:' + (i < step ? '#FFB72B' : '#dfe8e4') + '"></div><div style="font-size:11px;color:' + (i + 1 === step ? '#10211f' : '#7a948f') + ';margin-top:4px;font-weight:' + (i + 1 === step ? '700' : '400') + '">' + n + '</div></td>').join('');
  const bodyHtml = '<table role="presentation" width="100%" style="margin:0 0 14px"><tr>' + bar + '</tr></table>' +
    (u.done && u.done.length ? '<p style="margin:12px 0 0"><b>Done this week</b></p>' + li(u.done) : '') +
    (u.next && u.next.length ? '<p style="margin:14px 0 0"><b>Coming next</b></p>' + li(u.next) : '') +
    (u.need && u.need.length ? '<p style="margin:14px 0 0;background:#fff7e0;border-radius:10px;padding:10px 12px"><b>We need from you</b></p>' + li(u.need) : '') +
    (u.note ? '<p style="margin:14px 0 0;white-space:pre-wrap">' + esc(u.note) + '</p>' : '') +
    '<p style="margin:16px 0 0;color:#7a948f;font-size:13px">Reply to this email any time with questions or changes.</p>';
  await sendMail({ to: p.client.email, replyTo: replyTo(), subject: 'Project update: ' + p.title + ' | Vigyapan Studio',
    html: shell({ preheader: 'Where your project stands this week', heading: 'Update on ' + p.title, bodyHtml, small: 'You are getting this because we are working on your project.' }),
    text: 'Update on ' + p.title + ' (' + STEP_NAMES[step - 1] + ')\n\nDone: ' + (u.done || []).join('; ') + '\nNext: ' + (u.next || []).join('; ') + ((u.need || []).length ? '\nWe need from you: ' + u.need.join('; ') : '') + (u.note ? '\n\n' + u.note : ''), idemKey: 'vs-upd-' + p.id + '-' + u.id });
}

// ----- a Friday nudge to you: which active projects have not had an update this week -----
export async function runProjectNudge(now = Date.now()) {
  const ist = new Date(now + 5.5 * 3600000);
  if (ist.getUTCDay() !== 5) return 0;                       // Fridays only
  if (!mailReady()) return 0;
  const due = [];
  for (const p of await listProjects()) {
    if (!['accepted', 'building', 'testing'].includes(p.status)) continue;
    const last = (p.updates || []).reduce((m, u) => Math.max(m, u.at), p.acceptedAt || p.createdAt);
    if (now - last >= 5 * DAY) due.push({ p, days: Math.floor((now - last) / DAY) });
  }
  if (!due.length) return 0;
  const site = siteUrl();
  await sendMail({ to: process.env.OWNER_EMAIL || SELLER.email, subject: 'Friday: ' + due.length + ' client update' + (due.length > 1 ? 's' : '') + ' to send',
    html: shell({ preheader: 'These clients have not had an update this week', heading: 'Time for your weekly client updates',
      bodyHtml: '<p style="margin:0 0 8px">These active projects have had no update for 5 days or more:</p><ul style="margin:0;padding-left:20px">' + due.map((d) => '<li><b>' + esc(d.p.title) + '</b> (' + esc((d.p.client && d.p.client.name) || '') + '), last update ' + d.days + ' days ago' + (balanceDue(d.p) ? ', balance due ' + inr(balanceDue(d.p)) : '') + '</li>').join('') + '</ul>',
      button: site ? { text: 'Open Projects', url: site + '/admin/projects' } : null }),
    text: 'Client updates due: ' + due.map((d) => d.p.title).join(', '), idemKey: 'vs-pnudge-' + ist.toISOString().slice(0, 10) });
  return due.length;
}
