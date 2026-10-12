// The 30-day posting checklist: which days a customer has ticked, plus the day-by-day ideas you type in.
// Everything is stored per customer and per 30-day period (period key = paymentId:number).
import * as db from './db.mjs';
import { STORES as S } from './db.mjs';
import { cleanText } from './config.mjs';

export async function getCal(cid) {
  const c = await db.get(S.calendar, cid);
  return Object.assign({ ideas: {}, ticks: {} }, c || {});
}
export async function tickDay(cid, key, day, done) {
  const c = await getCal(cid);
  const set = new Set((c.ticks[key] || []).map(Number));
  if (done) set.add(day); else set.delete(day);
  c.ticks[key] = [...set].filter((d) => d >= 1 && d <= 30).sort((a, b) => a - b);
  await db.put(S.calendar, cid, c);
  return c.ticks[key];
}
export async function saveIdeas(cid, key, text) {
  const c = await getCal(cid);
  const lines = String(text || '').split(/\r?\n/).map((l) => cleanText(l, 180)).filter(Boolean).slice(0, 30);
  c.ideas[key] = lines;
  await db.put(S.calendar, cid, c);
  return lines;
}
export function viewFor(cal, key) {
  return { ideas: (cal.ideas[key] || []).slice(0, 30), ticks: (cal.ticks[key] || []).map(Number) };
}
