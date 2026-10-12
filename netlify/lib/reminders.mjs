// Daily job: email customers whose month is ending (5 days before, 1 day before) or has just ended.
import * as db from './db.mjs';
import { STORES as S } from './db.mjs';
import { DAY, BASE_PRICE, BUMP_PRICE, WINBACK_OFF, WINBACK_AFTER_DAYS, WINBACK_VALID_DAYS, REVIEW_AFTER_DAYS, REFERRAL_PCT, SELLER, esc, inr, istDate, siteUrl } from './config.mjs';
import { listCustomers, getPayments, computeMembership, getDeliveries, updateCustomer } from './members.mjs';
import { sendMail, shell, mailReady } from './mail.mjs';

const ORDER = { soon5: 1, soon1: 2, expired: 3 };

function pickType(m, now) {
  if (m.expiresAt > now) {
    const d = Math.ceil((m.expiresAt - now) / DAY);
    if (d <= 1) return 'soon1';
    if (d <= 5) return 'soon5';
    return null;
  }
  return now - m.expiresAt <= 10 * DAY ? 'expired' : null;
}

export function reminderEmail(type, cust, m, now) {
  const site = siteUrl();
  const url = site ? site + '/login' : '';
  const first = String(cust.name || 'there').split(' ')[0];
  const endDate = istDate(m.expiresAt);
  const days = Math.max(1, Math.ceil((m.expiresAt - now) / DAY));
  let subject, heading, body;
  if (type === 'soon5') {
    subject = 'Your Vigyapan Studio month ends on ' + endDate + ' (' + days + ' days left)';
    heading = 'Your month ends in ' + days + ' days';
    body = '<p style="margin:0 0 12px">Hi ' + esc(first) + ', your current growth report and 30-day calendar run until <b>' + esc(endDate) + '</b>.</p>' +
      '<p style="margin:0 0 12px">To get your <b>next month’s calendar</b> and a refreshed look at your page and competitors without a gap, renew from your dashboard. It takes under a minute (' + inr(BASE_PRICE) + ', or ' + inr(BASE_PRICE + BUMP_PRICE) + ' with 10 reel scripts).</p>' +
      (cust.credits > 0 ? '<p style="margin:0 0 12px"><b>Good news:</b> you have a ' + REFERRAL_PCT + '% referral credit waiting. It is applied automatically when you renew.</p>' : '') +
      '<p style="margin:0;color:#7a948f;font-size:13px">Renewing early does not waste any days. Your new 30 days start the day this month ends.</p>';
  } else if (type === 'soon1') {
    subject = 'Last day tomorrow: renew your Vigyapan Studio plan';
    heading = 'Your month ends tomorrow';
    body = '<p style="margin:0 0 12px">Hi ' + esc(first) + ', your plan ends on <b>' + esc(endDate) + '</b>. Renew now and your next 30-day calendar is prepared for you, so your posting does not stop.</p>' +
      '<p style="margin:0;color:#7a948f;font-size:13px">Renewal is ' + inr(BASE_PRICE) + ' for the month. There is no automatic charge, you only pay when you choose to.</p>';
  } else {
    subject = 'Your Vigyapan Studio month has ended. Ready for the next one?';
    heading = 'Ready for next month’s calendar?';
    body = '<p style="margin:0 0 12px">Hi ' + esc(first) + ', your month ended on <b>' + esc(endDate) + '</b>. Your past reports and calendars stay saved in your dashboard.</p>' +
      '<p style="margin:0">Renew for ' + inr(BASE_PRICE) + ' to get a fresh 30-day calendar, updated hashtags and a new look at your competitors.</p>';
  }
  const html = shell({ preheader: heading, heading, bodyHtml: body, button: url ? { text: 'Renew in my dashboard', url } : null,
    small: 'You are getting this because you bought a plan from ' + SELLER.name + '. There is no automatic payment.' });
  const text = heading + '\n\n' + body.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&') + (url ? '\n\nRenew: ' + url : '');
  return { subject, html, text };
}

export async function runReminders(now) {
  now = now == null ? Date.now() : now;
  const result = { checked: 0, sent: [], failed: 0, skipped: 'none' };
  if (!mailReady()) { console.log('REMINDERS SKIPPED: RESEND_API_KEY or MAIL_FROM missing'); result.skipped = 'email not configured'; return result; }
  const customers = await listCustomers();
  const jobs = [];
  for (const c of customers) {
    result.checked++;
    const m = computeMembership(await getPayments(c.cid), now);
    if (!m) continue;
    const type = pickType(m, now);
    if (!type) continue;
    const flags = (await db.get(S.reminders, c.cid)) || { sent: {} };
    const base = new Date(m.expiresAt).toISOString() + '|';
    if (flags.sent[base + type]) continue;
    // already past a stage? then do not send the earlier ones later
    if (Object.keys(flags.sent).some((k) => k.startsWith(base) && ORDER[k.slice(base.length)] > ORDER[type])) continue;
    jobs.push({ c, m, type, flags, base });
  }
  const todo = jobs.slice(0, 120);   // scheduled functions get 30 seconds; the rest go out tomorrow
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(todo.slice(i, i + 6).map(async (j) => {
      try {
        const e = reminderEmail(j.type, j.c, j.m, now);
        await sendMail({ to: j.c.email, subject: e.subject, html: e.html, text: e.text, idemKey: 'vs-rem-' + j.c.cid + '-' + j.type + '-' + j.m.expiresAt });
        Object.keys(ORDER).forEach((t) => { if (ORDER[t] <= ORDER[j.type]) j.flags.sent[j.base + t] = now; });
        await db.put(S.reminders, j.c.cid, j.flags);
        result.sent.push({ email: j.c.email, name: j.c.name, type: j.type, ends: istDate(j.m.expiresAt) });
      } catch (err) { result.failed++; console.error('REMINDER FAILED for ' + j.c.email, String(err)); }
    }));
  }
  if (result.sent.length) {
    try {
      const rows = result.sent.map((s) => '<li>' + esc(s.name || s.email) + ' (' + esc(s.email) + '): ' + (s.type === 'expired' ? 'ended ' : 'ends ') + esc(s.ends) + '</li>').join('');
      await sendMail({ to: process.env.OWNER_EMAIL || SELLER.email, subject: 'Reminders sent today: ' + result.sent.length,
        html: '<div style="font-family:Arial,sans-serif;font-size:14px"><p>We emailed these customers about their month:</p><ul>' + rows + '</ul></div>',
        text: result.sent.map((s) => s.email + ' - ' + s.type + ' - ' + s.ends).join('\n') });
    } catch (e) { console.error('owner digest failed', String(e)); }
  }
  console.log('REMINDERS DONE: checked ' + result.checked + ', sent ' + result.sent.length + ', failed ' + result.failed);
  return result;
}


// ---- Win-back: two weeks after a plan ended, offer a small discount for 7 days ----
export async function runWinback(now) {
  now = now == null ? Date.now() : now;
  const out = [];
  if (!mailReady()) return out;
  const site = siteUrl();
  for (const c of await listCustomers()) {
    if (out.length >= 30) break;
    const m = computeMembership(await getPayments(c.cid), now);
    if (!m || m.status !== 'expired') continue;
    const since = now - m.expiresAt;
    if (since < WINBACK_AFTER_DAYS * DAY || since > 45 * DAY) continue;
    if (c.winback && c.winback.forExpiry === m.expiresAt) continue;
    const until = now + WINBACK_VALID_DAYS * DAY;
    const first = String(c.name || 'there').split(' ')[0];
    const price = BASE_PRICE - WINBACK_OFF;
    try {
      await sendMail({ to: c.email, subject: 'A small thank-you: ' + inr(WINBACK_OFF) + ' off your next calendar',
        html: shell({ preheader: inr(WINBACK_OFF) + ' off until ' + istDate(until), heading: 'We saved a ' + inr(WINBACK_OFF) + ' discount for you',
          bodyHtml: '<p style="margin:0 0 12px">Hi ' + esc(first) + ', it has been a couple of weeks since your last plan ended. If you would like a fresh 30-day calendar and an updated look at your page, renew this week for <b>' + inr(price) + '</b> instead of ' + inr(BASE_PRICE) + '.</p>' +
            '<p style="margin:0;color:#7a948f;font-size:13px">Log in with this email and the discount is already applied. It is valid until <b>' + esc(istDate(until)) + '</b>. There is no automatic payment.</p>',
          button: site ? { text: 'Renew with ' + inr(WINBACK_OFF) + ' off', url: site + '/login' } : null,
          small: 'You are getting this because you bought a plan from ' + SELLER.name + '.' }),
        text: 'Renew this week for ' + inr(price) + ' instead of ' + inr(BASE_PRICE) + '. Log in: ' + (site ? site + '/login' : ''), idemKey: 'vs-win-' + c.cid + '-' + m.expiresAt });
      await updateCustomer(c.cid, { winback: { forExpiry: m.expiresAt, sentAt: now, until, used: false } });
      out.push({ email: c.email, name: c.name });
    } catch (e) { console.error('WINBACK FAILED for ' + c.email, String(e)); }
  }
  console.log('WINBACK DONE: sent ' + out.length);
  return out;
}

// ---- Review request: a week after the first report is delivered ----
export async function runReviewAsks(now) {
  now = now == null ? Date.now() : now;
  const out = [];
  if (!mailReady()) return out;
  const site = siteUrl();
  for (const c of await listCustomers()) {
    if (out.length >= 30) break;
    if (c.reviewAskedAt) continue;
    const dl = await getDeliveries(c.cid);
    if (!dl.length) continue;
    const firstAt = dl.reduce((mn, d) => Math.min(mn, d.uploadedAt), Infinity);
    if (now - firstAt < REVIEW_AFTER_DAYS * DAY) continue;
    if (await db.get(S.reviews, c.cid)) { await updateCustomer(c.cid, { reviewAskedAt: now }); continue; }
    const first = String(c.name || 'there').split(' ')[0];
    try {
      await sendMail({ to: c.email, subject: 'How is your plan going, ' + first + '?',
        html: shell({ preheader: 'Two minutes to tell us how it went', heading: 'How is your plan going?',
          bodyHtml: '<p style="margin:0 0 12px">Hi ' + esc(first) + ', it has been a week since your report was ready. If you have a minute, we would love to hear how it is going. A few honest lines help us improve, and help other small businesses decide.</p>' +
            '<p style="margin:0;color:#7a948f;font-size:13px">Log in, scroll to <b>Share your feedback</b>, pick your stars and write a sentence or two. You choose whether we may show it on our website.</p>',
          button: site ? { text: 'Share my feedback', url: site + '/login' } : null }),
        text: 'How is your plan going? Share your feedback after logging in: ' + (site ? site + '/login' : ''), idemKey: 'vs-rev-' + c.cid });
      await updateCustomer(c.cid, { reviewAskedAt: now });
      out.push({ email: c.email, name: c.name });
    } catch (e) { console.error('REVIEW ASK FAILED for ' + c.email, String(e)); }
  }
  console.log('REVIEW REQUESTS DONE: sent ' + out.length);
  return out;
}
