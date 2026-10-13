// "Stop these emails": a list of people who do not want marketing-style emails (weekly plan,
// progress, follow-ups, offers). Receipts, login codes and plan-ending reminders are not affected.
import * as db from './db.mjs';
import { STORES as S } from './db.mjs';
import { makeToken, authReady } from './auth.mjs';
import { cidOf, normEmail } from './members.mjs';
import { siteUrl, DAY } from './config.mjs';

export async function isUnsub(email) { return !!(await db.get(S.unsub, cidOf(email))); }
export async function setUnsub(email, on) {
  if (on) await db.put(S.unsub, cidOf(email), { email: normEmail(email), at: Date.now() });
  else await db.del(S.unsub, cidOf(email));
}
// A signed link that works without logging in (valid for 2 years).
export function unsubUrl(email) {
  const site = siteUrl();
  if (!site || !authReady()) return '';
  try { return site + '/api/unsubscribe?t=' + makeToken({ u: normEmail(email), x: Date.now() + 730 * DAY }); } catch (e) { return ''; }
}
