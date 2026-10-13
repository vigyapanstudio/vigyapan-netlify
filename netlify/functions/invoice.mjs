// Shows one of the logged-in customer's invoices as a printable page.
import { getSession } from '../lib/auth.mjs';
import { getPayments } from '../lib/members.mjs';
import { buildInvoice } from '../lib/invoice.mjs';
import { getAddons } from '../lib/addons.mjs';

export const config = { path: '/api/invoice' };

export default async (req) => {
  const sess = getSession(req);
  if (!sess) return new Response('Please log in first.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const pid = new URL(req.url).searchParams.get('pid') || '';
  const p = (await getPayments(sess.cid)).find((x) => x.paymentId === pid) || (await getAddons(sess.cid)).find((x) => x.paymentId === pid);
  if (!p) return new Response('Not found.', { status: 404 });
  const inv = buildInvoice(p.raw, { notes: p.notes });
  const bar = '<div style="max-width:600px;margin:14px auto;text-align:right;font-family:Arial,sans-serif" class="noprint"><button onclick="window.print()" style="background:#FFB72B;color:#2A1A00;border:0;border-radius:10px;padding:10px 18px;font-weight:700;font-size:15px;cursor:pointer">Print or save as PDF</button></div><style>@media print{.noprint{display:none!important}}</style>';
  const html = inv.html.replace('<body style="margin:0;padding:0;background:#f2f6f4;font-family:Arial,Helvetica,sans-serif">', (m) => m + bar);
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Frame-Options': 'DENY' } });
};
