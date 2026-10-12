// Builds the invoice / receipt (used in the email and on the dashboard's "View invoice" page).
// payment = { id, order_id, amount (paise), method, created_at (unix seconds) }
// order   = { notes: {...} }
import { SELLER, BASE_PRICE, BUMP_PRICE, esc, inr, istDate, siteUrl } from './config.mjs';
import { monthsFromNote, packPrice, parsePromo } from './pricing.mjs';

export function invoiceNumber(payment) {
  const ms = payment.created_at ? payment.created_at * 1000 : Date.now();
  const ist = new Date(ms + 5.5 * 3600 * 1000);
  const yymm = String(ist.getUTCFullYear()).slice(2) + String(ist.getUTCMonth() + 1).padStart(2, '0');
  const tail = String(payment.id).replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
  return 'VS-' + yymm + '-' + tail;
}

export function buildInvoice(payment, order) {
  const notes = (order && order.notes) || {};
  const total = Math.round(payment.amount / 100);
  const months = monthsFromNote(notes.plan);
  const bump = notes.addon_reel_scripts != null ? /^yes/i.test(String(notes.addon_reel_scripts)) : total >= BASE_PRICE + BUMP_PRICE;
  const renewal = String(notes.renewal || '') === 'yes';
  const promo = parsePromo(notes.promo);
  const days = months * 30;
  const items = [{ label: months === 3
    ? 'Instagram Growth Report + Content Calendar: 3-month plan (a new 30-day calendar each month)' + (renewal ? ' (renewal)' : '')
    : 'Instagram Growth Report + 30-Day Content Calendar' + (renewal ? ' (monthly renewal)' : ''), amt: packPrice(months) }];
  if (bump) items.push({ label: 'Add-on: 10 reel scripts', amt: BUMP_PRICE });
  const subtotal = items.reduce((s, i) => s + i.amt, 0);
  if (subtotal > total) {
    const why = promo ? ({ referral: 'Referral discount', credit: 'Referral credit (10% off)', winback: 'Welcome-back discount' })[promo.kind] : 'Discount';
    items.push({ label: why, amt: total - subtotal });
  }
  const invNo = invoiceNumber(payment);
  const when = istDate(payment.created_at ? payment.created_at * 1000 : Date.now(), true);
  const method = ({ upi: 'UPI', card: 'Card', netbanking: 'Netbanking', wallet: 'Wallet', emi: 'EMI' })[payment.method] || (payment.method || 'Online');
  const name = notes.name || 'Customer';
  const email = notes.email || payment.email || '';
  const phone = notes.phone || String(payment.contact || '').replace(/^\+?91/, '');
  const site = siteUrl();
  const gst = process.env.INVOICE_GSTIN ? '<div>GSTIN: ' + esc(process.env.INVOICE_GSTIN) + '</div>' : '';

  const rows = items.map((i) =>
    '<tr><td style="padding:10px 0;border-bottom:1px solid #e6ece9;font-size:15px;color:#10211f">' + esc(i.label) + '</td>' +
    '<td style="padding:10px 0;border-bottom:1px solid #e6ece9;font-size:15px;color:#10211f;text-align:right;white-space:nowrap">' + (i.amt < 0 ? '−' + inr(-i.amt) : inr(i.amt)) + '</td></tr>').join('');

  const dash = site
    ? '<tr><td style="padding:14px 28px 0"><div style="background:#eef6f3;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.55;color:#24433d"><b>Your dashboard:</b> log in with this email address to download your reports, renew each month and see all your invoices. <a href="' + esc(site) + '/login" style="color:#0b7a5a;font-weight:700">Open my dashboard</a></div></td></tr>'
    : '';

  const html =
'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ' + esc(invNo) + '</title></head><body style="margin:0;padding:0;background:#f2f6f4;font-family:Arial,Helvetica,sans-serif">' +
'<div style="display:none;max-height:0;overflow:hidden">Payment received. Your invoice ' + esc(invNo) + ' is below.</div>' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6f4;padding:24px 12px"><tr><td align="center">' +
'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dfe8e4">' +
'<tr><td style="background:#06201F;padding:22px 28px"><div style="font-size:20px;font-weight:700;color:#FFB72B">Vigyapan Studio</div><div style="font-size:13px;color:#9DBFB9;margin-top:2px">' + esc(SELLER.instagram) + '</div></td></tr>' +
'<tr><td style="padding:28px 28px 8px"><div style="font-size:22px;font-weight:700;color:#10211f">Payment received. Thank you, ' + esc(String(name).split(' ')[0]) + '!</div>' +
'<p style="font-size:15px;line-height:1.55;color:#33504b;margin:12px 0 0">We have received your payment of <b>' + inr(total) + '</b>. ' + (renewal
  ? 'Your membership has been extended by ' + days + ' days. We will prepare your next report and calendar and add them to your dashboard.'
  : 'We will study your Instagram page and competitors and send your report on WhatsApp and email within <b>48 hours</b>.') + '</p></td></tr>' +
'<tr><td style="padding:20px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7faf9;border-radius:10px"><tr>' +
'<td style="padding:14px 16px;font-size:13px;color:#33504b;vertical-align:top"><div style="color:#7a948f;font-size:11px;letter-spacing:.06em;text-transform:uppercase">Invoice no.</div><div style="font-weight:700;color:#10211f;font-size:15px">' + esc(invNo) + '</div></td>' +
'<td style="padding:14px 16px;font-size:13px;color:#33504b;vertical-align:top"><div style="color:#7a948f;font-size:11px;letter-spacing:.06em;text-transform:uppercase">Date</div><div style="font-weight:700;color:#10211f;font-size:15px">' + esc(when) + '</div></td></tr></table></td></tr>' +
'<tr><td style="padding:20px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
'<td style="vertical-align:top;font-size:13px;line-height:1.55;color:#33504b;width:50%"><div style="color:#7a948f;font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">Billed to</div><div style="font-weight:700;color:#10211f">' + esc(name) + '</div>' +
(notes.business ? '<div>' + esc(notes.business) + '</div>' : '') + '<div>' + esc(email) + '</div><div>+91 ' + esc(phone) + '</div>' + (notes.instagram ? '<div>' + esc(notes.instagram) + '</div>' : '') + '</td>' +
'<td style="vertical-align:top;font-size:13px;line-height:1.55;color:#33504b;width:50%"><div style="color:#7a948f;font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">From</div><div style="font-weight:700;color:#10211f">' + esc(SELLER.name) + '</div>' +
'<div>Proprietor: ' + esc(SELLER.proprietor) + '</div><div>' + esc(SELLER.place) + '</div><div>' + esc(SELLER.email) + '</div><div>' + esc(SELLER.phone) + '</div><div>Udyam Reg. No.: ' + esc(SELLER.udyam) + '</div>' + gst + '</td></tr></table></td></tr>' +
'<tr><td style="padding:22px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
'<tr><td style="padding:0 0 8px;border-bottom:2px solid #10211f;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#7a948f">Description</td><td style="padding:0 0 8px;border-bottom:2px solid #10211f;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#7a948f;text-align:right">Amount</td></tr>' +
rows +
'<tr><td style="padding:14px 0 0;font-size:16px;font-weight:700;color:#10211f">Total paid</td><td style="padding:14px 0 0;font-size:18px;font-weight:700;color:#10211f;text-align:right">' + inr(total) + '</td></tr>' +
'</table></td></tr>' +
'<tr><td style="padding:18px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#33504b;line-height:1.7">' +
'<tr><td style="color:#7a948f;width:140px">Payment method</td><td>' + esc(method) + '</td></tr>' +
'<tr><td style="color:#7a948f">Payment ID</td><td>' + esc(payment.id) + '</td></tr>' +
'<tr><td style="color:#7a948f">Order ID</td><td>' + esc(payment.order_id) + '</td></tr>' +
'<tr><td style="color:#7a948f">Status</td><td style="color:#0b7a5a;font-weight:700">Paid</td></tr></table></td></tr>' +
dash +
'<tr><td style="padding:16px 28px 0"><div style="background:#fff7e0;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.55;color:#5a4300"><b>Questions?</b> Reply to this email or WhatsApp ' + esc(SELLER.phone) + '. If we need anything (for example, your Instagram account is private), we will message you on WhatsApp.</div></td></tr>' +
'<tr><td style="padding:22px 28px 28px;font-size:12px;line-height:1.6;color:#7a948f">This is a computer-generated receipt and invoice, so no signature is needed. Please keep this email for your records.</td></tr>' +
'</table></td></tr></table></body></html>';

  const text = [
    'Payment received. Thank you, ' + name + '!',
    'Amount paid: ' + inr(total),
    'Invoice no: ' + invNo, 'Date: ' + when,
    'Payment ID: ' + payment.id, 'Order ID: ' + payment.order_id, 'Method: ' + method,
    '', 'Items:'].concat(items.map((i) => ' - ' + i.label + ': ' + (i.amt < 0 ? '-' + inr(-i.amt) : inr(i.amt))), [
    '', renewal ? 'Your membership has been extended by ' + days + ' days.' : 'We will send your report on WhatsApp and email within 48 hours.',
    site ? 'Your dashboard: ' + site + '/login' : '',
    SELLER.name + ' (Proprietor: ' + SELLER.proprietor + '), ' + SELLER.place + ' | Udyam Reg. No.: ' + SELLER.udyam,
    SELLER.email + ' | ' + SELLER.phone]).join('\n');

  return { html, text, invNo, total, bump, renewal, months, notes, name, email, phone, method };
}
