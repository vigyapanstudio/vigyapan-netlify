// "Tell us your problem" form on the home and contact pages.
// Saves the enquiry, emails you, and (if they gave an email address) sends them a short confirmation.
import { json, readJson } from '../lib/http.mjs';
import * as db from '../lib/db.mjs';
import { STORES as S } from '../lib/db.mjs';
import { cleanText as clean, EMAIL_RE, SELLER, esc } from '../lib/config.mjs';
import { sendMail, shell, mailReady } from '../lib/mail.mjs';
import { allow } from '../lib/limits.mjs';

export const config = { path: '/api/enquiry' };

export const NEEDS = ['A business website', 'A custom business tool', 'Monthly care and support', 'Not sure yet'];

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' }, { headers: { Allow: 'POST' } });
  const b = await readJson(req);
  if (b === null) return json(415, { error: 'Bad request.' });
  if (clean(b.website, 50)) return json(200, { ok: true });            // hidden trap field: pretend it worked
  const ip = (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || '';

  const name = clean(b.name, 80);
  const phone = clean(b.phone, 16).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
  const email = clean(b.email, 120);
  const need = NEEDS.includes(clean(b.need, 60)) ? clean(b.need, 60) : 'Not sure yet';
  const problem = clean(b.problem, 1200);
  const source = /^(home|contact)$/.test(String(b.source)) ? String(b.source) : 'home';
  const problems = [];
  if (name.length < 2) problems.push('name');
  if (!/^[6-9]\d{9}$/.test(phone)) problems.push('10-digit mobile number');
  if (email && !EMAIL_RE.test(email)) problems.push('email');
  if (problem.length < 5) problems.push('message (tell us a little about your problem)');
  if (problems.length) return json(400, { error: 'Please check your ' + problems.join(', ') + '.' });
  if (!(await allow('enq-ip', ip, 8, 3600000))) return json(429, { error: 'Too many messages from this device. Please try again later or message us on WhatsApp.' });
  if (!(await allow('enq-ph', phone, 3, 86400000))) return json(200, { ok: true, again: true });

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await db.put(S.enquiries, id, { id, name, phone, email, need, problem, source, status: 'new', createdAt: Date.now() });

  if (mailReady()) {
    try {
      await sendMail({ to: process.env.OWNER_EMAIL || SELLER.email, replyTo: email || undefined,
        subject: 'New enquiry: ' + need + ' (' + name + ')',
        html: shell({ preheader: need, heading: 'New enquiry from your website',
          bodyHtml: '<p style="margin:0 0 8px"><b>' + esc(name) + '</b> is looking for: <b>' + esc(need) + '</b></p>' +
            '<p style="margin:0 0 10px;white-space:pre-wrap;background:#f7faf9;border-radius:10px;padding:12px 14px">' + esc(problem) + '</p>' +
            '<p style="margin:0 0 6px">Mobile: +91 ' + esc(phone) + (email ? '<br>Email: ' + esc(email) : '') + '</p>' +
            '<p style="margin:0"><a href="https://wa.me/91' + esc(phone) + '">Open WhatsApp chat</a>. Mark it done in Admin, Enquiries.</p>' }),
        text: 'New enquiry (' + need + ') from ' + name + ' / +91 ' + phone + (email ? ' / ' + email : '') + '\n\n' + problem, idemKey: 'vs-enq-' + id });
    } catch (e) { console.error('enquiry owner mail failed', String(e)); }
    if (email) {
      try {
        await sendMail({ to: email, subject: 'We got your message | Vigyapan Studio',
          html: shell({ preheader: 'We will reply within one business day', heading: 'Thank you, ' + name.split(' ')[0] + '!',
            bodyHtml: '<p style="margin:0 0 12px">We have received your message about <b>' + esc(need.toLowerCase()) + '</b>. We will read it and reply on your mobile number (+91 ' + esc(phone) + ') within <b>one business day</b>.</p>' +
              '<p style="margin:0;color:#7a948f;font-size:13px">If it is urgent, you can also message us on WhatsApp: ' + esc(SELLER.phone) + '.</p>',
            small: 'You wrote to us on our website. We will only use your details to reply to you.' }),
          text: 'We got your message about ' + need.toLowerCase() + '. We will reply on +91 ' + phone + ' within one business day.', idemKey: 'vs-enqc-' + id });
      } catch (e) { console.error('enquiry confirm mail failed', String(e)); }
    }
  }
  return json(200, { ok: true });
};
