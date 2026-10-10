export const json = (status, obj, extra) => {
  const h = new Headers(Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra && extra.headers));
  (extra && extra.cookies || []).forEach((c) => h.append('Set-Cookie', c));
  return new Response(JSON.stringify(obj), { status, headers: h });
};
// Only accept JSON posts (blocks form-based cross-site tricks). Returns null if the request is not JSON.
export async function readJson(req) {
  if (!/application\/json/i.test(req.headers.get('content-type') || '')) return null;
  try { return (await req.json()) || {}; } catch (e) { return {}; }
}
