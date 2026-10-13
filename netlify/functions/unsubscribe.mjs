// "Stop these emails" link. The page asks for one tap to confirm (so email scanners that open links
// cannot unsubscribe people by accident). Mail apps' one-click button posts here too.
import { readToken } from '../lib/auth.mjs';
import { setUnsub } from '../lib/prefs.mjs';
import { SELLER, esc } from '../lib/config.mjs';

export const config = { path: '/api/unsubscribe' };

const page = (title, body) => new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(title) + '</title></head>' +
  '<body style="margin:0;background:#f2f6f4;font-family:Arial,Helvetica,sans-serif;color:#10211f"><div style="max-width:460px;margin:48px auto;padding:0 20px"><div style="background:#fff;border:1px solid #dfe8e4;border-radius:14px;padding:28px">' +
  '<div style="font-weight:700;color:#b87900;font-size:18px;margin-bottom:10px">Vigyapan Studio</div>' + body + '</div><p style="font-size:12px;color:#7a948f;text-align:center">' + esc(SELLER.name) + ', ' + esc(SELLER.place) + '</p></div></body></html>',
  { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' } });

export default async (req) => {
  const url = new URL(req.url);
  let t = url.searchParams.get('t') || '';
  if (req.method === 'POST' && !t) {
    try { t = String((await req.formData()).get('t') || ''); } catch (e) { t = ''; }
  }
  const tok = readToken(t);
  if (!tok || !tok.u) return page('Link not valid', '<h1 style="font-size:20px;margin:0 0 8px">This link is not valid</h1><p style="line-height:1.6;color:#33504b">It may be old or incomplete. Reply to any of our emails and we will stop them by hand.</p>');
  if (req.method === 'POST') {
    await setUnsub(tok.u, true);
    return page('Unsubscribed', '<h1 style="font-size:20px;margin:0 0 8px">Done. No more of these emails.</h1><p style="line-height:1.6;color:#33504b">We will stop the weekly plan, progress and offer emails for <b>' + esc(tok.u) + '</b>. You will still get receipts, invoices, login codes and plan-ending notices if you are a customer.</p>');
  }
  return page('Stop these emails?', '<h1 style="font-size:20px;margin:0 0 8px">Stop these emails?</h1><p style="line-height:1.6;color:#33504b">This will stop the weekly plan, progress and offer emails for <b>' + esc(tok.u) + '</b>. Receipts, invoices and login codes are not affected.</p>' +
    '<form method="POST" action="/api/unsubscribe"><input type="hidden" name="t" value="' + esc(t) + '"><button style="background:#FFB72B;color:#2A1A00;font-weight:700;font-size:16px;border:0;border-radius:12px;padding:12px 22px;cursor:pointer">Yes, stop them</button></form>');
};
