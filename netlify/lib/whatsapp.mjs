// Automatic WhatsApp messages through Meta's WhatsApp Business (Cloud) API.
// OFF until you add the settings in Netlify. Only customers who ticked "WhatsApp updates" get messages,
// and only through templates you created and Meta approved (business-started messages must use templates).
//
// Netlify settings:  WHATSAPP_TOKEN, WHATSAPP_PHONE_ID,
//   WHATSAPP_TPL_ENDING  (template with 2 variables: {{1}} first name, {{2}} end date)
//   WHATSAPP_TPL_READY   (template with 1 variable:  {{1}} first name)
//   WHATSAPP_LANG        (template language code, default "en")
export const waReady = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
export const waTemplates = () => ({ ending: process.env.WHATSAPP_TPL_ENDING || '', ready: process.env.WHATSAPP_TPL_READY || '' });

export async function sendTemplate(phone10, template, params) {
  if (!waReady()) return { ok: false, reason: 'not configured' };
  if (!template) return { ok: false, reason: 'template name missing' };
  if (!/^[6-9]\d{9}$/.test(String(phone10))) return { ok: false, reason: 'bad number' };
  const r = await fetch('https://graph.facebook.com/v21.0/' + encodeURIComponent(process.env.WHATSAPP_PHONE_ID) + '/messages', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: '91' + phone10, type: 'template',
      template: { name: template, language: { code: process.env.WHATSAPP_LANG || 'en' },
        components: params && params.length ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t).slice(0, 60) })) }] : [] }
    })
  });
  if (!r.ok) { const t = (await r.text().catch(() => '')).slice(0, 300); console.error('WhatsApp send failed', r.status, t); return { ok: false, reason: 'Meta replied ' + r.status + ' ' + t }; }
  return { ok: true };
}

// Safe helpers: never throw, only message customers who opted in.
export async function waNotifyEnding(cust, endDateText) {
  try {
    if (!cust.waOptIn || !waReady()) return false;
    const r = await sendTemplate(cust.phone, waTemplates().ending, [String(cust.name || 'there').split(' ')[0], endDateText]);
    return r.ok;
  } catch (e) { console.error('WA ending failed', String(e)); return false; }
}
export async function waNotifyReady(cust) {
  try {
    if (!cust.waOptIn || !waReady()) return false;
    const r = await sendTemplate(cust.phone, waTemplates().ready, [String(cust.name || 'there').split(' ')[0]]);
    return r.ok;
  } catch (e) { console.error('WA ready failed', String(e)); return false; }
}
