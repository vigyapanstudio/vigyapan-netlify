// Admin API for client projects: quotation, payments and invoices, weekly updates.
import { json, readJson } from '../lib/http.mjs';
import { authReady, isAdmin } from '../lib/auth.mjs';
import * as db from '../lib/db.mjs';
import { STORES as S } from '../lib/db.mjs';
import { EMAIL_RE, cleanText, DAY } from '../lib/config.mjs';
import {
  STATUSES, KINDS, PAY_KINDS, METHODS, DEFAULT_TERMS, newId, lines, getProject, saveProject, listProjects,
  paidTotal, advanceAmount, balanceDue, quoteNo, invoiceNo, emailQuote, emailInvoice, emailUpdate
} from '../lib/projects.mjs';

export const config = { path: '/api/projects' };

const view = (p) => ({
  id: p.id, client: p.client, title: p.title, kind: p.kind, scope: p.scope || [], exclusions: p.exclusions || [], price: p.price,
  advancePct: p.advancePct, advance: advanceAmount(p), deliveryDays: p.deliveryDays, terms: p.terms && p.terms.length ? p.terms : [],
  status: p.status, quoteNo: quoteNo(p), createdAt: p.createdAt, quoteSentAt: p.quoteSentAt || 0, acceptedAt: p.acceptedAt || 0, acceptedBy: p.acceptedBy || '', acceptedVia: p.acceptedVia || '',
  paid: paidTotal(p), balance: balanceDue(p),
  payments: (p.payments || []).map((x) => Object.assign({}, x, { invNo: invoiceNo(x) })),
  updates: (p.updates || []).slice().sort((a, b) => b.at - a.at),
  lastUpdate: (p.updates || []).reduce((m, u) => Math.max(m, u.at), 0), fromEnquiry: p.fromEnquiry || ''
});

function dateFromInput(v) {          // "2026-10-24" in India time -> ms; blank means now
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return Date.now();
  const ms = Date.parse(v + 'T12:00:00+05:30');
  return Number.isFinite(ms) && ms <= Date.now() + DAY ? ms : Date.now();
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' }, { headers: { Allow: 'POST' } });
  if (!authReady() || !process.env.ADMIN_PASSWORD) return json(503, { error: 'The admin page is not switched on yet (add SESSION_SECRET and ADMIN_PASSWORD in Netlify).' });
  if (!isAdmin(req)) return json(401, { error: 'Please log in.' });
  const b = await readJson(req);
  if (b === null) return json(415, { error: 'Bad request.' });
  const action = String(b.action || '');
  try {
    if (action === 'list') return json(200, { projects: (await listProjects()).map(view), statuses: STATUSES, kinds: KINDS, payKinds: PAY_KINDS, methods: METHODS, defaultTerms: DEFAULT_TERMS });
    if (action === 'prefill') {
      const e = await db.get(S.enquiries, String(b.enquiryId || ''));
      if (!e) return json(404, { error: 'Enquiry not found.' });
      const kind = /website/i.test(e.need) ? 'website' : /tool/i.test(e.need) ? 'tool' : /care/i.test(e.need) ? 'care' : 'other';
      return json(200, { client: { name: e.name, email: e.email || '', phone: e.phone, business: '' }, kind, scope: [], note: e.problem, fromEnquiry: e.id });
    }
    if (action === 'save') {
      const c = b.client || {};
      const client = { name: cleanText(c.name, 80), email: cleanText(c.email, 120), phone: cleanText(c.phone, 16).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''), business: cleanText(c.business, 100) };
      const title = cleanText(b.title, 120);
      const price = Math.round(Number(b.price));
      const advancePct = b.advancePct === '' || b.advancePct == null ? 50 : Math.round(Number(b.advancePct));
      const deliveryDays = Math.round(Number(b.deliveryDays) || 14);
      if (client.name.length < 2) return json(400, { error: 'Please enter the client name.' });
      if (client.email && !EMAIL_RE.test(client.email)) return json(400, { error: 'The client email does not look right.' });
      if (client.phone && !/^[6-9]\d{9}$/.test(client.phone)) return json(400, { error: 'The client mobile number should be 10 digits.' });
      if (title.length < 3) return json(400, { error: 'Please give the project a title.' });
      if (!(price >= 1 && price <= 10000000)) return json(400, { error: 'Please enter the project price in rupees.' });
      if (!(advancePct >= 0 && advancePct <= 100)) return json(400, { error: 'Advance percent must be between 0 and 100.' });
      if (!(deliveryDays >= 1 && deliveryDays <= 365)) return json(400, { error: 'Delivery days must be between 1 and 365.' });
      const kind = KINDS[b.kind] ? b.kind : 'other';
      const scope = lines(b.scope, 25, 220), exclusions = lines(b.exclusions, 15, 220);
      let terms = lines(b.terms, 15, 450);
      if (JSON.stringify(terms) === JSON.stringify(DEFAULT_TERMS)) terms = [];
      let p = b.id ? await getProject(b.id) : null;
      if (b.id && !p) return json(404, { error: 'Project not found.' });
      if (p && p.price !== price && paidTotal(p) > price) return json(400, { error: 'The new price is lower than what has already been paid.' });
      if (!p) p = { id: newId(), createdAt: Date.now(), status: 'quote', payments: [], updates: [], fromEnquiry: cleanText(b.fromEnquiry, 40) };
      Object.assign(p, { client, title, kind, scope, exclusions, price, advancePct, deliveryDays, terms });
      await saveProject(p);
      return json(200, { ok: true, project: view(p) });
    }
    const p = await getProject(b.id);
    if (!p) return json(404, { error: 'Project not found.' });

    if (action === 'delete') {
      if ((p.payments || []).length) return json(400, { error: 'This project has payments recorded, so it cannot be deleted. Set its status to Closed instead.' });
      await db.del(S.projects, p.id); return json(200, { ok: true });
    }
    if (action === 'send-quote') {
      p.quoteSentAt = Date.now();
      await saveProject(p);
      try { await emailQuote(p); } catch (e) { return json(502, { error: 'Could not email the quotation: ' + String(e.message || e).slice(0, 160) }); }
      return json(200, { ok: true, project: view(p) });
    }
    if (action === 'set-status') {
      if (!STATUSES.some((s) => s[0] === b.status)) return json(400, { error: 'Unknown status.' });
      p.status = b.status; await saveProject(p); return json(200, { ok: true, project: view(p) });
    }
    if (action === 'mark-accepted') {
      if (p.acceptedAt) return json(200, { ok: true, project: view(p) });
      p.acceptedAt = Date.now(); p.acceptedBy = cleanText(b.by, 80) || (p.client && p.client.name) || ''; p.acceptedVia = cleanText(b.via, 40) || 'confirmed on WhatsApp';
      if (p.status === 'quote') p.status = 'accepted';
      await saveProject(p); return json(200, { ok: true, project: view(p) });
    }
    if (action === 'add-payment') {
      const amount = Math.round(Number(b.amount));
      if (!(amount >= 1)) return json(400, { error: 'Please enter the amount received.' });
      if (amount > balanceDue(p)) return json(400, { error: 'That is more than the balance remaining (₹' + balanceDue(p).toLocaleString('en-IN') + ').' });
      const pay = { id: 'pp_' + newId(), kind: PAY_KINDS[b.kind] ? b.kind : 'other', amount, method: METHODS[b.method] ? b.method : 'other', ref: cleanText(b.ref, 80), note: cleanText(b.note, 300), paidAt: dateFromInput(b.date), recordedAt: Date.now() };
      p.payments = (p.payments || []).concat(pay);
      if (p.status === 'quote' && p.acceptedAt) p.status = 'accepted';
      await saveProject(p);
      let emailed = false, mailError = '';
      if (b.email) { try { await emailInvoice(p, pay); pay.emailedAt = Date.now(); emailed = true; await saveProject(p); } catch (e) { mailError = String(e.message || e).slice(0, 160); } }
      return json(200, { ok: true, emailed, mailError, project: view(p), payId: pay.id });
    }
    if (action === 'del-payment') {
      p.payments = (p.payments || []).filter((x) => x.id !== b.payId);
      await saveProject(p); return json(200, { ok: true, project: view(p) });
    }
    if (action === 'email-invoice') {
      const pay = (p.payments || []).find((x) => x.id === b.payId);
      if (!pay) return json(404, { error: 'Payment not found.' });
      try { await emailInvoice(p, pay); } catch (e) { return json(502, { error: 'Could not email the invoice: ' + String(e.message || e).slice(0, 160) }); }
      pay.emailedAt = Date.now(); await saveProject(p); return json(200, { ok: true, project: view(p) });
    }
    if (action === 'add-update') {
      const u = { id: newId(), at: Date.now(), done: lines(b.done, 12, 220), next: lines(b.next, 12, 220), need: lines(b.need, 8, 220), note: cleanText(b.note, 800) };
      if (!u.done.length && !u.next.length && !u.need.length && !u.note) return json(400, { error: 'Please write at least one line for the update.' });
      if (b.status && STATUSES.some((s) => s[0] === b.status)) p.status = b.status;
      u.status = p.status;
      p.updates = (p.updates || []).concat(u);
      await saveProject(p);
      let emailed = false, mailError = '';
      if (b.send !== false) { try { await emailUpdate(p, u); u.emailedAt = Date.now(); emailed = true; await saveProject(p); } catch (e) { mailError = String(e.message || e).slice(0, 160); } }
      return json(200, { ok: true, emailed, mailError, project: view(p) });
    }
    return json(400, { error: 'Unknown action.' });
  } catch (e) {
    console.error('projects error', String(e));
    return json(500, { error: 'Something went wrong. Please try again.' });
  }
};
