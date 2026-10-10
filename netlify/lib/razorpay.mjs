// Small Razorpay helpers (server side only).
const auth = () => 'Basic ' + Buffer.from(process.env.RAZORPAY_KEY_ID + ':' + process.env.RAZORPAY_KEY_SECRET).toString('base64');
export const razorpayReady = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

export async function rzpGet(path) {
  const r = await fetch('https://api.razorpay.com/v1' + path, { headers: { Authorization: auth() } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Razorpay GET ' + path + ' -> ' + r.status);
  return data;
}
export async function rzpCreateOrder({ rupees, receipt, notes }) {
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth() },
    body: JSON.stringify({ amount: rupees * 100, currency: 'INR', receipt, notes })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.id) { console.error('Razorpay order error', r.status, JSON.stringify(data)); throw new Error('order failed'); }
  return data;
}
