// Login by emailed code (no passwords), signed cookies, and the admin password check.
import { createHmac, createHash, timingSafeEqual, randomInt } from 'node:crypto';
import * as db from './db.mjs';
import { STORES as S } from './db.mjs';
import { esc, siteUrl } from './config.mjs';
import { cidOf, normEmail, getCustomer } from './members.mjs';
import { sendMail, shell, mailReady } from './mail.mjs';

const secret = () => { const s = process.env.SESSION_SECRET; return s && s.length >= 16 ? s : null; };
export const authReady = () => !!secret();

const hmac = (data) => createHmac('sha256', secret()).update(data).digest('base64url');
const sha = (s) => createHash('sha256').update(String(s)).digest();
export const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export function makeToken(obj) { const p = Buffer.from(JSON.stringify(obj)).toString('base64url'); return p + '.' + hmac(p); }
export function readToken(tok) {
  if (!tok || !authReady()) return null;
  const parts = String(tok).split('.');
  if (parts.length !== 2 || !safeEq(hmac(parts[0]), parts[1])) return null;
  try { const o = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); return o && o.x > Date.now() ? o : null; } catch (e) { return null; }
}
export function parseCookies(req) {
  const out = {};
  String(req.headers.get('cookie') || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return out;
}
export const setCookie = (name, value, maxAgeSec) => name + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAgeSec;
export const clearCookie = (name) => name + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

export function sessionCookieFor(email) { return setCookie('vs_session', makeToken({ e: normEmail(email), x: Date.now() + 30 * 86400000 }), 30 * 86400); }
export function getSession(req) {
  const t = readToken(parseCookies(req).vs_session);
  return t && t.e ? { email: t.e, cid: cidOf(t.e) } : null;
}
export const isAdmin = (req) => { const t = readToken(parseCookies(req).vs_admin); return !!(t && t.a === 1); };
export const adminCookie = () => setCookie('vs_admin', makeToken({ a: 1, x: Date.now() + 12 * 3600000 }), 12 * 3600);

const codeHash = (email, code) => hmac('otp:' + normEmail(email) + ':' + code);

// Sends a 6-digit code. Always behaves the same from the outside, so nobody can use this
// to find out which email addresses are customers.
export async function requestCode(email) {
  email = normEmail(email);
  const cid = cidOf(email);
  const cust = await getCustomer(cid);
  if (!cust || !mailReady()) return;
  const now = Date.now();
  const rec = (await db.get(S.otp, cid)) || {};
  if (rec.sentAt && now - rec.sentAt < 45000) return;
  let count = rec.count || 0, winStart = rec.winStart || now;
  if (now - winStart > 3600000) { count = 0; winStart = now; }
  if (count >= 6) return;
  const code = String(randomInt(100000, 1000000));
  await db.put(S.otp, cid, { h: codeHash(email, code), exp: now + 600000, tries: 0, sentAt: now, count: count + 1, winStart });
  const html = shell({
    preheader: 'Your login code is ' + code,
    heading: 'Your login code',
    bodyHtml: '<p style="margin:0 0 14px">Use this code to log in to your Vigyapan Studio dashboard. It works for 10 minutes.</p>' +
      '<div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#10211f;background:#f2f6f4;border-radius:12px;padding:16px 20px;display:inline-block">' + esc(code) + '</div>' +
      '<p style="margin:16px 0 0;color:#7a948f;font-size:13px">If you did not ask for this, you can ignore this email. Nobody can log in without the code.</p>',
    small: ''
  });
  await sendMail({ to: email, subject: 'Your Vigyapan Studio login code: ' + code, html, text: 'Your Vigyapan Studio login code is ' + code + '. It works for 10 minutes.' });
}

export async function verifyCode(email, code) {
  email = normEmail(email);
  const cid = cidOf(email);
  const rec = await db.get(S.otp, cid);
  if (!rec || rec.exp < Date.now()) return false;
  if (rec.tries >= 5) { await db.del(S.otp, cid); return false; }
  rec.tries += 1;
  await db.put(S.otp, cid, rec);
  const ok = safeEq(rec.h, codeHash(email, String(code).trim()));
  if (ok) await db.del(S.otp, cid);
  return ok;
}

// Admin password check with a simple lock-out after repeated wrong tries.
export async function checkAdminPassword(ip, password) {
  const key = 'adm-' + createHash('sha256').update(String(ip || 'x')).digest('hex').slice(0, 16);
  const now = Date.now();
  let rec = (await db.get(S.limits, key)) || { n: 0, first: now };
  if (now - rec.first > 900000) rec = { n: 0, first: now };
  if (rec.n >= 8) return { ok: false, limited: true };
  const expected = process.env.ADMIN_PASSWORD;
  const ok = !!expected && expected.length >= 8 && timingSafeEqual(sha(password), sha(expected));
  if (ok) await db.del(S.limits, key); else await db.put(S.limits, key, { n: rec.n + 1, first: rec.first });
  return { ok, limited: false };
}
