// Discount codes you create in Admin (for example DIWALI20, META10, BNI15).
// A code is { code, type: 'pct' | 'flat', value, maxUses (0 = no limit), used, expiresAt (0 = never),
//             appliesTo: 'all' | 'first' | 'renewal', active, note, createdAt }
import * as db from './db.mjs';
import { STORES as S } from './db.mjs';
import { cleanText } from './config.mjs';
import { couponOffer } from './pricing.mjs';

export const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
export const getCoupon = async (code) => { const c = cleanCode(code); return c ? await db.get(S.coupons, c) : null; };

export async function listCoupons() {
  const out = [];
  for (const k of await db.keys(S.coupons)) { const c = await db.get(S.coupons, k); if (c) out.push(c); }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveCoupon(input) {
  const code = cleanCode(input.code);
  if (code.length < 3) return { error: 'The code needs 3 to 16 letters or numbers (no spaces or dashes).' };
  const type = input.type === 'flat' ? 'flat' : 'pct';
  const value = Math.round(Number(input.value));
  if (!(value >= 1)) return { error: 'Enter the discount amount.' };
  if (type === 'pct' && value > 90) return { error: 'A percentage discount can be at most 90.' };
  if (type === 'flat' && value > 2000) return { error: 'A rupee discount can be at most 2000.' };
  const prev = await db.get(S.coupons, code);
  let expiresAt = 0;
  if (input.expires) {                            // "YYYY-MM-DD": valid through the end of that day (India time)
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input.expires));
    if (!m) return { error: 'Expiry date looks wrong.' };
    expiresAt = Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59, 59) - 19800000;
  }
  const rec = {
    code, type, value, maxUses: Math.max(0, Math.min(100000, Math.round(Number(input.maxUses) || 0))),
    used: prev ? prev.used || 0 : 0, expiresAt,
    appliesTo: ['first', 'renewal'].includes(input.appliesTo) ? input.appliesTo : 'all',
    active: input.active !== false, note: cleanText(input.note, 80), createdAt: prev ? prev.createdAt : Date.now()
  };
  await db.put(S.coupons, code, rec);
  return { coupon: rec };
}

// Can this code be used right now? kind = 'first' (new customer) or 'renewal'.
export async function checkCoupon(code, kind, now) {
  now = now == null ? Date.now() : now;
  const c = await getCoupon(code);
  if (!c || !c.active) return { error: 'That code is not valid. Check it and try again, or leave it empty.' };
  if (c.expiresAt && now > c.expiresAt) return { error: 'That code has expired.' };
  if (c.maxUses && (c.used || 0) >= c.maxUses) return { error: 'That code has been fully used.' };
  if (c.appliesTo === 'first' && kind !== 'first') return { error: 'That code is only for first orders.' };
  if (c.appliesTo === 'renewal' && kind !== 'renewal') return { error: 'That code is only for renewals.' };
  return { coupon: c, offer: couponOffer(c) };
}

// Called once for each payment that used the code.
export async function useCoupon(code) {
  const c = await getCoupon(code);
  if (!c) return;
  c.used = (c.used || 0) + 1;
  await db.put(S.coupons, c.code, c);
}
