// One-tap extras bought from the dashboard (extra reel scripts, bio rewrite...). These payments are
// stored separately and NEVER change how long a membership lasts.
import * as db from './db.mjs';
import { STORES as S } from './db.mjs';
import { addons as catalogue, EMAIL_RE } from './config.mjs';
import { cidOf, normEmail } from './members.mjs';

export function priceItems(ids) {
  const cat = catalogue();
  const picked = [...new Set((Array.isArray(ids) ? ids : []).map(String))].map((id) => cat.find((a) => a.id === id)).filter(Boolean);
  return { items: picked, total: picked.reduce((s, a) => s + a.price, 0) };
}
export async function recordAddon(payment, order) {
  const notes = (order && order.notes) || {};
  const email = normEmail(notes.email || payment.email);
  if (!EMAIL_RE.test(email)) throw new Error('add-on payment has no valid email');
  const cid = cidOf(email);
  const cat = catalogue();
  const ids = String(notes.items || '').split(',').map((s) => s.trim()).filter(Boolean);
  const items = ids.map((id) => cat.find((a) => a.id === id)).filter(Boolean).map((a) => ({ id: a.id, name: a.name }));
  const paidAt = payment.created_at ? payment.created_at * 1000 : Date.now();
  const key = cid + '/' + String(paidAt).padStart(13, '0') + '-' + payment.id;
  const prev = await db.get(S.addons, key);
  const rec = Object.assign({ status: 'new', deliveredAt: 0 }, prev || {}, {
    paymentId: payment.id, orderId: payment.order_id, cid, email, amount: Math.round(payment.amount / 100), paidAt, items,
    method: payment.method || '', raw: { id: payment.id, order_id: payment.order_id, amount: payment.amount, method: payment.method || '', created_at: payment.created_at || Math.floor(paidAt / 1000) }, notes
  });
  await db.put(S.addons, key, rec);
  return { cid, email, rec, isNew: !prev };
}
export async function getAddons(cid) {
  const out = [];
  for (const k of await db.keys(S.addons, cid + '/')) { const a = await db.get(S.addons, k); if (a) out.push(a); }
  return out.sort((a, b) => b.paidAt - a.paidAt);
}
export async function allAddons() {
  const out = [];
  for (const k of await db.keys(S.addons)) { const a = await db.get(S.addons, k); if (a) out.push(a); }
  return out;
}
export async function setAddonStatus(cid, paymentId, status) {
  const a = (await getAddons(cid)).find((x) => x.paymentId === paymentId);
  if (!a) return null;
  a.status = status === 'done' ? 'done' : 'new';
  a.deliveredAt = a.status === 'done' ? Date.now() : 0;
  await db.put(S.addons, cid + '/' + String(a.paidAt).padStart(13, '0') + '-' + a.paymentId, a);
  return a;
}
