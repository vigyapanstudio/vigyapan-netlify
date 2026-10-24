// Scheduled emails that nudge clients and leads. All of them:
//  - run from the daily job (daily-reminders.mjs), once per person per occasion (a flag is saved after sending),
//  - skip anyone who tapped "Stop these emails",
//  - do nothing if email is not set up yet.
import * as db from './db.mjs';
import { STORES as S } from './db.mjs';
import { DAY, FOLLOWUP_AFTER_DAYS, CART_AFTER_HOURS, CART_MAX_DAYS, BASE_PRICE, SELLER, esc, inr, istDate, siteUrl } from './config.mjs';
import { listCustomers, getPayments, computeMembership, getCustomer, cidOf } from './members.mjs';
import { getCal } from './calendar.mjs';
import { upcoming } from './festivals.mjs';
import { sendMail, shell, mailReady } from './mail.mjs';
import { isUnsub, unsubUrl } from './prefs.mjs';
import { listCarts } from './carts.mjs';

const first = (c) => String(c.name || 'there').split(' ')[0];
const istParts = (ms) => { const d = new Date(ms + 19800000); return { dow: d.getUTCDay(), iso: d.toISOString().slice(0, 10), d }; };
const dayLabel = (ms) => new Date(ms).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
const flagGet = async (key) => (await db.get(S.reminders, key)) || { sent: {} };
const batch = async (list, size, fn) => { for (let i = 0; i < list.length; i += size) await Promise.all(list.slice(i, i + size).map(fn)); };

// Monday of this week in India time, as "YYYY-MM-DD" (used so each person gets one weekly email per week)
export function weekKey(now) {
  const p = istParts(now); const back = (p.dow + 6) % 7;
  return new Date(p.d.getTime() - back * DAY).toISOString().slice(0, 10);
}

// ---------- 1. Weekly "this week's plan" ----------
export function weeklyEmail(cust, m, cal, now) {
  const site = siteUrl();
  const dayNo = Math.min(30, Math.max(1, Math.floor((now - m.periodStart) / DAY) + 1));
  const ticks = (cal.ticks[m.periodKey] || []).map(Number);
  const ideas = cal.ideas[m.periodKey] || [];
  const last = Math.min(30, dayNo + 6);
  let rows = '';
  for (let d = dayNo; d <= last; d++) {
    const when = dayLabel(m.periodStart + (d - 1) * DAY);
    const idea = ideas[d - 1];
    rows += '<tr><td style="padding:7px 10px 7px 0;vertical-align:top;white-space:nowrap;color:#7a948f;font-size:13px">Day ' + d + '<br>' + esc(when) + '</td><td style="padding:7px 0;vertical-align:top;border-bottom:1px solid #eef3f1;font-size:14px;color:#10211f">' +
      (idea ? esc(idea) : '<span style="color:#7a948f">See your calendar PDF for this day</span>') + (ticks.includes(d) ? ' <b style="color:#0b7a5a">(done)</b>' : '') + '</td></tr>';
  }
  const fests = upcoming(now, 14, 3);
  const festHtml = fests.length ? '<p style="margin:16px 0 6px;font-weight:700;color:#10211f">Coming up</p>' + fests.map((f) =>
    '<p style="margin:0 0 6px;font-size:14px"><b>' + esc(f.name) + '</b> ' + (f.inDays === 0 ? '(today)' : '(in ' + f.inDays + ' day' + (f.inDays === 1 ? '' : 's') + ')') + ': ' + esc(f.tip) + '</p>').join('') : '';
  const body = '<p style="margin:0 0 12px">Hi ' + esc(first(cust)) + ', here is what to post over the next 7 days. ' +
    (ticks.length ? 'You have posted on <b>' + ticks.length + '</b> of 30 days so far. Keep it going!' : 'Tick off each day in your dashboard as you post, it helps you stay consistent.') + '</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px">' + rows + '</table>' + festHtml +
    '<p style="margin:16px 0 0;color:#7a948f;font-size:13px">Tip: post at the times in your report, and reply to every comment in the first hour.</p>';
  const heading = 'Your plan for this week';
  const url = unsubUrl(cust.email);
  return {
    subject: 'Your Instagram plan for this week, ' + first(cust),
    html: shell({ preheader: 'Day ' + dayNo + ' to day ' + last + ' of your calendar', heading, bodyHtml: body, button: site ? { text: 'Open my dashboard', url: site + '/login' } : null, unsubUrl: url, small: 'You are getting this weekly note because you have a plan with ' + SELLER.name + '.' }),
    text: heading + '\n\n' + body.replace(/<\/tr>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&') + (site ? '\n\nDashboard: ' + site + '/login' : '') + (url ? '\n\nStop these emails: ' + url : ''),
    unsubUrl: url
  };
}
export async function runWeekly(now, opts) {
  now = now == null ? Date.now() : now;
  const out = [];
  if (!mailReady()) return out;
  const p = istParts(now);
  if (!(opts && opts.force) && p.dow !== 1 && p.dow !== 2) return out;           // Monday, with Tuesday as a catch-up day
  const wk = weekKey(now);
  const todo = [];
  for (const c of await listCustomers()) {
    if (todo.length >= 100) break;
    const m = computeMembership(await getPayments(c.cid), now);
    if (!m || m.status === 'expired') continue;
    const flags = await flagGet('wk-' + c.cid);
    if (flags.sent[wk]) continue;
    if (await isUnsub(c.email)) continue;
    todo.push({ c, m, flags });
  }
  await batch(todo, 6, async (j) => {
    try {
      const e = weeklyEmail(j.c, j.m, await getCal(j.c.cid), now);
      await sendMail({ to: j.c.email, subject: e.subject, html: e.html, text: e.text, unsubUrl: e.unsubUrl, idemKey: 'vs-wk-' + j.c.cid + '-' + wk });
      j.flags.sent = { [wk]: now };
      await db.put(S.reminders, 'wk-' + j.c.cid, j.flags);
      out.push({ email: j.c.email });
    } catch (err) { console.error('WEEKLY FAILED for ' + j.c.email, String(err)); }
  });
  console.log('WEEKLY DONE: sent ' + out.length);
  return out;
}

// ---------- 2. Progress email when a 30-day period ends ----------
export function progressEmail(cust, m, period, ticksCount, now) {
  const site = siteUrl();
  const pct = Math.round(ticksCount / 30 * 100);
  const line = ticksCount >= 24 ? 'That is excellent consistency. Accounts that post this regularly are the ones that grow.'
    : ticksCount >= 12 ? 'A solid month. A few more posting days next month and you will feel the difference.'
    : ticksCount >= 1 ? 'A start is a start. Next month, try to post on just two more days each week.'
    : 'You did not tick any days this month. Ticking days is optional, but it helps you see your streak and stay on track.';
  const stillActive = m.expiresAt > now;
  const bar = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;border-radius:8px;overflow:hidden"><tr><td width="' + Math.max(2, pct) + '%" style="background:#FFB72B;height:14px;font-size:0;line-height:0">&nbsp;</td><td width="' + Math.max(1, 100 - pct) + '%" style="background:#e6ece9;height:14px;font-size:0;line-height:0">&nbsp;</td></tr></table>';
  const body = '<p style="margin:0 0 6px">Hi ' + esc(first(cust)) + ', your 30 days (' + esc(istDate(period.start)) + ' to ' + esc(istDate(period.end)) + ') are complete.</p>' +
    '<p style="margin:10px 0 0;font-size:26px;font-weight:700;color:#10211f">You posted on ' + ticksCount + ' of 30 days</p>' + bar +
    '<p style="margin:0 0 12px">' + line + '</p>' +
    (stillActive ? '<p style="margin:0">Your next calendar is already part of your plan. Open your dashboard to see it.</p>'
      : '<p style="margin:0">Want a fresh 30-day calendar and an updated look at your page and competitors? Renew for ' + inr(BASE_PRICE) + '. There is no automatic payment.</p>');
  const url = unsubUrl(cust.email);
  return {
    subject: 'Your month in numbers: ' + ticksCount + ' of 30 days posted',
    html: shell({ preheader: 'You posted ' + ticksCount + ' of 30 days', heading: 'Your month in numbers', bodyHtml: body, button: site ? { text: stillActive ? 'Open my dashboard' : 'Renew in my dashboard', url: site + '/login' } : null, unsubUrl: url }),
    text: 'You posted on ' + ticksCount + ' of 30 days. ' + line + (site ? ' Dashboard: ' + site + '/login' : '') + (url ? '\nStop these emails: ' + url : ''),
    unsubUrl: url
  };
}
export async function runProgress(now) {
  now = now == null ? Date.now() : now;
  const out = [];
  if (!mailReady()) return out;
  const todo = [];
  for (const c of await listCustomers()) {
    if (todo.length >= 60) break;
    const m = computeMembership(await getPayments(c.cid), now);
    if (!m) continue;
    const ended = m.periods.filter((p) => p.end <= now && now - p.end <= 10 * DAY);
    if (!ended.length) continue;
    const period = ended[ended.length - 1];
    const flags = await flagGet('pg-' + c.cid);
    if (flags.sent[period.key]) continue;
    if (await isUnsub(c.email)) continue;
    todo.push({ c, m, period, flags });
  }
  await batch(todo, 6, async (j) => {
    try {
      const cal = await getCal(j.c.cid);
      const n = (cal.ticks[j.period.key] || []).length;
      const e = progressEmail(j.c, j.m, j.period, n, now);
      await sendMail({ to: j.c.email, subject: e.subject, html: e.html, text: e.text, unsubUrl: e.unsubUrl, idemKey: 'vs-pg-' + j.c.cid + '-' + j.period.key });
      j.flags.sent[j.period.key] = now;
      await db.put(S.reminders, 'pg-' + j.c.cid, j.flags);
      out.push({ email: j.c.email });
    } catch (err) { console.error('PROGRESS FAILED for ' + j.c.email, String(err)); }
  });
  console.log('PROGRESS DONE: sent ' + out.length);
  return out;
}

// ---------- 9. Follow-up to free-audit leads (about 3 days later) ----------
export async function runLeadFollowups(now) {
  now = now == null ? Date.now() : now;
  const out = [];
  if (!mailReady()) return out;
  const site = siteUrl();
  for (const k of await db.keys(S.leads)) {
    if (out.length >= 30) break;
    const l = await db.get(S.leads, k);
    if (!l || l.kind === 'manage' || !l.email || l.followedUp) continue;
    const age = now - l.createdAt;
    if (age < FOLLOWUP_AFTER_DAYS * DAY || age > 10 * DAY) continue;
    if (await getCustomer(cidOf(l.email))) { l.followedUp = -1; await db.put(S.leads, k, l); continue; }   // already a customer
    if (await isUnsub(l.email)) continue;
    const fn = String(l.name || 'there').split(' ')[0];
    const url = unsubUrl(l.email);
    try {
      await sendMail({ to: l.email, subject: 'Did the tips help, ' + fn + '?',
        html: shell({ preheader: 'A quick note about @' + l.ig, heading: 'Did the 3 tips help?',
          bodyHtml: '<p style="margin:0 0 12px">Hi ' + esc(fn) + ', a few days ago you asked us to look at <b>@' + esc(l.ig) + '</b>. We hope the tips were useful.</p>' +
            '<p style="margin:0 0 12px">If you would like the full picture, the <b>Instagram Growth Report + 30-Day Content Calendar</b> covers your page, 3 competitors, best posting times, hashtags and a day-by-day plan, delivered within 48 hours for ' + inr(BASE_PRICE) + '.</p>' +
            '<p style="margin:0;color:#7a948f;font-size:13px">No pressure. If you have a question first, just reply to this email or WhatsApp ' + esc(SELLER.phone) + '.</p>',
          button: site ? { text: 'See the full report', url: site + '/instagram-analysis/#order' } : null, unsubUrl: url, small: 'You asked for a free audit on our website, so we are following up once.' }),
        text: 'A few days ago you asked us to look at @' + l.ig + '. The full Growth Report + 30-Day Calendar is ' + inr(BASE_PRICE) + (site ? ': ' + site + '/instagram-analysis/#order' : '.') + (url ? '\nStop these emails: ' + url : ''),
        unsubUrl: url, idemKey: 'vs-fu-' + l.id });
      l.followedUp = now; await db.put(S.leads, k, l);
      out.push({ email: l.email });
    } catch (e) { console.error('LEAD FOLLOW-UP FAILED for ' + l.email, String(e)); }
  }
  console.log('LEAD FOLLOW-UPS DONE: sent ' + out.length);
  return out;
}

// ---------- 8. Reminder for an unfinished checkout ----------
export async function runCartReminders(now) {
  now = now == null ? Date.now() : now;
  const out = [];
  if (!mailReady()) return out;
  const site = siteUrl();
  for (const c of await listCarts()) {
    if (out.length >= 40) break;
    if (c.emailedAt) continue;
    const age = now - c.updatedAt;
    if (age < CART_AFTER_HOURS * 3600000) continue;
    if (now - c.createdAt > CART_MAX_DAYS * DAY) continue;
    if (await getCustomer(c.cid)) continue;
    if (await isUnsub(c.email)) continue;
    const fn = String(c.name || 'there').split(' ')[0];
    const url = unsubUrl(c.email);
    try {
      await sendMail({ to: c.email, subject: 'You are one step away, ' + fn,
        html: shell({ preheader: 'Your details are saved. Finish in a minute.', heading: 'You are one step away',
          bodyHtml: '<p style="margin:0 0 12px">Hi ' + esc(fn) + ', you started ordering your Instagram Growth Report + 30-Day Calendar for <b>@' + esc(c.ig) + '</b> but did not finish paying. Your details are saved, so it takes about a minute.</p>' +
            '<p style="margin:0;color:#7a948f;font-size:13px">If something went wrong with the payment, or you have a question, reply to this email or WhatsApp ' + esc(SELLER.phone) + '. We will help.</p>',
          button: site ? { text: 'Finish my order', url: site + '/instagram-analysis/?resume=' + c.rid + '#order' } : null, unsubUrl: url, small: 'We send this reminder only once.' }),
        text: 'You started an order for @' + c.ig + ' but did not finish paying. Finish here: ' + (site ? site + '/instagram-analysis/?resume=' + c.rid + '#order' : '') + (url ? '\nStop these emails: ' + url : ''),
        unsubUrl: url, idemKey: 'vs-cart-' + c.rid });
      c.emailedAt = now; await db.put(S.carts, 'c-' + c.rid, c);
      out.push({ email: c.email });
    } catch (e) { console.error('CART REMINDER FAILED for ' + c.email, String(e)); }
  }
  console.log('CART REMINDERS DONE: sent ' + out.length);
  return out;
}
