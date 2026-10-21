// Website pop-up offers. Two kinds, and each visitor sees them only now and then (never twice in 3 days):
//   1. After 10 seconds on the page: a festival offer (while a festival is on) or a welcome offer.
//   2. When the visitor is about to leave: a last 20% offer, or a free-tips offer if they already saw a discount.
// Turn everything off with POPUPS: false in config.js. Festival dates are also set in config.js.
(function () {
  'use strict';
  var path = location.pathname, C = window.VS_CONFIG || {};
  if (C.POPUPS === false) return;
  if (/^\/(admin|dashboard|login|thank-you|privacy|terms|shipping|contact|free-audit)(\/|\.html|$)/.test(path)) return;
  if (/[?&]resume=/.test(location.search)) return;

  var lang = (document.documentElement.lang || 'en').slice(0, 2); if (lang !== 'hi' && lang !== 'pa') lang = 'en';
  var BASE = Number(C.PRICE_BASE) || 1499, OFF = Math.round(BASE * 0.2), NOW_PRICE = BASE - OFF;
  var inr = function (n) { return '₹' + String(n).replace(/\B(?=(\d{2})*\d{3}$)/g, ','); };
  var DAY = 86400000, COOLDOWN = 3 * DAY, QUIET_AFTER_CLAIM = 7 * DAY, MAX_PER_VISIT = 2;

  // ---- text (English, Hindi, Punjabi) ----
  var T = {
    en: {
      tag: { welcome: 'Welcome offer', festival: 'Festival offer', comeback: 'Before you go', audit: 'Free, no payment' },
      title: {
        welcome: 'Get 20% off your first plan',
        festival: function (f) { return (f || 'Festival') + ' offer: 20% off'; },
        comeback: 'Wait! Take 20% off before you go',
        audit: 'Not ready to buy? Get 3 free tips first'
      },
      body: {
        discount: 'Your Instagram growth report and 30-day content calendar, ready in 48 hours.',
        audit: 'Send us your Instagram handle. We look at your page and message you 3 quick, specific things to fix. No payment, no pressure.'
      },
      code: 'Your code', copy: 'Copy', copied: 'Copied', now: 'Now', was: 'Usually',
      claim: 'Claim 20% off', audit_btn: 'Get my free tips', no: 'No thanks', close: 'Close',
      note: 'For first orders. The code is applied for you.'
    },
    hi: {
      tag: { welcome: 'वेलकम ऑफर', festival: 'त्योहार ऑफर', comeback: 'जाने से पहले', audit: 'फ्री, कोई पेमेंट नहीं' },
      title: { welcome: 'पहले प्लान पर 20% छूट पाएं', festival: function () { return 'त्योहार स्पेशल: 20% छूट'; }, comeback: 'रुकिए! जाने से पहले 20% छूट लें', audit: 'अभी खरीदना नहीं चाहते? पहले 3 फ्री सुझाव लें' },
      body: {
        discount: 'आपकी इंस्टाग्राम ग्रोथ रिपोर्ट और 30 दिन का कंटेंट कैलेंडर, 48 घंटे में तैयार।',
        audit: 'हमें अपना इंस्टाग्राम हैंडल भेजें। हम आपका पेज देखकर 3 सटीक सुझाव भेजेंगे। कोई पेमेंट नहीं।'
      },
      code: 'आपका कोड', copy: 'कॉपी', copied: 'कॉपी हो गया', now: 'अब', was: 'आम तौर पर',
      claim: '20% छूट लें', audit_btn: 'मेरे फ्री सुझाव पाएं', no: 'अभी नहीं', close: 'बंद करें',
      note: 'पहले ऑर्डर के लिए। कोड अपने आप लग जाएगा।'
    },
    pa: {
      tag: { welcome: 'ਵੈਲਕਮ ਆਫ਼ਰ', festival: 'ਤਿਉਹਾਰ ਆਫ਼ਰ', comeback: 'ਜਾਣ ਤੋਂ ਪਹਿਲਾਂ', audit: 'ਮੁਫ਼ਤ, ਕੋਈ ਪੇਮੈਂਟ ਨਹੀਂ' },
      title: { welcome: 'ਪਹਿਲੇ ਪਲਾਨ ’ਤੇ 20% ਛੋਟ ਲਵੋ', festival: function () { return 'ਤਿਉਹਾਰ ਸਪੈਸ਼ਲ: 20% ਛੋਟ'; }, comeback: 'ਰੁਕੋ! ਜਾਣ ਤੋਂ ਪਹਿਲਾਂ 20% ਛੋਟ ਲਵੋ', audit: 'ਹੁਣੇ ਖਰੀਦਣਾ ਨਹੀਂ ਚਾਹੁੰਦੇ? ਪਹਿਲਾਂ 3 ਮੁਫ਼ਤ ਸੁਝਾਅ ਲਵੋ' },
      body: {
        discount: 'ਤੁਹਾਡੀ ਇੰਸਟਾਗ੍ਰਾਮ ਗ੍ਰੋਥ ਰਿਪੋਰਟ ਅਤੇ 30 ਦਿਨ ਦਾ ਕੰਟੈਂਟ ਕੈਲੰਡਰ, 48 ਘੰਟਿਆਂ ਵਿੱਚ ਤਿਆਰ।',
        audit: 'ਸਾਨੂੰ ਆਪਣਾ ਇੰਸਟਾਗ੍ਰਾਮ ਹੈਂਡਲ ਭੇਜੋ। ਅਸੀਂ ਤੁਹਾਡਾ ਪੇਜ ਵੇਖ ਕੇ 3 ਸਟੀਕ ਸੁਝਾਅ ਭੇਜਾਂਗੇ। ਕੋਈ ਪੇਮੈਂਟ ਨਹੀਂ।'
      },
      code: 'ਤੁਹਾਡਾ ਕੋਡ', copy: 'ਕਾਪੀ', copied: 'ਕਾਪੀ ਹੋ ਗਿਆ', now: 'ਹੁਣ', was: 'ਆਮ ਤੌਰ ’ਤੇ',
      claim: '20% ਛੋਟ ਲਵੋ', audit_btn: 'ਮੇਰੇ ਮੁਫ਼ਤ ਸੁਝਾਅ ਲਵੋ', no: 'ਹੁਣੇ ਨਹੀਂ', close: 'ਬੰਦ ਕਰੋ',
      note: 'ਪਹਿਲੇ ਆਰਡਰ ਲਈ। ਕੋਡ ਆਪਣੇ ਆਪ ਲੱਗ ਜਾਵੇਗਾ।'
    }
  }[lang];

  var CODES = { welcome: 'WELCOME20', festival: 'FESTIVE20', comeback: 'COMEBACK20' };

  // ---- remembering what this visitor has already seen ----
  var KEY = 'vs-pop-v1', SES = 'vs-pop-visit', memLocal = {}, memVisit = { n: 0, discount: false };
  function loadLocal() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return memLocal; } }
  function saveLocal(o) { memLocal = o; try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function loadVisit() { try { return JSON.parse(sessionStorage.getItem(SES) || 'null') || memVisit; } catch (e) { return memVisit; } }
  function saveVisit(o) { memVisit = o; try { sessionStorage.setItem(SES, JSON.stringify(o)); } catch (e) {} }
  var now = function () { return Date.now(); };
  function recent(rec, key, span) { return rec[key] && now() - rec[key] < span; }

  function istToday() { return new Date(now() + 19800000).toISOString().slice(0, 10); }
  function activeFestival() {
    var list = C.POPUP_FESTIVALS || [], d = istToday();
    for (var i = 0; i < list.length; i++) if (list[i].from <= d && d <= list[i].to) return list[i];
    return null;
  }

  // ---- looks ----
  var css = '' +
    '#vsp{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,14,14,.72);backdrop-filter:blur(3px);animation:vspf .2s ease both}' +
    '#vsp .vc{position:relative;width:100%;max-width:440px;max-height:92vh;overflow:auto;background:var(--card,#0B2B2A);color:var(--ink,#F4F7F2);border:1.5px solid var(--gold,#FFB72B);border-radius:20px;padding:28px 24px 22px;box-shadow:0 24px 70px rgba(0,0,0,.55);animation:vspu .28s cubic-bezier(.2,.8,.2,1) both;font-family:var(--body,"DM Sans",system-ui,sans-serif)}' +
    '#vsp .vx{position:absolute;top:10px;right:10px;width:38px;height:38px;border-radius:50%;border:0;background:transparent;color:var(--mute,#9CB8B2);font-size:1.5rem;line-height:1;cursor:pointer}' +
    '#vsp .vx:hover{color:var(--ink,#F4F7F2);background:rgba(255,255,255,.07)}' +
    '#vsp .vt{display:inline-block;font-family:var(--mono,"DM Mono",monospace);font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--gold,#FFB72B);border:1.5px solid var(--gold,#FFB72B);border-radius:99px;padding:4px 12px;margin-bottom:14px}' +
    '#vsp h2{font-family:var(--display,"Bricolage Grotesque",system-ui,sans-serif);font-weight:800;font-size:1.65rem;line-height:1.15;letter-spacing:-.02em;margin:0 0 10px;padding-right:24px}' +
    '#vsp p{margin:0 0 14px;color:var(--mute,#9CB8B2);line-height:1.5;font-size:.97rem}' +
    '#vsp .vp{display:flex;align-items:baseline;gap:10px;margin:0 0 14px}#vsp .vp b{font-family:var(--display,"Bricolage Grotesque",system-ui,sans-serif);font-size:2rem;font-weight:800}' +
    '#vsp .vp s{color:var(--coral,#FF7A66);font-size:1.05rem}#vsp .vp small{color:var(--mute,#9CB8B2);font-size:.8rem}' +
    '#vsp .vk{display:flex;align-items:center;gap:10px;border:1.5px dashed var(--line,#1F4A47);border-radius:12px;padding:8px 8px 8px 14px;margin:0 0 16px}' +
    '#vsp .vk span{font-size:.78rem;color:var(--mute,#9CB8B2)}#vsp .vk code{font-family:var(--mono,"DM Mono",monospace);font-size:1.05rem;letter-spacing:.1em;color:var(--gold,#FFB72B);font-weight:700;margin-right:auto}' +
    '#vsp .vk button{border:1.5px solid var(--line,#1F4A47);background:transparent;color:var(--ink,#F4F7F2);border-radius:9px;padding:7px 12px;font:inherit;font-size:.82rem;cursor:pointer}' +
    '#vsp .vb{display:flex;align-items:center;justify-content:center;width:100%;min-height:50px;border-radius:14px;background:var(--gold,#FFB72B);color:#2A1A00;font-weight:800;font-size:1.02rem;text-decoration:none;box-shadow:0 5px 0 #B8801A;border:0;cursor:pointer;font-family:inherit;margin-bottom:6px}' +
    '#vsp .vb:active{transform:translateY(3px);box-shadow:0 2px 0 #B8801A}' +
    '#vsp .vn{display:block;width:100%;margin-top:12px;background:none;border:0;color:var(--mute,#9CB8B2);font:inherit;font-size:.9rem;padding:8px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}' +
    '#vsp .vf{margin:10px 0 0;font-size:.78rem;text-align:center}' +
    '#vsp :focus-visible{outline:3px solid var(--mint,#5EE6B8);outline-offset:2px}' +
    '@keyframes vspf{from{opacity:0}to{opacity:1}}@keyframes vspu{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}' +
    '@media (prefers-reduced-motion:reduce){#vsp,#vsp .vc{animation:none}}' +
    '@media (max-width:520px){#vsp{align-items:flex-end;padding:0}#vsp .vc{max-width:none;border-radius:22px 22px 0 0;border-width:1.5px 0 0;padding-bottom:calc(22px + env(safe-area-inset-bottom,0px))}}';

  var open = null, lastFocus = null;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function close(why) {
    if (!open) return;
    document.removeEventListener('keydown', open.key, true);
    open.root.parentNode && open.root.parentNode.removeChild(open.root);
    document.documentElement.style.overflow = open.overflow;
    var f = lastFocus; open = null; try { f && f.focus && f.focus(); } catch (e) {}
  }

  function show(kind) {
    if (open) return;
    var rec = loadLocal(), visit = loadVisit();
    visit.n = (visit.n || 0) + 1; if (kind !== 'audit') visit.discount = true; saveVisit(visit);
    var t = now(); rec[kind === 'audit' ? 'audit' : 'discount'] = t; rec['last_' + kind] = t; saveLocal(rec);

    if (!document.getElementById('vsp-css')) { var st = el('style'); st.id = 'vsp-css'; st.textContent = css; document.head.appendChild(st); }
    var fest = kind === 'festival' ? activeFestival() : null;
    var root = el('div'); root.id = 'vsp';
    var card = el('div', 'vc'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'vsp-h');
    var x = el('button', 'vx', '×'); x.type = 'button'; x.setAttribute('aria-label', T.close);
    card.appendChild(x);
    card.appendChild(el('span', 'vt', T.tag[kind]));
    var h = el('h2', null, typeof T.title[kind] === 'function' ? T.title[kind](fest && fest.name) : T.title[kind]); h.id = 'vsp-h'; card.appendChild(h);
    card.appendChild(el('p', null, kind === 'audit' ? T.body.audit : T.body.discount));

    var cta, no = el('button', 'vn', T.no); no.type = 'button';
    if (kind === 'audit') {
      cta = el('a', 'vb', T.audit_btn); cta.href = '/free-audit/';
    } else {
      var pr = el('div', 'vp'); var b = el('b', null, inr(NOW_PRICE)), s = el('s', null, inr(BASE));
      pr.appendChild(b); pr.appendChild(s); card.appendChild(pr);
      var code = CODES[kind], kr = el('div', 'vk'); kr.appendChild(el('span', null, T.code)); kr.appendChild(el('code', null, code));
      var cp = el('button', null, T.copy); cp.type = 'button';
      cp.addEventListener('click', function () {
        try { navigator.clipboard.writeText(code); } catch (e) {}
        cp.textContent = T.copied; setTimeout(function () { cp.textContent = T.copy; }, 1600);
      });
      kr.appendChild(cp); card.appendChild(kr);
      cta = el('a', 'vb', T.claim); cta.href = '/?code=' + code + '#order';
      cta.addEventListener('click', function (e) {
        var r = loadLocal(); r.claimed = now(); saveLocal(r);
        try { window.vsTrack && window.vsTrack('Lead', { content_name: 'Popup ' + kind }); } catch (er) {}
        var refBox = document.getElementById('ref'), refBtn = document.getElementById('refBtn');
        if (path === '/' && refBox && refBtn) {                       // already on the order page: apply it right here
          e.preventDefault(); close();
          refBox.value = code; refBtn.click();
          var o = document.getElementById('order'); if (o && o.scrollIntoView) o.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
    card.appendChild(cta);
    if (kind !== 'audit') card.appendChild(el('p', 'vf', T.note));
    card.appendChild(no);
    root.appendChild(card); document.body.appendChild(root);

    lastFocus = document.activeElement;
    var overflow = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden';
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {                                           // keep keyboard focus inside the pop-up
        var items = card.querySelectorAll('button,a[href]'); if (!items.length) return;
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', key, true);
    open = { root: root, key: key, overflow: overflow };
    x.addEventListener('click', function () { close(); });
    no.addEventListener('click', function () { close(); });
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    cta.focus({ preventScroll: true });
    try { window.vsTrack && window.vsTrack('ViewContent', { content_name: 'Popup ' + kind }); } catch (e) {}
  }

  // ---- deciding what to show, and when ----
  function allowed(kind) {
    var rec = loadLocal(), visit = loadVisit();
    if (open) return false;
    if ((visit.n || 0) >= MAX_PER_VISIT) return false;
    if (recent(rec, 'claimed', QUIET_AFTER_CLAIM)) return false;
    if (kind === 'audit') return !recent(rec, 'audit', COOLDOWN);
    return !recent(rec, 'discount', COOLDOWN) && !visit.discount;
  }
  function formHasInput() {
    var ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.id !== 'ref') return true;
    var ids = ['name', 'email', 'phone', 'ig', 'biz'];
    for (var i = 0; i < ids.length; i++) { var f = document.getElementById(ids[i]); if (f && f.value && f.value.trim()) return true; }
    return false;
  }
  function inPayment() { return !!document.querySelector('.razorpay-container, iframe[src*="razorpay"]'); }

  var timedKind = function () { return activeFestival() ? 'festival' : 'welcome'; };
  var tries = 0;
  function timed() {
    if (document.hidden || formHasInput() || inPayment()) { if (++tries < 4) return setTimeout(timed, 6000); return; }
    var k = timedKind(); if (allowed(k)) show(k);
  }
  setTimeout(timed, 10000);

  function exitIntent() {
    if (document.hidden || inPayment() || now() - t0 < 6000) return;
    var rec = loadLocal(), visit = loadVisit();
    var sawDiscount = visit.discount || recent(rec, 'discount', COOLDOWN);
    var k = sawDiscount ? 'audit' : 'comeback';
    if (allowed(k)) show(k);
  }
  var t0 = now();
  document.addEventListener('mouseout', function (e) {                // computer: mouse leaves through the top of the window
    if (!e.relatedTarget && e.clientY <= 0) exitIntent();
  });
  var lastY = window.scrollY, lastT = now(), peak = 0;                // phone: a quick flick back up the page
  window.addEventListener('scroll', function () {
    var y = window.scrollY, t = now(); peak = Math.max(peak, y);
    if (peak > window.innerHeight * 0.8 && lastY - y > 350 && t - lastT < 450 && 'ontouchstart' in window) exitIntent();
    if (t - lastT > 450) { lastY = y; lastT = t; }
  }, { passive: true });
})();
