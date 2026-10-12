// One place that decides prices, so the website, the checkout and the invoice always agree.
import { BASE_PRICE, BUMP_PRICE, PACK3_PRICE, REFERRAL_PCT, WINBACK_OFF } from './config.mjs';

export const cleanMonths = (v) => (Number(v) === 3 ? 3 : 1);
export const packPrice = (months) => (cleanMonths(months) === 3 ? PACK3_PRICE : BASE_PRICE);
export const planNote = (months) => (cleanMonths(months) === 3 ? '3 months' : '1 month');
export const monthsFromNote = (plan) => (/^\s*3\b/.test(String(plan || '')) ? 3 : 1);

// Offers never stack: the customer simply gets whichever one saves the most.
//   { kind: 'referral' | 'credit', pct }   percent off
//   { kind: 'winback', off }               rupees off
export function discountFor(subtotal, offer) {
  if (!offer) return 0;
  const amt = offer.pct ? Math.round(subtotal * offer.pct / 100) : Math.round(offer.off || 0);
  return Math.max(0, Math.min(amt, subtotal - 1));
}
export function quote({ months, bump, offers }) {
  const m = cleanMonths(months);
  const base = packPrice(m), addon = bump ? BUMP_PRICE : 0, subtotal = base + addon;
  let best = null, bestAmt = 0;
  (offers || []).forEach((o) => { const a = discountFor(subtotal, o); if (a > bestAmt) { best = o; bestAmt = a; } });
  return { months: m, base, addon, subtotal, discount: best ? { kind: best.kind, amount: bestAmt, code: best.code || '' } : null, total: subtotal - bestAmt };
}
export const referralOffer = (code) => ({ kind: 'referral', pct: REFERRAL_PCT, code });
export const creditOffer = () => ({ kind: 'credit', pct: REFERRAL_PCT });
export const winbackOffer = () => ({ kind: 'winback', off: WINBACK_OFF });

// What we write into the Razorpay order notes, and read back later.
export const promoNote = (q) => (q.discount ? q.discount.kind + ':' + (q.discount.code || '-') + ':' + q.discount.amount : '');
export function parsePromo(s) {
  const m = /^(referral|credit|winback):([^:]*):(\d+)$/.exec(String(s || ''));
  return m ? { kind: m[1], code: m[2] === '-' ? '' : m[2], amount: Number(m[3]) } : null;
}
