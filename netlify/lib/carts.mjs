// Unfinished checkouts: saved when someone taps "Continue to payment", removed when they pay.
// A reminder email goes out once, 2 hours to 3 days later, with a link that refills their form.
import { randomBytes } from 'node:crypto';
import * as db from './db.mjs';
import { STORES as S } from './db.mjs';
import { cidOf, normEmail } from './members.mjs';

export async function saveCart(form) {
  const cid = cidOf(form.email);
  const idx = await db.get(S.carts, 'e-' + cid);
  const prev = idx ? await db.get(S.carts, 'c-' + idx.rid) : null;
  const rid = prev ? prev.rid : randomBytes(12).toString('hex');
  const rec = Object.assign({}, prev || {}, form, { rid, cid, email: normEmail(form.email), createdAt: prev ? prev.createdAt : Date.now(), updatedAt: Date.now() });
  // a brand-new attempt after an old reminder deserves a fresh reminder
  if (prev && prev.emailedAt && Date.now() - prev.emailedAt > 7 * 86400000) delete rec.emailedAt;
  await db.put(S.carts, 'c-' + rid, rec);
  await db.put(S.carts, 'e-' + cid, { rid });
  return rec;
}
export async function clearCartFor(email) {
  const cid = cidOf(email);
  const idx = await db.get(S.carts, 'e-' + cid);
  if (idx) { await db.del(S.carts, 'c-' + idx.rid); await db.del(S.carts, 'e-' + cid); }
}
export const getCartByRid = async (rid) => (/^[0-9a-f]{24}$/.test(String(rid || '')) ? await db.get(S.carts, 'c-' + rid) : null);
export async function listCarts() {
  const out = [];
  for (const k of await db.keys(S.carts, 'c-')) { const c = await db.get(S.carts, k); if (c) out.push(c); }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}
