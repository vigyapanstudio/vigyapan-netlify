// A logged-in customer downloads one of their own reports.
import { getSession } from '../lib/auth.mjs';
import { getDeliveries } from '../lib/members.mjs';
import * as db from '../lib/db.mjs';
import { STORES as S } from '../lib/db.mjs';

export const config = { path: '/api/download' };

export default async (req) => {
  const sess = getSession(req);
  if (!sess) return new Response('Please log in first.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const id = new URL(req.url).searchParams.get('id') || '';
  const d = (await getDeliveries(sess.cid)).find((x) => x.id === id);
  if (!d) return new Response('Not found.', { status: 404 });
  const buf = await db.getBin(S.files, sess.cid + '/' + d.id);
  if (!buf) return new Response('Not found.', { status: 404 });
  return new Response(buf, { status: 200, headers: {
    'Content-Type': d.type || 'application/octet-stream',
    'Content-Disposition': 'attachment; filename="' + String(d.filename || 'report').replace(/[^A-Za-z0-9._-]/g, '_') + '"',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'
  } });
};
