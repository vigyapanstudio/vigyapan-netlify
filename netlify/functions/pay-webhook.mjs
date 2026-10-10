// Razorpay calls this by itself when a payment succeeds. It is the safety net: even if the
// customer closes the page right after paying, the membership and invoice still happen.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { processPaidPayment } from '../lib/receipt.mjs';

export const config = { path: '/api/razorpay-webhook' };

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return new Response('Webhook not configured', { status: 500 });
  const raw = await req.text();
  const sig = String(req.headers.get('x-razorpay-signature') || '');
  const a = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex')), c = Buffer.from(sig);
  if (a.length !== c.length || !timingSafeEqual(a, c)) return new Response('Bad signature', { status: 400 });
  let payload = {};
  try { payload = JSON.parse(raw); } catch (e) { return new Response('Bad JSON', { status: 400 }); }
  let paymentId = null;
  if (payload.event === 'payment.captured' || payload.event === 'order.paid') {
    const p = payload.payload && payload.payload.payment && payload.payload.payment.entity;
    paymentId = p && p.id;
  }
  if (paymentId) await processPaidPayment(paymentId);
  return new Response('ok', { status: 200 });
};
