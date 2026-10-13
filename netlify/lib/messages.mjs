// "Ask a question" thread between a client (dashboard) and you (Admin, Messages tab).
import * as db from './db.mjs';
import { STORES as S } from './db.mjs';
import { cleanText } from './config.mjs';

const MAX_MSGS = 100;
const blank = (cid) => ({ cid, msgs: [], unreadAdmin: false, unreadClient: false, updatedAt: 0 });
export const getThread = async (cid) => (await db.get(S.messages, cid)) || blank(cid);

async function add(cid, from, text) {
  const t = await getThread(cid);
  t.msgs.push({ from, text: cleanText(text, 1000), at: Date.now() });
  t.msgs = t.msgs.slice(-MAX_MSGS);
  t.updatedAt = Date.now();
  if (from === 'client') t.unreadAdmin = true; else { t.unreadClient = true; t.unreadAdmin = false; }
  await db.put(S.messages, cid, t);
  return t;
}
export const addFromClient = (cid, text) => add(cid, 'client', text);
export const addFromAdmin = (cid, text) => add(cid, 'admin', text);
export async function markSeenByClient(cid) {
  const t = await getThread(cid);
  if (t.unreadClient) { t.unreadClient = false; await db.put(S.messages, cid, t); }
}
export async function markSeenByAdmin(cid) {
  const t = await getThread(cid);
  if (t.unreadAdmin) { t.unreadAdmin = false; await db.put(S.messages, cid, t); }
}
export async function listThreads() {
  const out = [];
  for (const k of await db.keys(S.messages)) { const t = await db.get(S.messages, k); if (t && t.msgs.length) out.push(t); }
  return out.sort((a, b) => (b.unreadAdmin - a.unreadAdmin) || (b.updatedAt - a.updatedAt));
}
