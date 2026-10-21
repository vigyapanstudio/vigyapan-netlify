// Creates a Razorpay order for a NEW customer. The price is worked out HERE on the server,
// so nobody can change it from the browser. Also checks referral codes.
import { json, readJson } from '../lib/http.mjs';
import { razorpayReady, rzpCreateOrder } from '../lib/razorpay.mjs';
import { cleanText as clean, EMAIL_RE, REFERRAL_PCT } from '../lib/config.mjs';
import { quote, referralOffer, planNote, promoNote, cleanMonths } from '../lib/pricing.mjs';
import { checkCoupon, cleanCode } from '../lib/coupons.mjs';
import { saveCart } from '../lib/carts.mjs';
import { findByRefCode, getCustomer, cidOf, normEmail } from '../lib/members.mjs';
import { allow } from '../lib/limits.mjs';

export const config = { path: '/api/create-order' };

// Returns { offer } if the code can be used by this buyer, otherwise { error }.
async function checkReferral(code, email, phone) {
  const ref = await findByRefCode(code);
  if (!ref) return { error: 'That referral code is not valid. Check it and try again, or leave it empty.' };
  if (EMAIL_RE.test(email)) {
    if (await getCustomer(cidOf(email))) return { error: 'Referral codes are for first orders only.' };
    if (normEmail(email) === ref.customer.email) return { error: 'You cannot use your own referral code.' };
  }
  if (phone && ref.customer.phone && phone === ref.customer.phone) return { error: 'You cannot use your own referral code.' };
  return { offer: referralOffer(ref.code), code: ref.code };
}

// One box for both kinds of code: VS-XXXXXX = a friend's referral code, anything else = a code you made in Admin.
async function checkAnyCode(raw, email, phone) {
  const code = String(raw || '').trim().toUpperCase();
  if (/^VS-/.test(code)) {
    const r = await checkReferral(code, email, phone);
    return r.error ? r : { offer: r.offer, code: r.code, kind: 'referral', label: REFERRAL_PCT + '% referral discount' };
  }
  if (EMAIL_RE.test(email) && (await getCustomer(cidOf(email)))) return { error: 'Discount codes on this form are for first orders. Existing customers can use a code when renewing in the dashboard.' };
  const r = await checkCoupon(cleanCode(code), 'first');
  if (r.error) return r;
  const c = r.coupon;
  return { offer: r.offer, code: c.code, kind: 'coupon', label: c.type === 'flat' ? '₹' + c.value + ' off' : c.value + '% off' };
}

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' }, { headers: { Allow: 'POST' } });
  const b = await readJson(req);
  if (b === null) return json(415, { error: 'Bad request.' });
  const ip = (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || '';

  // Hidden trap field: real people never fill it, bots often do.
  if (clean(b.website, 50)) return json(400, { error: 'Could not process this order.' });

  const phone = clean(b.phone, 14).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const email = clean(b.email, 120);
  const code = clean(b.referral, 20).toUpperCase();

  // "Apply" button next to the referral box
  if (b.check) {
    if (!(await allow('refchk', ip, 25, 3600000))) return json(429, { error: 'Too many tries. Please wait a while.' });
    if (!code) return json(400, { error: 'Type your referral code first.' });
    const r = await checkAnyCode(code, email, phone);
    if (r.error) return json(400, { error: r.error });
    return json(200, { ok: true, kind: r.kind, code: r.code, label: r.label, pct: r.offer.pct || 0, off: r.offer.off || 0 });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!razorpayReady()) return json(500, { error: 'Online payment is not switched on yet.' });

  const ig = clean(b.ig, 40).replace(/^@/, '');
  const name = clean(b.name, 80);
  const problems = [];
  if (name.length < 2) problems.push('name');
  if (!/^[6-9]\d{9}$/.test(phone)) problems.push('WhatsApp number');
  if (!EMAIL_RE.test(email)) problems.push('email');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(ig)) problems.push('Instagram handle');
  if (clean(b.about, 250).length < 3) problems.push('product or service details');
  if (problems.length) return json(400, { error: 'Please check your ' + problems.join(', ') + '.' });
  // They must follow @vigyapan_studio (we cannot check this automatically, so it is a tick-box they confirm).
  // Not saved as a note: Razorpay allows only 15 notes, and every paid order has confirmed it.
  if (b.follow !== true) return json(400, { error: 'Please follow @vigyapan_studio on Instagram and tick the box, so we can study your page.' });

  const months = cleanMonths(b.months);
  const bump = b.bump === true || b.bump === 'true';
  const offers = [];
  if (code) {
    if (!(await allow('refchk', ip, 25, 3600000))) return json(429, { error: 'Too many tries. Please wait a while.' });
    const r = await checkAnyCode(code, email, phone);
    if (r.error) return json(400, { error: r.error });
    offers.push(r.offer);
  }
  const q = quote({ months, bump, offers });
  const receipt = ('vs_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).slice(0, 40);

  // These notes show up on the payment inside your Razorpay dashboard (Razorpay allows at most 15).
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
    addon_reel_scripts: bump ? 'YES' : 'no',
    plan: planNote(months)
  };
  const promo = promoNote(q);
  if (promo) notes.promo = promo;
  if (b.wa === true) notes.wa = 'yes';     // ticked "send me WhatsApp updates" (15 notes at most, so this is the last one added)

  // Remember the form so we can send ONE reminder if they do not finish paying (removed as soon as they pay).
  try {
    if (!(await getCustomer(cidOf(email)))) {
      await saveCart({ name, phone, email, ig, biz: notes.business, type: notes.business_type, city: notes.city, followers: notes.followers, goal: notes.goal,
        comp: notes.competitors, about: notes.about, bump, months, code: code || '', wa: b.wa === true, total: q.total });
    }
  } catch (e) { console.error('cart save failed', String(e)); }

  try {
    const o = await rzpCreateOrder({ rupees: q.total, receipt, notes });
    return json(200, { orderId: o.id, amount: o.amount, key: keyId, receipt, total: q.total, discount: q.discount ? q.discount.amount : 0 });
  } catch (e) {
    console.error('Razorpay request failed', String(e));
    return json(502, { error: 'Could not start the payment. Please try again.' });
  }
};
