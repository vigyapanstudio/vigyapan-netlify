// Simple "no more than N tries per hour" limiter, kept in Netlify Blobs.
import { createHash } from 'node:crypto';
import * as db from './db.mjs';
import { STORES as S } from './db.mjs';

export async function allow(bucket, who, max, windowMs) {
  const key = bucket + '-' + createHash('sha256').update(String(who || 'x')).digest('hex').slice(0, 16);
  const now = Date.now();
  let rec = (await db.get(S.limits, key)) || { n: 0, first: now };
  if (now - rec.first > windowMs) rec = { n: 0, first: now };
  if (rec.n >= max) return false;
  await db.put(S.limits, key, { n: rec.n + 1, first: rec.first });
  return true;
}
