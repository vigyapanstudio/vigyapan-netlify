// Shared settings for the dashboard, emails and payments.
// Keep BASE_PRICE / BUMP_PRICE in step with netlify/functions/create-order.js and public/assets/config.js.
export const BASE_PRICE = 999;      // rupees: report + 30-day calendar (first order and every renewal)
export const BUMP_PRICE = 299;      // rupees: 10 reel scripts add-on
export const PERIOD_DAYS = 30;      // each payment buys 30 days
export const REMIND_DAYS = 5;       // "ending soon" status/reminder window
export const DAY = 86400000;
export const WHATSAPP = '917009884880';

export const SELLER = {
  name: 'Vigyapan Studio',
  proprietor: 'Nipun Aggarwal',
  place: 'Zirakpur, Punjab, India',
  email: 'vigyapanstudio@gmail.com',
  phone: '+91 70098 84880',
  instagram: '@vigyapan_studio'
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');
export const siteUrl = () => String(process.env.SITE_URL || process.env.URL || '').replace(/\/$/, '');
export const istDate = (ms, withTime) => new Date(ms).toLocaleString('en-IN', Object.assign(
  { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' },
  withTime ? { hour: '2-digit', minute: '2-digit', hour12: true } : {}));
export const cleanText = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
