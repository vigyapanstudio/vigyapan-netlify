// The link in the "you did not finish your order" email opens the order form with their details filled in.
import { json, readJson } from '../lib/http.mjs';
import { getCartByRid } from '../lib/carts.mjs';
import { allow } from '../lib/limits.mjs';

export const config = { path: '/api/resume' };

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' }, { headers: { Allow: 'POST' } });
  const b = await readJson(req);
  if (b === null) return json(415, { error: 'Bad request.' });
  const ip = (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || '';
  if (!(await allow('resume', ip, 30, 3600000))) return json(429, { error: 'Too many tries.' });
  const c = await getCartByRid(String(b.rid || ''));
  if (!c) return json(404, { error: 'This link has expired.' });
  return json(200, { form: { name: c.name, phone: c.phone, email: c.email, ig: c.ig, biz: c.biz, type: c.type, city: c.city, followers: c.followers, goal: c.goal, comp: c.comp, about: c.about, bump: !!c.bump, months: c.months === 3 ? 3 : 1, code: c.code || '', wa: !!c.wa } });
};
