// Public list of client reviews you have approved (shown on the home page).
import { json } from '../lib/http.mjs';
import * as db from '../lib/db.mjs';
import { STORES as S } from '../lib/db.mjs';

export const config = { path: '/api/reviews' };

export default async (req) => {
  if (req.method !== 'GET') return json(405, { error: 'Method not allowed.' }, { headers: { Allow: 'GET' } });
  const out = [];
  try {
    for (const k of await db.keys(S.reviews)) {
      const r = await db.get(S.reviews, k);
      if (r && r.approved && r.publish) out.push({ name: r.name, biz: r.biz, rating: r.rating, text: r.text, at: r.updatedAt || r.createdAt || 0 });
    }
  } catch (e) { console.error('reviews list failed', String(e)); }
  out.sort((a, b) => b.at - a.at);
  return json(200, { reviews: out.slice(0, 12).map(({ at, ...r }) => r) }, { headers: { 'Cache-Control': 'public, max-age=300' } });
};
