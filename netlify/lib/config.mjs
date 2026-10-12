// Shared settings for the dashboard, emails and payments.
// Keep BASE_PRICE / BUMP_PRICE in step with netlify/functions/create-order.js and public/assets/config.js.
export const BASE_PRICE = 999;      // rupees: report + 30-day calendar (first order and every renewal)
export const BUMP_PRICE = 299;      // rupees: 10 reel scripts add-on
export const PACK3_PRICE = 2699;    // rupees: 3-month pack (3 monthly calendars, one every 30 days)
export const PERIOD_DAYS = 30;      // one month = 30 days
export const REFERRAL_PCT = 10;     // percent off for a friend's first order AND for the referrer's next renewal
export const WINBACK_OFF = 100;     // rupees off a renewal for people whose plan ended two weeks ago
export const WINBACK_AFTER_DAYS = 14;
export const WINBACK_VALID_DAYS = 7;
export const REVIEW_AFTER_DAYS = 7; // ask for a review this many days after the first report is delivered
export const UDYAM = 'UDYAM-PB-12-0008441';
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
