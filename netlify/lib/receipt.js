// Builds and sends the payment receipt + invoice email (to the customer)
// and a "new order" email (to you). Used by verify-payment and razorpay-webhook.
//
// Needs these Netlify environment variables:
//   RESEND_API_KEY   - from resend.com (the email-sending service)
//   MAIL_FROM        - e.g.  Vigyapan Studio <hello@yourdomain.com>  (must be on a domain verified in Resend)
// Optional:
//   OWNER_EMAIL      - where "new order" emails go (default vigyapanstudio@gmail.com)
//   INVOICE_GSTIN    - your GSTIN, if you have one (shown on the invoice)
//   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET - already set

const SELLER = {
  name: 'Vigyapan Studio',
  proprietor: 'Nipun Aggarwal',
  place: 'Zirakpur, Punjab, India',
  email: 'vigyapanstudio@gmail.com',
  phone: '+91 70098 84880',
  instagram: '@vigyapan_studio'
};
const BASE_PRICE = 999, BUMP_PRICE = 299;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');

function istDate(unixSeconds) {
  const d = new Date((unixSeconds ? unixSeconds * 1000 : Date.now()));
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}
function invoiceNumber(payment) {
  const d = new Date(payment.created_at ? payment.created_at * 1000 : Date.now());
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  const yymm = String(ist.getUTCFullYear()).slice(2) + String(ist.getUTCMonth() + 1).padStart(2, '0');
  const tail = String(payment.id).replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
  return 'VS-' + yymm + '-' + tail;
}

async function rzp(path) {
  const auth = Buffer.from(process.env.RAZORPAY_KEY_ID + ':' + process.env.RAZORPAY_KEY_SECRET).toString('base64');
  const r = await fetch('https://api.razorpay.com/v1' + path, { headers: { Authorization: 'Basic ' + auth } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Razorpay ' + path + ' -> ' + r.status);
  return data;
}

function buildInvoice(payment, order) {
  const notes = (order && order.notes) || {};
  const total = Math.round(payment.amount / 100);
  const bump = /^yes/i.test(String(notes.addon_reel_scripts || '')) || total >= BASE_PRICE + BUMP_PRICE;
  const items = [{ label: 'Instagram Growth Report + 30-Day Content Calendar', amt: BASE_PRICE }];
  if (bump) items.push({ label: 'Add-on: 10 reel scripts', amt: BUMP_PRICE });
  const invNo = invoiceNumber(payment);
  const when = istDate(payment.created_at);
  const method = ({ upi: 'UPI', card: 'Card', netbanking: 'Netbanking', wallet: 'Wallet', emi: 'EMI' })[payment.method] || (payment.method || 'Online');
  const name = notes.name || 'Customer';
  const email = notes.email || payment.email;
  const phone = notes.phone || String(payment.contact || '').replace(/^\+?91/, '');
  const site = (process.env.URL || '').replace(/\/$/, '');
  const gst = process.env.INVOICE_GSTIN ? '<div>GSTIN: ' + esc(process.env.INVOICE_GSTIN) + '</div>' : '';

  const rows = items.map((i) =>
    '<tr><td style="padding:10px 0;border-bottom:1px solid #e6ece9;font-size:15px;color:#10211f">' + esc(i.label) + '</td>' +
    '<td style="padding:10px 0;border-bottom:1px solid #e6ece9;font-size:15px;color:#10211f;text-align:right;white-space:nowrap">' + inr(i.amt) + '</td></tr>').join('');

  const html =
'<!doctype html><html><body style="margin:0;padding:0;background:#f2f6f4;font-family:Arial,Helvetica,sans-serif">' +
'<div style="display:none;max-height:0;overflow:hidden">Payment received. Your invoice ' + esc(invNo) + ' is below.</div>' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6f4;padding:24px 12px"><tr><td align="center">' +
'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dfe8e4">' +
'<tr><td style="background:#06201F;padding:22px 28px"><div style="font-size:20px;font-weight:700;color:#FFB72B">Vigyapan Studio</div><div style="font-size:13px;color:#9DBFB9;margin-top:2px">' + esc(SELLER.instagram) + '</div></td></tr>' +
'<tr><td style="padding:28px 28px 8px"><div style="font-size:22px;font-weight:700;color:#10211f">Payment received. Thank you, ' + esc(String(name).split(' ')[0]) + '!</div>' +
'<p style="font-size:15px;line-height:1.55;color:#33504b;margin:12px 0 0">We have received your payment of <b>' + inr(total) + '</b>. We will study your Instagram page and competitors and send your report on WhatsApp and email within <b>48 hours</b>.</p></td></tr>' +
'<tr><td style="padding:20px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7faf9;border-radius:10px"><tr>' +
'<td style="padding:14px 16px;font-size:13px;color:#33504b;vertical-align:top"><div style="color:#7a948f;font-size:11px;letter-spacing:.06em;text-transform:uppercase">Invoice no.</div><div style="font-weight:700;color:#10211f;font-size:15px">' + esc(invNo) + '</div></td>' +
'<td style="padding:14px 16px;font-size:13px;color:#33504b;vertical-align:top"><div style="color:#7a948f;font-size:11px;letter-spacing:.06em;text-transform:uppercase">Date</div><div style="font-weight:700;color:#10211f;font-size:15px">' + esc(when) + '</div></td></tr></table></td></tr>' +
'<tr><td style="padding:20px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
'<td style="vertical-align:top;font-size:13px;line-height:1.55;color:#33504b;width:50%"><div style="color:#7a948f;font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">Billed to</div><div style="font-weight:700;color:#10211f">' + esc(name) + '</div>' +
(notes.business ? '<div>' + esc(notes.business) + '</div>' : '') + '<div>' + esc(email) + '</div><div>+91 ' + esc(phone) + '</div>' + (notes.instagram ? '<div>' + esc(notes.instagram) + '</div>' : '') + '</td>' +
'<td style="vertical-align:top;font-size:13px;line-height:1.55;color:#33504b;width:50%"><div style="color:#7a948f;font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">From</div><div style="font-weight:700;color:#10211f">' + esc(SELLER.name) + '</div>' +
'<div>Proprietor: ' + esc(SELLER.proprietor) + '</div><div>' + esc(SELLER.place) + '</div><div>' + esc(SELLER.email) + '</div><div>' + esc(SELLER.phone) + '</div>' + gst + '</td></tr></table></td></tr>' +
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
'<tr><td style="padding:22px 28px 0"><div style="background:#fff7e0;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.55;color:#5a4300"><b>What happens next:</b> we start on your report now. If we need anything (for example, your Instagram account is private), we will message you on WhatsApp. Questions? Reply to this email or WhatsApp ' + esc(SELLER.phone) + '.</div></td></tr>' +
'<tr><td style="padding:22px 28px 28px;font-size:12px;line-height:1.6;color:#7a948f">This is a computer-generated receipt and invoice, so no signature is needed. Refunds follow our ' +
(site ? '<a href="' + esc(site) + '/refund" style="color:#0b7a5a">Refund Policy</a>' : 'Refund Policy') + '. Please keep this email for your records.</td></tr>' +
'</table></td></tr></table></body></html>';

  const text = [
    'Payment received. Thank you, ' + name + '!',
    'Amount paid: ' + inr(total),
    'Invoice no: ' + invNo, 'Date: ' + when,
    'Payment ID: ' + payment.id, 'Order ID: ' + payment.order_id, 'Method: ' + method,
    '', 'Items:'].concat(items.map((i) => ' - ' + i.label + ': ' + inr(i.amt)), [
    '', 'We will send your report on WhatsApp and email within 48 hours.',
    SELLER.name + ' (Proprietor: ' + SELLER.proprietor + '), ' + SELLER.place,
    SELLER.email + ' | ' + SELLER.phone]).join('\n');

  return { html, text, invNo, total, bump, notes, name, email, phone, method };
}

async function sendMail({ to, subject, html, text, replyTo, idemKey }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html, text, reply_to: replyTo })
  });
  if (!r.ok) throw new Error('Resend -> ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 300));
}

// Returns { sent: bool, reason?: string }. Never throws, so a mail problem can never break a payment.
async function sendReceipt(paymentId) {
  try {
    if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return { sent: false, reason: 'email not configured' };
    const payment = await rzp('/payments/' + encodeURIComponent(paymentId));
    if (payment.status !== 'captured') return { sent: false, reason: 'payment not captured yet (' + payment.status + ')' };
    const order = payment.order_id ? await rzp('/orders/' + encodeURIComponent(payment.order_id)) : { notes: {} };
    const inv = buildInvoice(payment, order);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(inv.email || ''))) return { sent: false, reason: 'no valid customer email' };

    await sendMail({
      to: inv.email, replyTo: SELLER.email,
      subject: 'Payment received – Invoice ' + inv.invNo + ' | Vigyapan Studio',
      html: inv.html, text: inv.text, idemKey: 'vs-cust-' + payment.id
    });

    // Copy to you with all the form answers, so you can start the work.
    const n = inv.notes;
    const line = (k, v) => v ? '<tr><td style="padding:4px 12px 4px 0;color:#7a948f;vertical-align:top">' + esc(k) + '</td><td style="padding:4px 0">' + esc(v) + '</td></tr>' : '';
    const ownerHtml = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#10211f"><h2 style="margin:0 0 8px">New paid order: ' + inr(inv.total) + '</h2><table>' +
      line('Name', n.name) + line('WhatsApp', '+91 ' + inv.phone) + line('Email', inv.email) + line('Instagram', n.instagram) + line('Business', n.business) +
      line('Type', n.business_type) + line('City', n.city) + line('Followers', n.followers) + line('Goal', n.goal) + line('Competitors', n.competitors) +
      line('About', n.about) + line('Reel scripts add-on', n.addon_reel_scripts) + line('Invoice', inv.invNo) + line('Payment ID', payment.id) + line('Order ID', payment.order_id) +
      '</table><p><a href="https://wa.me/91' + esc(inv.phone) + '">Open WhatsApp chat with customer</a></p></div>';
    try {
      await sendMail({
        to: process.env.OWNER_EMAIL || SELLER.email, replyTo: inv.email,
        subject: 'New order ' + inr(inv.total) + ' – ' + (n.name || 'customer') + ' ' + (n.instagram || ''),
        html: ownerHtml, text: 'New paid order ' + inr(inv.total) + ' from ' + n.name + ' / ' + inv.email + ' / +91 ' + inv.phone + ' / ' + n.instagram, idemKey: 'vs-own-' + payment.id
      });
    } catch (e) { console.error('owner copy failed', String(e)); }
    return { sent: true, invoice: inv.invNo };
  } catch (e) {
    console.error('sendReceipt failed', String(e));
    return { sent: false, reason: 'error' };
  }
}

module.exports = { sendReceipt, buildInvoice };
