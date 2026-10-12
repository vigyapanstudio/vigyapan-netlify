// Tiny storage layer on top of Netlify Blobs (Netlify's built-in storage).
// In tests, set globalThis.__VS_MEMDB = new Map() to use memory instead.
import { getStore } from '@netlify/blobs';

const mem = () => globalThis.__VS_MEMDB;
const memStore = (name) => { const m = mem(); if (!m.has(name)) m.set(name, new Map()); return m.get(name); };
const real = (name) => getStore({ name, consistency: 'strong' });

export async function get(name, key) {
  if (mem()) { const v = memStore(name).get(key); return v == null ? null : JSON.parse(v); }
  return await real(name).get(key, { type: 'json' });
}
export async function put(name, key, value) {
  if (mem()) { memStore(name).set(key, JSON.stringify(value)); return; }
  await real(name).setJSON(key, value);
}
export async function del(name, key) {
  if (mem()) { memStore(name).delete(key); return; }
  await real(name).delete(key);
}
export async function keys(name, prefix) {
  if (mem()) return [...memStore(name).keys()].filter((k) => !prefix || k.startsWith(prefix)).sort();
  const r = await real(name).list({ prefix: prefix || undefined });
  return r.blobs.map((b) => b.key).sort();
}
export async function putBin(name, key, buf) {
  if (mem()) { memStore(name).set(key, Buffer.from(buf)); return; }
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  await real(name).set(key, ab);
}
export async function getBin(name, key) {
  if (mem()) { const v = memStore(name).get(key); return v == null ? null : Buffer.from(v); }
  const ab = await real(name).get(key, { type: 'arrayBuffer' });
  return ab == null ? null : Buffer.from(ab);
}
export const STORES = {
  customers: 'vs-customers', payments: 'vs-payments', deliveries: 'vs-deliveries',
  files: 'vs-files', otp: 'vs-otp', reminders: 'vs-reminders', limits: 'vs-limits',
  referrals: 'vs-referrals', leads: 'vs-leads', reviews: 'vs-reviews', calendar: 'vs-calendar'
};
