// Ready-to-use caption starters and hashtag groups, shown in the dashboard with copy buttons.
// [Square brackets] are blanks the client fills in. Captions are matched to the client's business type.
const GENERIC = [
  { t: 'Introduce yourself', x: 'Hi, I am [name] and this is [business] in [city]. We help [who you help] with [what you do]. If you are new here, start by saying hi in the comments.' },
  { t: 'Customer story', x: '"[Customer quote]" - [customer first name]. This is why we do what we do. Want the same result? DM us "[keyword]" and we will help.' },
  { t: 'Behind the scenes', x: 'A little peek at how [your product/service] is made. Which part surprised you most? Tell us below.' },
  { t: 'Offer post', x: 'This week only: [offer]. Book or order by [date]. Send us a DM or WhatsApp [your number] to grab it.' },
  { t: 'Myth buster', x: 'Myth: [common myth]. Truth: [truth]. Save this post so you remember it next time, and send it to someone who needs to hear it.' },
  { t: 'Question post', x: 'Quick question for you: [question]? Vote in the comments. We read every reply.' },
  { t: 'Thank you', x: 'Thank you for [milestone: 1,000 followers / 100 happy customers / a great month]. We could not do it without you. Here is what is coming next: [one line].' },
  { t: 'How to book / order', x: 'How to order from [business] in 3 steps: 1) [step], 2) [step], 3) [step]. Questions? WhatsApp us on [number].' }
];
const BY_TYPE = {
  salon: [
    { t: 'Before and after', x: 'Before and after: [service] at [business]. Book your slot: link in bio or DM "BOOK". Limited seats on weekends.' },
    { t: 'Hair/skin tip', x: '3 mistakes that damage [hair/skin] and what to do instead. Save this and share with a friend who loves her routine.' },
    { t: 'Bridal', x: 'Bridal bookings are open for [month]. Trial slots fill fast. DM us your date and we will keep it for you.' },
    { t: 'Festival glow', x: 'Festival ready in 60 minutes: [packages]. Pre-book now so you do not wait on the day.' }
  ],
  food: [
    { t: 'Dish of the day', x: 'Meet [dish]. Crispy, hot and made fresh every day. Tag the friend you are bringing. Open [timings].' },
    { t: 'Order link', x: 'Craving something? Order on WhatsApp [number] or walk in at [address]. Home delivery within [area].' },
    { t: 'New on the menu', x: 'New on our menu: [item]. First 20 orders get [small treat]. Tell us what you think!' },
    { t: 'Tag a foodie', x: 'Tag the person you always eat [dish] with. Winner gets a free [item] on us.' }
  ],
  fashion: [
    { t: 'New arrivals', x: 'Just in: [collection]. Sizes [sizes]. DM "NEW" for prices or order on WhatsApp [number].' },
    { t: 'Style it 3 ways', x: 'One [outfit], three looks: office, dinner, festival. Which one is your pick? 1, 2 or 3?' },
    { t: 'Size and care', x: 'Not sure about your size? Send us your measurements and we will tell you the best fit. Care tip: [tip].' },
    { t: 'Festive collection', x: 'Our festive collection is here. Free delivery in [city] above [amount]. Limited pieces, so reserve yours today.' }
  ],
  gym: [
    { t: 'Transformation', x: '[Name] lost [x] kg in [y] weeks with consistency, not magic. Your story can be next. Trial class on us: DM "START".' },
    { t: 'Workout tip', x: 'A 10-minute [workout] you can do at home today. Save it and tell us how it felt.' },
    { t: 'Join offer', x: 'New batch starts [date]. First 10 members get [offer]. Message us on [number] to reserve your spot.' },
    { t: 'Myth buster', x: 'You do not need to [common myth] to see results. Here is what actually works: [point]. Save this.' }
  ],
  clinic: [
    { t: 'Health tip', x: 'Simple tip from Dr. [name]: [tip]. Save this and share it with your family. Book a consultation: [number].' },
    { t: 'Common question', x: 'You asked, we answered: "[question]". The short answer: [answer]. For personal advice, please book a consultation.' },
    { t: 'Meet the team', x: 'Meet Dr. [name], who has helped [x]+ patients with [speciality]. Timings: [timings]. Appointments: [number].' },
    { t: 'Awareness', x: 'Did you know? [fact]. Early care makes a big difference. Visit us for a check-up.' }
  ],
  edu: [
    { t: 'Result', x: 'Congratulations to [student] for [result]! Hard work and the right guidance pay off. Admissions for the new batch are open: [number].' },
    { t: 'Study tip', x: 'A simple way to remember [topic]: [trick]. Save this for exam week and share it with your study group.' },
    { t: 'Free demo', x: 'Free demo class on [date] at [time]. Limited seats. Send "DEMO" on WhatsApp [number] to join.' },
    { t: 'Parent note', x: 'Parents often ask us: "[question]". Here is our honest answer: [answer].' }
  ],
  realestate: [
    { t: 'New listing', x: 'Now available: [type] in [area]. [size], [price], [one key feature]. Site visits by appointment: call [number].' },
    { t: 'Buyer tip', x: '5 things to check before you buy a flat in [city]. Save this before your next site visit.' },
    { t: 'Walkthrough', x: 'A quick walkthrough of this [home type] in [area]. What would you change? Tell us in the comments.' },
    { t: 'Happy family', x: 'Congratulations to the [family name] family on their new home! Thank you for trusting us.' }
  ],
  jewellery: [
    { t: 'New design', x: 'New design: [piece], [material/weight]. Made for [occasion]. DM "DESIGN" for price and custom options.' },
    { t: 'Gifting', x: 'Looking for a gift under [amount]? Here are 5 pieces she will love. Gift wrapping and free delivery in [city].' },
    { t: 'Care tip', x: 'How to keep your [jewellery] shining: 3 easy care tips. Save this for later.' },
    { t: 'Wedding', x: 'Wedding shopping? Book a private viewing at [shop]. We keep your favourites aside. Call [number].' }
  ],
  decor: [
    { t: 'Room makeover', x: 'Before and after: a [room] makeover in [budget]. Want the same? DM "HOME" for a free idea.' },
    { t: 'Styling tip', x: '3 ways to make a small room feel bigger. Save this before you shop.' },
    { t: 'New stock', x: 'New in store: [item]. Available in [colours]. Delivery in [city] within [days] days.' },
    { t: 'Customer home', x: 'Seen in a customer home: our [item] looks even better in real life. Thank you, [name]!' }
  ],
  services: [
    { t: 'Case study', x: 'How we helped [client] get [result] in [time]. The simple steps: [steps]. Want the same? DM us "PLAN".' },
    { t: 'Checklist', x: 'A 5-point checklist before you hire a [your service] provider. Save it and share it.' },
    { t: 'Process', x: 'How we work: 1) [step], 2) [step], 3) [step]. No surprises. Book a free call: [number].' },
    { t: 'FAQ', x: 'Most asked question this month: "[question]". Here is the answer in 30 seconds.' }
  ]
};

export function typeKey(type) {
  const t = String(type || '').toLowerCase();
  if (/salon|beauty|makeup|spa/.test(t)) return 'salon';
  if (/cafe|restaurant|food|bakery|sweet/.test(t)) return 'food';
  if (/cloth|boutique|fashion|apparel/.test(t)) return 'fashion';
  if (/gym|fitness|yoga/.test(t)) return 'gym';
  if (/clinic|health|dental|doctor/.test(t)) return 'clinic';
  if (/educat|coach|class|tuition|school/.test(t)) return 'edu';
  if (/real estate|property|builder/.test(t)) return 'realestate';
  if (/jewel/.test(t)) return 'jewellery';
  if (/decor|furnit|interior/.test(t)) return 'decor';
  if (/service|agency|consult/.test(t)) return 'services';
  return 'other';
}

const NICHE = {
  salon: ['salon', 'beautysalon', 'makeupartist', 'bridalmakeup', 'hairstyle', 'skincare', 'hairstylist', 'glowingskin', 'beautytips', 'nailart', 'hairtransformation', 'makeuplook'],
  food: ['foodie', 'foodlover', 'cafe', 'streetfood', 'instafood', 'foodphotography', 'yummy', 'foodblogger', 'homemade', 'dessertlover', 'bakery', 'chai'],
  fashion: ['ootd', 'boutique', 'ethnicwear', 'indianfashion', 'fashionstyle', 'suitsforwomen', 'lehenga', 'kurti', 'designerwear', 'onlineshopping', 'styleinspo', 'festivewear'],
  gym: ['fitness', 'gym', 'fitnessmotivation', 'workout', 'personaltrainer', 'weightloss', 'fitindia', 'gymlife', 'yoga', 'healthylifestyle', 'bodytransformation', 'strengthtraining'],
  clinic: ['healthtips', 'wellness', 'doctor', 'clinic', 'dentist', 'healthcare', 'skincaretips', 'healthylifestyle', 'preventivehealth', 'patientcare', 'physiotherapy', 'homeopathy'],
  edu: ['education', 'coaching', 'studytips', 'students', 'examprep', 'learning', 'tuition', 'careerguidance', 'ielts', 'neet', 'jee', 'studymotivation'],
  realestate: ['realestate', 'property', 'homesforsale', 'flatsforsale', 'dreamhome', 'realestateindia', 'investment', 'newhome', 'propertyinvestment', 'plotsforsale', 'luxuryhomes', 'homebuyers'],
  jewellery: ['jewellery', 'indianjewellery', 'goldjewellery', 'bridaljewellery', 'diamondjewellery', 'silverjewellery', 'handmadejewellery', 'jewelrylover', 'earrings', 'necklace', 'weddingjewellery', 'jewellerydesign'],
  decor: ['homedecor', 'interiordesign', 'furniture', 'homeinspo', 'livingroom', 'bedroomdecor', 'decorideas', 'handmadedecor', 'homestyling', 'woodenfurniture', 'cosyhome', 'indianhomedecor'],
  services: ['smallbusiness', 'businesstips', 'entrepreneur', 'marketing', 'digitalmarketing', 'branding', 'startup', 'businessowner', 'growthtips', 'socialmediamarketing', 'localbusiness', 'businessindia'],
  other: ['smallbusiness', 'supportlocal', 'shoplocal', 'madeinindia', 'localbusiness', 'businessowner', 'indianbusiness', 'startupindia', 'entrepreneur', 'instagrowth', 'businesstips', 'customerlove']
};
const BROAD = ['reels', 'reelsindia', 'instagood', 'explorepage', 'viral', 'trending', 'instadaily', 'indiansmallbusiness'];

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);

export function libraryFor(type, city) {
  const k = typeKey(type), c = slug(city);
  const captions = (BY_TYPE[k] || []).concat(GENERIC).map((x) => ({ title: x.t, text: x.x }));
  const city_tags = c ? [c, c + 'city', c + 'diaries', c + 'life', 'explore' + c, c + 'business', c + 'local', c + 'instagram'] : [];
  const group = (label, tags) => ({ label, tags: tags.map((t) => '#' + t), line: tags.map((t) => '#' + t).join(' ') });
  const niche = NICHE[k] || NICHE.other;
  const groups = [];
  if (city_tags.length) groups.push(group('Your city', city_tags));
  groups.push(group('Your niche', niche));
  groups.push(group('Wider reach', BROAD));
  groups.push(group('Mix of 15 (copy this one)', (city_tags.slice(0, 4)).concat(niche.slice(0, 8), BROAD.slice(0, 3))));
  return { captions, hashtags: groups };
}
