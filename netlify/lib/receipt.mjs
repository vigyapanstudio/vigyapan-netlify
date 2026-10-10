// After a payment: save the membership, then email the customer a receipt + invoice
// and email you a "new order" note. Used by pay-verify and pay-webhook.
import { SELLER, EMAIL_RE, esc, inr } from './config.mjs';
import { rzpGet, razorpayReady } from './razorpay.mjs';
import { recordPayment } from './members.mjs';
import { buildInvoice } from './invoice.mjs';
import { sendMail, mailReady } from './mail.mjs';

// Never throws, so a storage or email problem can never break a payment.
export async function processPaidPayment(paymentId, opts) {
  const sendEmails = !(opts && opts.sendEmails === false);
  try {
    if (!razorpayReady()) { console.log('PAYMENT SKIPPED: Razorpay keys missing'); return { ok: false, reason: 'no razorpay keys' }; }
    let payment = await rzpGet('/payments/' + encodeURIComponent(paymentId));
    // Razorpay can take a moment to move a paid payment from "authorized" to "captured".
    for (let i = 0; i < 3 && payment.status === 'authorized'; i++) {
      await new Promise((res) => setTimeout(res, 1200));
      payment = await rzpGet('/payments/' + encodeURIComponent(paymentId));
    }
    if (payment.status !== 'captured') {
      console.log('PAYMENT SKIPPED: ' + paymentId + ' status is ' + payment.status + ' (the webhook will retry when it is captured)');
      return { ok: false, reason: 'not captured (' + payment.status + ')' };
    }
    const order = payment.order_id ? await rzpGet('/orders/' + encodeURIComponent(payment.order_id)) : { notes: {} };

    let recorded = false;
    try { await recordPayment(payment, order); recorded = true; console.log('MEMBERSHIP SAVED for ' + paymentId); }
    catch (e) { console.error('MEMBERSHIP SAVE FAILED', String(e)); }

    if (!sendEmails) return { ok: true, recorded, emailed: false };
    if (!mailReady()) { console.log('RECEIPT SKIPPED: RESEND_API_KEY or MAIL_FROM is missing (or the site was not redeployed after adding them)'); return { ok: true, recorded, emailed: false }; }

    const inv = buildInvoice(payment, order);
    if (!EMAIL_RE.test(String(inv.email || ''))) { console.log('RECEIPT SKIPPED: no valid customer email on ' + paymentId); return { ok: true, recorded, emailed: false }; }
    await sendMail({
      to: inv.email,
      subject: (inv.renewal ? 'Renewal received' : 'Payment received') + ' – Invoice ' + inv.invNo + ' | Vigyapan Studio',
      html: inv.html, text: inv.text, idemKey: 'vs-cust-' + payment.id
    });
    console.log('RECEIPT SENT: ' + inv.invNo + ' to ' + inv.email);

    const n = inv.notes;
    const line = (k, v) => v ? '<tr><td style="padding:4px 12px 4px 0;color:#7a948f;vertical-align:top">' + esc(k) + '</td><td style="padding:4px 0">' + esc(v) + '</td></tr>' : '';
    const ownerHtml = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#10211f"><h2 style="margin:0 0 8px">' + (inv.renewal ? 'Renewal' : 'New paid order') + ': ' + inr(inv.total) + '</h2><table>' +
      line('Name', n.name) + line('WhatsApp', '+91 ' + inv.phone) + line('Email', inv.email) + line('Instagram', n.instagram) + line('Business', n.business) +
      line('Type', n.business_type) + line('City', n.city) + line('Followers', n.followers) + line('Goal', n.goal) + line('Competitors', n.competitors) +
      line('Sells / offers', n.about) + line('Reel scripts add-on', n.addon_reel_scripts) + line('Invoice', inv.invNo) + line('Payment ID', payment.id) + line('Order ID', payment.order_id) +
      '</table><p>Upload their report in your admin page, then it appears in their dashboard.</p><p><a href="https://wa.me/91' + esc(inv.phone) + '">Open WhatsApp chat with customer</a></p></div>';
    try {
      await sendMail({
        to: process.env.OWNER_EMAIL || SELLER.email, replyTo: inv.email,
        subject: (inv.renewal ? 'Renewal ' : 'New order ') + inr(inv.total) + ' – ' + (n.name || 'customer') + ' ' + (n.instagram || ''),
        html: ownerHtml, text: (inv.renewal ? 'Renewal ' : 'New paid order ') + inr(inv.total) + ' from ' + n.name + ' / ' + inv.email + ' / +91 ' + inv.phone + ' / ' + n.instagram,
        idemKey: 'vs-own-' + payment.id
      });
    } catch (e) { console.error('owner copy failed', String(e)); }
    return { ok: true, recorded, emailed: true, invoice: inv.invNo };
  } catch (e) {
    console.error('processPaidPayment failed', String(e));
    return { ok: false, reason: 'error' };
  }
}
