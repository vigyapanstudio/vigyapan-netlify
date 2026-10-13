// Sends email through Resend, plus one shared email layout.
import { SELLER, esc } from './config.mjs';

export const mailReady = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

export async function sendMail({ to, subject, html, text, replyTo, idemKey, unsubUrl }) {
  const headers = { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' };
  if (idemKey) headers['Idempotency-Key'] = idemKey;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers,
    body: JSON.stringify(Object.assign({ from: process.env.MAIL_FROM, to: [to], subject, html, text, reply_to: replyTo || SELLER.email },
      unsubUrl ? { headers: { 'List-Unsubscribe': '<' + unsubUrl + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}))
  });
  if (!r.ok) throw new Error('Resend -> ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 300));
}

// One look for every email we send (login code, reminders, report ready).
export function shell({ preheader, heading, bodyHtml, button, small, unsubUrl }) {
  const btn = button && button.url
    ? '<tr><td style="padding:6px 28px 8px"><a href="' + esc(button.url) + '" style="display:inline-block;background:#FFB72B;color:#2A1A00;font-weight:700;font-size:16px;text-decoration:none;padding:14px 26px;border-radius:12px">' + esc(button.text) + '</a></td></tr>'
    : '';
  return '<!doctype html><html><body style="margin:0;padding:0;background:#f2f6f4;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="display:none;max-height:0;overflow:hidden">' + esc(preheader || '') + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6f4;padding:24px 12px"><tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dfe8e4">' +
    '<tr><td style="background:#06201F;padding:22px 28px"><div style="font-size:20px;font-weight:700;color:#FFB72B">Vigyapan Studio</div><div style="font-size:13px;color:#9DBFB9;margin-top:2px">' + esc(SELLER.instagram) + '</div></td></tr>' +
    '<tr><td style="padding:28px 28px 6px"><div style="font-size:22px;font-weight:700;color:#10211f;line-height:1.25">' + esc(heading) + '</div></td></tr>' +
    '<tr><td style="padding:8px 28px 18px;font-size:15px;line-height:1.6;color:#33504b">' + bodyHtml + '</td></tr>' +
    btn +
    '<tr><td style="padding:20px 28px 28px;font-size:12px;line-height:1.6;color:#7a948f">' + (small ? esc(small) + '<br>' : '') +
    esc(SELLER.name) + ' (Proprietor: ' + esc(SELLER.proprietor) + '), ' + esc(SELLER.place) + '<br>Udyam Reg. No.: ' + esc(SELLER.udyam) + '<br>' + esc(SELLER.email) + ' | ' + esc(SELLER.phone) +
    (unsubUrl ? '<br><a href="' + esc(unsubUrl) + '" style="color:#7a948f">Stop these emails</a>' : '') + '</td></tr>' +
    '</table></td></tr></table></body></html>';
}
