// Free mini-audit sign-up: saves the lead, tells you, and (if they gave an email) confirms to them.
import { json, readJson } from '../lib/http.mjs';
import * as db from '../lib/db.mjs';
import { STORES as S } from '../lib/db.mjs';
import { cleanText as clean, EMAIL_RE, SELLER, esc, siteUrl } from '../lib/config.mjs';
import { sendMail, shell, mailReady } from '../lib/mail.mjs';
import { allow } from '../lib/limits.mjs';

export const config = { path: '/api/free-audit' };

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' }, { headers: { Allow: 'POST' } });
  const b = await readJson(req);
  if (b === null) return json(415, { error: 'Bad request.' });
  if (clean(b.website, 50)) return json(200, { ok: true });           // trap field: pretend it worked
  const ip = (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || '';

  const name = clean(b.name, 80);
  const phone = clean(b.phone, 14).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const email = clean(b.email, 120);
  const ig = clean(b.ig, 60).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[\/?].*$/, '').replace(/^@/, '');
  const type = clean(b.type, 60);
  const problems = [];
  if (name.length < 2) problems.push('name');
  if (!/^[6-9]\d{9}$/.test(phone)) problems.push('WhatsApp number');
  if (email && !EMAIL_RE.test(email)) problems.push('email');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(ig)) problems.push('Instagram handle');
  if (problems.length) return json(400, { error: 'Please check your ' + problems.join(', ') + '.' });
  if (b.consent !== true) return json(400, { error: 'Please tick the box so we can message you the tips.' });
  if (!(await allow('audit-ip', ip, 6, 3600000))) return json(429, { error: 'Too many requests from this device. Please try again later.' });
  if (!(await allow('audit-ph', phone, 1, 86400000))) return json(200, { ok: true, again: true });   // same person twice in a day

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const lead = { id, name, phone, email, ig, type, status: 'new', createdAt: Date.now() };
  await db.put(S.leads, id, lead);

  if (mailReady()) {
    try {
      await sendMail({ to: process.env.OWNER_EMAIL || SELLER.email, replyTo: email || undefined,
        subject: 'New free audit request: @' + ig,
        html: shell({ preheader: 'Free mini-audit request', heading: 'New free audit request',
          bodyHtml: '<p style="margin:0 0 6px"><b>' + esc(name) + '</b> wants 3 quick tips for <b>@' + esc(ig) + '</b>' + (type ? ' (' + esc(type) + ')' : '') + '.</p>' +
            '<p style="margin:0 0 6px">WhatsApp: +91 ' + esc(phone) + (email ? '<br>Email: ' + esc(email) : '') + '</p>' +
            '<p style="margin:0"><a href="https://wa.me/91' + esc(phone) + '">Open WhatsApp chat</a>. Mark it done in Admin, Free audits.</p>' }),
        text: 'Free audit request: ' + name + ' / +91 ' + phone + ' / @' + ig, idemKey: 'vs-lead-' + id });
    } catch (e) { console.error('lead owner mail failed', String(e)); }
    if (email) {
      try {
        const site = siteUrl();
        await sendMail({ to: email, subject: 'We got your free audit request | Vigyapan Studio',
          html: shell({ preheader: 'Your 3 quick tips are on the way', heading: 'Got it, ' + name.split(' ')[0] + '!',
            bodyHtml: '<p style="margin:0 0 12px">We will look at <b>@' + esc(ig) + '</b> and send you <b>3 quick tips</b> on WhatsApp (+91 ' + esc(phone) + ') within about 24 hours.</p>' +
              '<p style="margin:0;color:#7a948f;font-size:13px">If you would like the full report with a 30-day calendar, you can order it any time. There is no pressure.</p>',
            button: site ? { text: 'See the full report', url: site + '/instagram-analysis/#order' } : null,
            small: 'You asked for this on our website. We will not add you to any list.' }),
          text: 'We got your free audit request for @' + ig + '. We will send 3 quick tips on WhatsApp within about 24 hours.', idemKey: 'vs-leadc-' + id });
      } catch (e) { console.error('lead confirm mail failed', String(e)); }
    }
  }
  return json(200, { ok: true });
};
