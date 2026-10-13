// Public settings the website needs (currently just the Meta Pixel ID, so you can set it in Netlify).
export const config = { path: '/api/site-config' };

export default async () => {
  const pid = String(process.env.META_PIXEL_ID || '').replace(/\D/g, '').slice(0, 20);
  return new Response(JSON.stringify({ pixelId: pid }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });
};
