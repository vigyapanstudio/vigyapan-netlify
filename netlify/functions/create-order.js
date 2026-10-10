// Netlify Function: creates a Razorpay order for the report.
// The price is decided HERE on the server, so nobody can change it from the browser.
const BASE_PRICE = 999;   // rupees, report + 30-day calendar
const BUMP_PRICE = 299;   // rupees, 10 reel scripts add-on (must match public/assets/config.js)

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
const reply = (statusCode, obj, extra) => ({
  statusCode,
  headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}),
  body: JSON.stringify(obj)
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed.' }, { Allow: 'POST' });

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return reply(500, { error: 'Online payment is not switched on yet.' });

  let b = {};
  try { b = JSON.parse(event.body || '{}') || {}; } catch (e) { b = {}; }

  // Hidden trap field: real people never fill it, bots often do.
  if (clean(b.website, 50)) return reply(400, { error: 'Could not process this order.' });

  const phone = clean(b.phone, 14).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const email = clean(b.email, 120);
  const ig = clean(b.ig, 40).replace(/^@/, '');
  const name = clean(b.name, 80);
  const problems = [];
  if (name.length < 2) problems.push('name');
  if (!/^[6-9]\d{9}$/.test(phone)) problems.push('WhatsApp number');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) problems.push('email');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(ig)) problems.push('Instagram handle');
  if (clean(b.about, 250).length < 3) problems.push('product or service details');
  if (problems.length) return reply(400, { error: 'Please check your ' + problems.join(', ') + '.' });

  const bump = b.bump === true || b.bump === 'true';
  const rupees = BASE_PRICE + (bump ? BUMP_PRICE : 0);
  const receipt = ('vs_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).slice(0, 40);

  // These notes show up on the payment inside your Razorpay dashboard.
  const notes = {
    name, phone, email,
    instagram: '@' + ig,
    business: clean(b.biz, 120),
    business_type: clean(b.type, 60),
    city: clean(b.city, 60),
    followers: clean(b.followers, 40),
    goal: clean(b.goal, 80),
    competitors: clean(b.comp, 250),
    about: clean(b.about, 250),
    addon_reel_scripts: bump ? 'YES (+Rs ' + BUMP_PRICE + ')' : 'no',
    product: 'Instagram Growth Report + 30-Day Calendar'
  };

  try {
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64')
      },
      body: JSON.stringify({ amount: rupees * 100, currency: 'INR', receipt, notes })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.id) {
      console.error('Razorpay order error', r.status, JSON.stringify(data));
      return reply(502, { error: 'Could not start the payment. Please try again.' });
    }
    return reply(200, { orderId: data.id, amount: data.amount, key: keyId, receipt });
  } catch (e) {
    console.error('Razorpay request failed', e);
    return reply(502, { error: 'Could not reach the payment service. Please try again.' });
  }
};
