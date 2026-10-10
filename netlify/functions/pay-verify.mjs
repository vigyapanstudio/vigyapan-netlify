// The browser calls this right after a payment. We check Razorpay's signature, then save the
// membership and send the receipt + invoice.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { json } from '../lib/http.mjs';
import { processPaidPayment } from '../lib/receipt.mjs';

export const config = { path: '/api/verify-payment' };

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' }, { headers: { Allow: 'POST' } });
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return json(500, { verified: false });
  let b = {};
  try { b = (await req.json()) || {}; } catch (e) { b = {}; }
  const orderId = String(b.orderId || ''), paymentId = String(b.paymentId || ''), signature = String(b.signature || '');
  if (!orderId || !paymentId || !signature) return json(400, { verified: false });

  const expected = createHmac('sha256', secret).update(orderId + '|' + paymentId).digest('hex');
  const x = Buffer.from(expected), y = Buffer.from(signature);
  const ok = x.length === y.length && timingSafeEqual(x, y);
  if (ok) await Promise.race([processPaidPayment(paymentId), new Promise((res) => setTimeout(res, 8000))]);
  return json(ok ? 200 : 400, { verified: ok });
};
