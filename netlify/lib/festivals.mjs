// Indian festivals and occasions shown in the client dashboard and the weekly email.
// ONE place to edit. Dates are India dates (YYYY-MM-DD). Festivals that follow the moon can move by a day,
// so those carry approx: true and show "date may shift by a day". Add next year's dates before Dec 2027.
export const FESTIVALS = [
  { d: '2026-10-20', n: 'Dussehra', tip: 'Post a "good over evil" story: a before/after, or one thing your customers can finally say goodbye to.' },
  { d: '2026-10-29', n: 'Karwa Chauth', approx: true, tip: 'Gifting and getting-ready content works: look ideas, gift hampers, a last-minute booking slot.' },
  { d: '2026-11-06', n: 'Dhanteras', approx: true, tip: 'A good day for "invest in yourself" offers, new arrivals and gold/silver or gifting posts.' },
  { d: '2026-11-08', n: 'Diwali', approx: true, tip: 'Post your Diwali wishes early, a festive offer reel, and a thank-you to customers on the day.' },
  { d: '2026-11-11', n: 'Bhai Dooj', approx: true, tip: 'A short sibling-themed reel or a gifting post for brothers and sisters.' },
  { d: '2026-11-14', n: "Children's Day", tip: 'Great for family-friendly offers, kids content and a nostalgic childhood post.' },
  { d: '2026-11-15', n: 'Chhath Puja', approx: true, tip: 'A respectful greeting post; skip hard selling.' },
  { d: '2026-11-24', n: 'Guru Nanak Jayanti', approx: true, tip: 'A simple, respectful greeting with your team or shop. Share one thing you are grateful for.' },
  { d: '2026-12-25', n: 'Christmas', tip: 'Cosy gifting reels, year-end offers and a thank-you to your customers.' },
  { d: '2026-12-31', n: "New Year's Eve", tip: 'A "2026 in numbers" recap or "what we learned this year" post builds trust.' },
  { d: '2027-01-01', n: 'New Year', tip: 'Share your 2027 plan for customers: what is new, what is coming, one resolution you will keep.' },
  { d: '2027-01-13', n: 'Lohri', approx: true, tip: 'A bonfire or team celebration reel, and a warm greeting to your customers.' },
  { d: '2027-01-14', n: 'Makar Sankranti / Pongal', approx: true, tip: 'A festive greeting with a colourful visual, and a "kite" themed offer if it suits your business.' },
  { d: '2027-01-26', n: 'Republic Day', tip: 'Proud-to-be-local content: your story, your team, how you serve your city.' },
  { d: '2027-02-11', n: 'Vasant Panchami', approx: true, tip: 'Yellow-themed posts are very popular. Good for education, art and new beginnings.' },
  { d: '2027-02-14', n: "Valentine's Day", tip: 'Couples offers, gifting ideas, "treat yourself" posts. Book slots early.' },
  { d: '2027-03-06', n: 'Maha Shivratri', approx: true, tip: 'A calm greeting post. Avoid loud sales language.' },
  { d: '2027-03-08', n: "Women's Day", tip: 'Celebrate the women on your team or customers (with permission). Offers for women work well.' },
  { d: '2027-03-10', n: 'Eid-ul-Fitr', approx: true, tip: 'A warm greeting. Festive wear, gifting and food businesses can show special items.' },
  { d: '2027-03-22', n: 'Holi', approx: true, tip: 'Colourful visuals, a "safe Holi" tip for your field (skin, hair, clothes) and a festive offer.' },
  { d: '2027-04-14', n: 'Baisakhi', approx: true, tip: 'A harvest-and-new-beginnings greeting. Big in Punjab, so use local music and colours.' },
  { d: '2027-04-15', n: 'Ram Navami', approx: true, tip: 'A respectful greeting post.' },
  { d: '2027-05-09', n: "Mother's Day", tip: 'Gift ideas, "bring your mum" offers and a heartfelt customer story.' },
  { d: '2027-05-17', n: 'Eid-ul-Adha', approx: true, tip: 'A warm greeting and festive-wear or food content.' },
  { d: '2027-06-20', n: "Father's Day", tip: 'Gift ideas and a short "thank you, Papa" style reel.' },
  { d: '2027-06-21', n: 'International Yoga Day', tip: 'Wellness tips if you are in health, fitness, beauty or food. Any business can share a "pause" post.' },
  { d: '2027-08-01', n: 'Friendship Day', tip: '"Bring a friend" offers and fun friend-group content.' },
  { d: '2027-08-15', n: 'Independence Day', tip: 'Tricolour-themed post, a thank-you to your team, and a "made in India" angle if true for you.' },
  { d: '2027-08-20', n: 'Raksha Bandhan', approx: true, tip: 'Gift hampers, sibling stories and last-date-to-order posts.' },
  { d: '2027-08-26', n: 'Janmashtami', approx: true, tip: 'A respectful greeting, and a fun themed reel if it suits your brand.' },
  { d: '2027-09-04', n: 'Ganesh Chaturthi', approx: true, tip: 'Festive greeting, new-beginning offers and behind-the-scenes of your celebration.' },
  { d: '2027-09-05', n: "Teachers' Day", tip: 'Thank a mentor, share your best lesson, offer a small discount to teachers.' },
  { d: '2027-10-09', n: 'Dussehra', approx: true, tip: 'A "good over evil" story or a before/after post.' },
  { d: '2027-10-18', n: 'Karwa Chauth', approx: true, tip: 'Gifting and getting-ready content.' },
  { d: '2027-10-29', n: 'Diwali', approx: true, tip: 'Start your Diwali content two weeks early. Offers, gifting and a thank-you to customers.' }
];

const DAYMS = 86400000;
const istMidnight = (ms) => { const d = new Date(ms + 19800000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 19800000; };
const atMs = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return Date.UTC(+m[1], +m[2] - 1, +m[3]) - 19800000; };

// Next festivals within `withinDays` days (today included), soonest first.
export function upcoming(now, withinDays, max) {
  now = now == null ? Date.now() : now;
  const today = istMidnight(now);
  return FESTIVALS
    .map((f) => ({ date: f.d, name: f.n, tip: f.tip, approx: !!f.approx, inDays: Math.round((atMs(f.d) - today) / DAYMS) }))
    .filter((f) => f.inDays >= 0 && f.inDays <= (withinDays || 60))
    .sort((a, b) => a.inDays - b.inDays)
    .slice(0, max || 8);
}
// Warns the admin when the list is about to run out.
export const lastFestivalDate = () => FESTIVALS.reduce((m, f) => (f.d > m ? f.d : m), '');
