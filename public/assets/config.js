// The only file you need to edit for everyday settings.
window.VS_CONFIG = {
  WHATSAPP: "917009884880",   // your WhatsApp number: country code + number, digits only
  PIXEL_ID: "",               // paste your Meta Pixel ID here (digits only) when you have one
  PRICE_BASE: 1499,            // must match BASE_PRICE in netlify/lib/config.mjs
  PRICE_BUMP: 499,            // must match BUMP_PRICE in netlify/lib/config.mjs
  PRICE_PACK3: 3999,          // 3-month pack; must match PACK3_PRICE in netlify/lib/config.mjs
  UDYAM: "UDYAM-PB-12-0008441",
  POPUPS: true,               // false switches off all website pop-up offers
  // Festival offer pop-up: shown from "from" to "to" (dates as YYYY-MM-DD, India time). The code FESTIVE20 gives 20% off.
  POPUP_FESTIVALS: [
    { name: "Diwali",   from: "2026-10-25", to: "2026-11-09" },
    { name: "New Year", from: "2026-12-24", to: "2027-01-02" },
    { name: "Holi",     from: "2027-03-12", to: "2027-03-23" }
  ]
};
