// Netlify Function: checks that a payment really came from Razorpay.
const crypto = require('crypto');
const reply = (statusCode, obj, extra) => ({
  statusCode,
  headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}),
  body: JSON.stringify(obj)
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return reply(500, { verified: false });

  let b = {};
  try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { b = {}; }
  const orderId = String(b.orderId || '');
  const paymentId = String(b.paymentId || '');
  const signature = String(b.signature || '');
  if (!orderId || !paymentId || !signature) return reply(400, { verified: false });

  const expected = crypto.createHmac('sha256', secret).update(orderId + '|' + paymentId).digest('hex');
  const a = Buffer.from(expected);
  const c = Buffer.from(signature);
  const ok = a.length === c.length && crypto.timingSafeEqual(a, c);
  return reply(ok ? 200 : 400, { verified: ok });
};
