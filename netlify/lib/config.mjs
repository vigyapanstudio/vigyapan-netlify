// Shared settings for the dashboard, emails and payments.
// Keep BASE_PRICE / BUMP_PRICE in step with netlify/functions/order-start.js and public/assets/config.js.
export const BASE_PRICE = 1499;      // rupees: report + 30-day calendar (first order and every renewal)
export const BUMP_PRICE = 499;      // rupees: 10 reel scripts add-on
export const PACK3_PRICE = 3999;    // rupees: 3-month pack (3 monthly calendars, one every 30 days)
export const PERIOD_DAYS = 30;      // one month = 30 days
export const REFERRAL_PCT = 10;     // percent off for a friend's first order AND for the referrer's next renewal
export const WINBACK_OFF = 100;     // rupees off a renewal for people whose plan ended two weeks ago
export const WINBACK_AFTER_DAYS = 14;
export const WINBACK_VALID_DAYS = 7;
export const REVIEW_AFTER_DAYS = 7; // ask for a review this many days after the first report is delivered
export const UDYAM = 'UDYAM-PB-12-0008441';
export const FOLLOWUP_AFTER_DAYS = 3;  // free-audit leads get a follow-up email this many days later
export const CART_AFTER_HOURS = 2;      // unfinished checkout gets a reminder after this many hours
export const CART_MAX_DAYS = 3;         // ...and never after this many days
export const REMIND_DAYS = 5;       // "ending soon" status/reminder window
export const DAY = 86400000;
export const WHATSAPP = '917009884880';

export const SELLER = {
  name: 'Vigyapan Studio',
  proprietor: 'Nipun Aggarwal',
  place: 'Zirakpur, Punjab, India',
  email: 'vigyapanstudio@gmail.com',
  phone: '+91 70098 84880',
  instagram: '@vigyapan_studio',
  udyam: UDYAM
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');
export const siteUrl = () => String(process.env.SITE_URL || process.env.URL || '').replace(/\/$/, '');
export const istDate = (ms, withTime) => new Date(ms).toLocaleString('en-IN', Object.assign(
  { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' },
  withTime ? { hour: '2-digit', minute: '2-digit', hour12: true } : {}));
export const cleanText = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);

// Extra things a client can buy from the dashboard with one tap. Change names/prices here.
// Optional: set ADDON_PRICES in Netlify like  reels10=499,bio=199  to change prices without editing code.
const ADDON_LIST = [
  { id: 'reels10', name: '10 extra reel scripts', price: 499, desc: 'Word-for-word scripts for 10 more reels, in Hinglish or English.' },
  { id: 'bio', name: 'Instagram bio rewrite', price: 199, desc: '3 bio options written to get enquiries, with a clear call to action.' },
  { id: 'covers', name: 'Highlight cover set', price: 399, desc: '6 matching Highlight covers in your colours, ready to upload.' },
  { id: 'captions', name: '30 ready captions', price: 349, desc: '30 captions in your voice with hashtags, ready to copy and post.' },
  { id: 'hashtags', name: 'Custom hashtag pack', price: 149, desc: '60 hashtags picked for your niche and your city, grouped by reach.' }
];
export function addons() {
  const over = {};
  String(process.env.ADDON_PRICES || '').split(',').forEach((p) => { const m = /^\s*([a-z0-9]+)\s*=\s*(\d{2,5})\s*$/i.exec(p); if (m) over[m[1]] = Number(m[2]); });
  return ADDON_LIST.map((a) => Object.assign({}, a, { price: over[a.id] || a.price }));
}
