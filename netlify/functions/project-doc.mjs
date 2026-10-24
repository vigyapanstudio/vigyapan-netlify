// The page your client opens from the email: the quotation (they can accept it here) or an invoice.
// You can also open the same pages from Admin > Projects (needs your admin login).
import { isAdmin } from '../lib/auth.mjs';
import { json, readJson } from '../lib/http.mjs';
import { getProject, saveProject, renderQuote, renderInvoice, readDocToken, validUntil, quoteNo } from '../lib/projects.mjs';
import { sendMail, shell, mailReady } from '../lib/mail.mjs';
import { SELLER, esc, inr, cleanText } from '../lib/config.mjs';

export const config = { path: '/api/project-doc' };

const page = (status, html) => new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
const sorry = (msg) => page(404, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link problem</title><body style="font-family:Arial;background:#06201F;color:#F3F7F2;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px"><div style="max-width:420px"><h2 style="color:#FFB72B">' + esc(msg) + '</h2><p>Please message us on WhatsApp (' + esc(SELLER.phone) + ') and we will send you a fresh link.</p></div>');

export default async (req, context) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const admin = isAdmin(req);
    let p, type, payId, forClient = false, token = '';
    if (url.searchParams.get('t')) {
      const o = readDocToken(url.searchParams.get('t'));
      if (!o) return sorry('This link is not valid or has expired.');
      p = await getProject(o.p); type = o.t; payId = o.i; forClient = true; token = url.searchParams.get('t');
    } else if (admin) {
      p = await getProject(url.searchParams.get('id')); type = url.searchParams.get('type') === 'inv' ? 'inv' : 'quote'; payId = url.searchParams.get('pay') || '';
    } else return sorry('Please log in to the admin page first.');
    if (!p) return sorry('We could not find this document.');
    if (type === 'inv') {
      const pay = (p.payments || []).find((x) => x.id === payId);
      if (!pay) return sorry('We could not find this invoice.');
      return page(200, renderInvoice(p, pay, { forClient: true }));
    }
    return page(200, renderQuote(p, { forClient: true, token: forClient ? token : '' }));
  }
  if (req.method === 'POST') {
    const b = await readJson(req);
    if (b === null) return json(415, { error: 'Bad request.' });
    const o = readDocToken(String(b.t || ''));
    if (!o || o.t !== 'quote') return json(400, { error: 'This link is not valid or has expired.' });
    const p = await getProject(o.p);
    if (!p) return json(404, { error: 'We could not find this quotation.' });
    if (p.acceptedAt) return json(200, { ok: true, already: true });
    if (b.agree !== true) return json(400, { error: 'Please tick the box to agree.' });
    const name = cleanText(b.name, 80);
    if (name.length < 2) return json(400, { error: 'Please type your full name.' });
    if (Date.now() > validUntil(p)) return json(400, { error: 'This quotation has expired. Please message us for a fresh one.' });
    p.acceptedAt = Date.now(); p.acceptedBy = name; p.acceptedVia = 'online';
    p.acceptedIp = ((context && context.ip) || req.headers.get('x-nf-client-connection-ip') || '').slice(0, 60);
    if (p.status === 'quote') p.status = 'accepted';
    await saveProject(p);
    if (mailReady()) {
      try {
        await sendMail({ to: process.env.OWNER_EMAIL || SELLER.email, subject: 'Quotation accepted: ' + p.title + ' (' + name + ')',
          html: shell({ preheader: 'Quotation accepted', heading: 'Quotation accepted',
            bodyHtml: '<p style="margin:0">' + esc(name) + ' accepted <b>' + esc(quoteNo(p)) + '</b> for <b>' + esc(p.title) + '</b> (' + inr(p.price) + '). Next step: collect the advance and record it in Admin, Projects.</p>' }),
          text: name + ' accepted ' + quoteNo(p) + ' for ' + p.title, idemKey: 'vs-qacc-' + p.id });
      } catch (e) { console.error('accept mail failed', String(e)); }
    }
    return json(200, { ok: true });
  }
  return json(405, { error: 'Method not allowed.' }, { headers: { Allow: 'GET, POST' } });
};
