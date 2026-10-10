// Netlify Function: Razorpay calls this by itself when a payment succeeds.
// It is a safety net: even if the customer closes the page right after paying,
// the receipt + invoice email still goes out.
const crypto = require('crypto');
const { sendReceipt } = require('../lib/receipt');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: { Allow: 'POST' }, body: 'Method not allowed' };
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return { statusCode: 500, body: 'Webhook not configured' };

  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  const sig = String((event.headers && (event.headers['x-razorpay-signature'] || event.headers['X-Razorpay-Signature'])) || '');
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { statusCode: 400, body: 'Bad signature' };

  let payload = {};
  try { payload = JSON.parse(raw); } catch (e) { return { statusCode: 400, body: 'Bad JSON' }; }

  const ev = payload.event;
  let paymentId = null;
  if (ev === 'payment.captured' || ev === 'order.paid') {
    const p = payload.payload && payload.payload.payment && payload.payload.payment.entity;
    paymentId = p && p.id;
  }
  if (paymentId) await sendReceipt(paymentId);
  return { statusCode: 200, body: 'ok' };
};
