/* ==========================================================================
   Vigyapan Studio - scroll and motion effects (works with theme.css).
   Everything here is decoration. If this file fails to load, every page still
   works and shows all its content. Visitors who asked their phone/computer for
   "reduced motion" get a calm version without the moving effects.
   ========================================================================== */
(function () {
  'use strict';
  var W = window, d = document, root = d.documentElement;
  if (W.__fx) return;
  W.__fx = 1;

  var mq = function (q) { return W.matchMedia ? W.matchMedia(q).matches : false; };
  var reduce = mq('(prefers-reduced-motion: reduce)');
  var fine = mq('(hover: hover) and (pointer: fine)');
  var hasIO = 'IntersectionObserver' in W;
  var motion = hasIO && !reduce;               // full effects
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  function run() {
    var body = d.body;

    /* ---------- decorations: glowing blobs, grain, progress bar, cursor glow ---------- */
    var aura = $('.aura');
    if (!aura) {
      aura = d.createElement('div'); aura.className = 'aura'; aura.setAttribute('aria-hidden', 'true');
      body.insertBefore(aura, body.firstChild);
    }
    while (aura.children.length < 5) aura.appendChild(d.createElement('i'));
    if (!$('.grain')) { var g = d.createElement('div'); g.className = 'grain'; g.setAttribute('aria-hidden', 'true'); body.appendChild(g); }
    var bar = d.createElement('div'); bar.className = 'scroll-progress'; bar.setAttribute('aria-hidden', 'true'); body.appendChild(bar);
    var glow = null;
    if (motion && fine) { glow = d.createElement('div'); glow.className = 'cursor-glow'; glow.setAttribute('aria-hidden', 'true'); body.appendChild(glow); }

    if (motion) root.classList.add('fx');

    /* ---------- headline: words rise one by one ---------- */
    var h1 = $('.hero h1') || $('main h1') || $('h1');
    if (motion && h1 && !Array.prototype.some.call(h1.children, function (c) { return /^(SVG|IMG)$/i.test(c.tagName); })) {
      var idx = 0, nodes = Array.prototype.slice.call(h1.childNodes);
      nodes.forEach(function (n) {
        if (n.nodeType === 3) {
          var parts = n.nodeValue.split(/(\s+)/), frag = d.createDocumentFragment();
          parts.forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(d.createTextNode(' ')); return; }
            var s = d.createElement('span'); s.className = 'hw'; s.style.setProperty('--i', idx++); s.textContent = p; frag.appendChild(s);
          });
          h1.replaceChild(frag, n);
        } else if (n.nodeType === 1 && /^(EM|STRONG|SPAN|B|I)$/.test(n.tagName)) {
          n.classList.add('hw'); n.style.setProperty('--i', idx++);
        }
      });
      var hwList = $$('.hw', h1);
      W.requestAnimationFrame(function () { W.requestAnimationFrame(function () { hwList.forEach(function (w) { w.classList.add('in'); }); }); });
    }

    /* ---------- reveal on scroll ---------- */
    if (motion) {
      var AUTO = [
        '.sec > .eyebrow', '.sec > h2', '.sec > .sub', '.sec > p.sub', '.sec > h3',
        '.sec .grid > *', '.cards3 > *', '.steps > li', '.faq details', '.postlist a', '.types a',
        '.get article', '.plan2', '.samplestrip', '.sample', '.band', '.rev', '.cta2', '.udyam',
        '.hero2', '.demo > *', '.final', 'footer .brandfoot', '.marq', '.lit-wrap', '.promises > *'
      ].join(',');
      var SKIP = 'form, .form-shell, [data-enquiry], #order, .no-rv, .stage, .cl-stage, [hidden], .sticky, .pop, .toast';
      var list = $$(AUTO).filter(function (el) {
        if (el.hasAttribute('data-rv')) return true;
        if (el.closest(SKIP)) return false;
        if (!el.getClientRects().length) return false;
        if (el.querySelector('form')) return false;
        return true;
      });
      // also the ones written by hand in the page (data-rv="left" etc.)
      $$('[data-rv]').forEach(function (el) { if (list.indexOf(el) < 0 && el.getClientRects().length) list.push(el); });
      list.forEach(function (el) {
        if (!el.hasAttribute('data-rv')) {
          var v = '';
          if (el.matches('.final, .svc.feat, .plan2.main')) v = 'zoom';
          else if (el.matches('.steps > li')) v = 'flip';
          el.setAttribute('data-rv', v);
        }
      });
      var io = new IntersectionObserver(function (entries) {
        var shown = entries.filter(function (e) { return e.isIntersecting; })
          .sort(function (a, b) { return (a.boundingClientRect.top - b.boundingClientRect.top) || (a.boundingClientRect.left - b.boundingClientRect.left); });
        shown.forEach(function (e, k) {
          var el = e.target, delay = Math.min(k * 0.09, 0.5);
          el.style.setProperty('--d', delay + 's');
          el.classList.add('in');
          io.unobserve(el);
          setTimeout(function () { el.removeAttribute('data-rv'); el.classList.remove('in'); el.style.removeProperty('--d'); }, 1500 + delay * 1000);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      list.forEach(function (el) { io.observe(el); });
      // safety net: anything still hidden after a long time is shown anyway
      setTimeout(function () { if (!root.classList.contains('fx-show') && $$('[data-rv]:not(.in)').length > 60) root.classList.add('fx-show'); }, 8000);
    }

    /* ---------- "in view" switch: graphics pause when off-screen ---------- */
    var vis = $$('[data-inview]');
    if (hasIO && vis.length) {
      var iov = new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.classList.toggle('vis', e.isIntersecting); }); }, { threshold: 0.15 });
      vis.forEach(function (el) { iov.observe(el); });
    } else vis.forEach(function (el) { el.classList.add('vis'); });

    /* ---------- icons that draw themselves ---------- */
    var drawEls = $$('[data-draw]');
    if (drawEls.length) {
      if (motion) {
        var iod = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('drawn'); iod.unobserve(e.target); } }); }, { threshold: 0.4 });
        drawEls.forEach(function (el) { iod.observe(el); });
      } else drawEls.forEach(function (el) { el.classList.add('drawn'); });
    }

    /* ---------- numbers that count up (prices etc.) ---------- */
    if (motion) {
      var cEls = $$('[data-count], .gsvc .price').filter(function (el) { return el.childNodes.length === 1 && el.firstChild.nodeType === 3 && /\d/.test(el.textContent); });
      if (cEls.length) {
        var ioc = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (!e.isIntersecting) return;
            var el = e.target; ioc.unobserve(el);
            var orig = el.textContent, m = orig.match(/^(\D*)([\d,]+)(.*)$/);
            if (!m) return;
            var end = parseInt(m[2].replace(/,/g, ''), 10), t0 = null, dur = 1100;
            (function step(t) {
              if (t0 === null) t0 = t;
              var p = clamp((t - t0) / dur, 0, 1), eased = 1 - Math.pow(1 - p, 3);
              el.textContent = p >= 1 ? orig : m[1] + Math.round(end * eased).toLocaleString('en-IN') + m[3];
              if (p < 1) W.requestAnimationFrame(step);
            })(performance.now());
          });
        }, { threshold: 0.6 });
        cEls.forEach(function (el) { ioc.observe(el); });
      }
    }

    /* ---------- rotating words ("We build ___") ---------- */
    $$('[data-rotate]').forEach(function (el) {
      var words = (el.getAttribute('data-rotate') || '').split('|').filter(Boolean);
      if (words.length < 2 || !motion) return;
      var wi = 0, ci = words[0].length, del = false, running = false;
      function tick() {
        var w = words[wi];
        if (!del) { ci++; el.textContent = w.slice(0, ci); if (ci >= w.length) { del = true; return setTimeout(tick, 1700); } return setTimeout(tick, 70); }
        ci--; el.textContent = w.slice(0, ci);
        if (ci <= 0) { del = false; wi = (wi + 1) % words.length; return setTimeout(tick, 280); }
        setTimeout(tick, 38);
      }
      var iot = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting && !running) { running = true; setTimeout(tick, 1500); }
      }, { threshold: 0.3 });
      iot.observe(el);
    });

    /* ---------- sentence whose words light up as you scroll ---------- */
    var lits = $$('[data-lit]').map(function (el) {
      var words = el.textContent.trim().split(/\s+/), n = [];
      el.setAttribute('aria-label', el.textContent.trim());
      el.textContent = '';
      words.forEach(function (w, i) {
        var s = d.createElement('span'); s.className = 'lw'; s.setAttribute('aria-hidden', 'true'); s.textContent = w;
        el.appendChild(s); if (i < words.length - 1) el.appendChild(d.createTextNode(' ')); n.push(s);
      });
      if (!motion) n.forEach(function (x) { x.classList.add('on'); });
      return { el: el, w: n };
    });

    /* ---------- timeline: How it works ---------- */
    var steps = $('.steps');
    var stepLis = steps ? $$('li', steps) : [];

    /* ---------- parallax items ---------- */
    var pars = motion ? $$('[data-par]') : [];
    pars.forEach(function (el) { el.__py = 0; });

    /* ---------- one scroll loop for everything ---------- */
    var header = $('header.top');
    var hueLast = -1, ticking = false;
    function frame() {
      ticking = false;
      var y = W.pageYOffset || root.scrollTop, vh = W.innerHeight, max = Math.max(1, root.scrollHeight - vh);
      var p = clamp(y / max, 0, 1);
      bar.style.setProperty('--sp', p.toFixed(4));
      if (header) header.classList.toggle('stuck', y > 14);
      if (motion && W.innerWidth > 700) {
        var hq = Math.round(p * 36) / 36;
        if (hq !== hueLast) { hueLast = hq; aura.style.setProperty('--hue', hq); }
      }
      if (motion) {
        for (var i = 0; i < pars.length; i++) {
          var el = pars[i], f = parseFloat(el.getAttribute('data-par')) || 0.1, r = el.getBoundingClientRect();
          if (r.bottom < -300 || r.top > vh + 300) continue;
          var mid = (r.top - el.__py) + r.height / 2 - vh / 2, ny = clamp(-mid * f, -140, 140);
          el.__py = ny; el.style.translate = '0 ' + ny.toFixed(1) + 'px';
        }
        lits.forEach(function (L) {
          var r = L.el.getBoundingClientRect();
          var pr = clamp((vh * 0.88 - r.top) / (vh * 0.43 + r.height), 0, 1), n = Math.round(pr * L.w.length);
          L.w.forEach(function (s, k) { var on = k < n; if (s.__on !== on) { s.__on = on; s.classList.toggle('on', on); } });
        });
        if (steps) {
          var sr = steps.getBoundingClientRect();
          steps.style.setProperty('--tp', clamp((vh * 0.82 - sr.top) / (sr.height + vh * 0.25), 0, 1).toFixed(3));
          stepLis.forEach(function (li) { li.classList.toggle('on', li.getBoundingClientRect().top < vh * 0.78); });
        }
      }
      spy();
    }
    function queue() { if (!ticking) { ticking = true; W.requestAnimationFrame(frame); } }
    W.addEventListener('scroll', queue, { passive: true });
    W.addEventListener('resize', function () { queue(); placeBlob(); }, { passive: true });

    /* ---------- menu: sliding glass blob + section highlight on the home page ---------- */
    var nav = $('.mainnav'), blob = null, links = nav ? $$('a', nav) : [], hoverLink = null, spyLink = null;
    function activeLink() { return hoverLink || spyLink || $('a[aria-current]', nav) || null; }
    function placeBlob() {
      if (!blob) return;
      if (W.innerWidth <= 900) { nav.classList.remove('has-blob'); return; }
      var a = activeLink();
      if (!a) { nav.classList.remove('has-blob'); return; }
      nav.classList.add('has-blob');
      blob.style.width = a.offsetWidth + 'px';
      blob.style.transform = 'translateX(' + a.offsetLeft + 'px)';
    }
    if (nav && links.length) {
      blob = d.createElement('span'); blob.className = 'nav-blob'; blob.setAttribute('aria-hidden', 'true'); nav.insertBefore(blob, nav.firstChild);
      links.forEach(function (a) {
        a.addEventListener('mouseenter', function () { hoverLink = a; placeBlob(); });
        a.addEventListener('focus', function () { hoverLink = a; placeBlob(); });
      });
      nav.addEventListener('mouseleave', function () { hoverLink = null; placeBlob(); });
      nav.addEventListener('focusout', function () { hoverLink = null; placeBlob(); });
      placeBlob();
      if (d.fonts && d.fonts.ready) d.fonts.ready.then(placeBlob);
      W.addEventListener('load', placeBlob);
    }
    var spyPairs = [];
    if (links.length && /^\/(index\.html)?$/.test(location.pathname)) {
      links.forEach(function (a) {
        var m = (a.getAttribute('href') || '').match(/^\/?#([\w-]+)$/), s = m && d.getElementById(m[1]);
        if (s) spyPairs.push({ a: a, s: s });
      });
    }
    function spy() {
      if (!spyPairs.length) return;
      var vh = W.innerHeight, cur = null;
      spyPairs.forEach(function (p) { var r = p.s.getBoundingClientRect(); if (r.top < vh * 0.4 && r.bottom > vh * 0.25) cur = p.a; });
      if (cur !== spyLink) { spyLink = cur; placeBlob(); }
    }

    /* ---------- mouse effects (desktop only) ---------- */
    if (motion && fine) {
      var GLASS = '.card,.svc,.steps li,.faq details,.dash,.cl-form,.cl-chip,.stage .chip,.enq,.samplestrip,.plan2,.get article,.sample,.band,.rev,.cta2,.postlist a,.types a,.udyam,.prom,.glass,.final';
      var curGlass = null, mx = 0, my = 0, pend = false, gx = 0, gy = 0, tx = 0, ty = 0, glowOn = false;
      var stage = $('.hero .stage'), stageBox = null, chips = stage ? $$('.chip', stage) : [], tiltX = 0, tiltY = 0, tgtX = 0, tgtY = 0;
      var mags = $$('.btn.big, .hero .btn').filter(function (b) { return !b.closest('form, .form-shell'); });
      function pointer() {
        pend = false;
        var t = d.elementFromPoint(mx, my), g = t && t.closest ? t.closest(GLASS) : null;
        if (g !== curGlass) { if (curGlass) curGlass.style.removeProperty('--sa'); curGlass = g; if (g) g.style.setProperty('--sa', '.17'); }
        if (g) { var r = g.getBoundingClientRect(); g.style.setProperty('--mx', (mx - r.left) + 'px'); g.style.setProperty('--my', (my - r.top) + 'px'); }
        mags.forEach(function (b) {
          var r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = mx - cx, dy = my - cy, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) b.style.translate = (dx * 0.18).toFixed(1) + 'px ' + (dy * 0.28).toFixed(1) + 'px';
          else if (b.style.translate) b.style.translate = '';
        });
      }
      d.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        mx = e.clientX; my = e.clientY; tx = mx; ty = my;
        if (!glowOn) { glowOn = true; glow.classList.add('on'); gx = tx; gy = ty; loop(); }
        if (stage) {
          var r = stage.getBoundingClientRect();
          if (r.bottom > 0 && r.top < W.innerHeight) { tgtY = clamp(((mx - (r.left + r.width / 2)) / W.innerWidth) * 16, -8, 8); tgtX = clamp(-((my - (r.top + r.height / 2)) / W.innerHeight) * 12, -6, 6); }
        }
        if (!pend) { pend = true; W.requestAnimationFrame(pointer); }
      }, { passive: true });
      d.documentElement.addEventListener('mouseleave', function () { glow.classList.remove('on'); glowOn = false; tgtX = tgtY = 0; });
      var looping = false;
      function loop() {
        if (looping) return; looping = true;
        (function step() {
          gx += (tx - gx) * 0.14; gy += (ty - gy) * 0.14;
          glow.style.transform = 'translate3d(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px,0)';
          if (stage) {
            tiltX += (tgtX - tiltX) * 0.08; tiltY += (tgtY - tiltY) * 0.08;
            stage.style.transform = 'perspective(1100px) rotateX(' + tiltX.toFixed(2) + 'deg) rotateY(' + tiltY.toFixed(2) + 'deg)';
            chips.forEach(function (c, k) { c.style.translate = (tiltY * (k + 1) * 2.2).toFixed(1) + 'px ' + (-tiltX * (k + 1) * 2.2).toFixed(1) + 'px'; });
          }
          if (glowOn || Math.abs(tiltX) + Math.abs(tiltY) > 0.02) W.requestAnimationFrame(step); else looping = false;
        })();
      }
    }

    /* ---------- the clinic booking graphic types itself when it scrolls into view ---------- */
    var cl = $('.cl-form');
    if (cl && motion) {
      var fields = $$('.cl-field', cl), nameF = fields[0], phoneF = fields[1] && $('span', fields[1]);
      var dateEls = $$('.cl-dates > div', cl), timeEls = $$('.cl-times > div', cl), btn = $('.cl-btn', cl);
      var chipEls = $$('.cl-chip', cl.parentNode);
      if (nameF && phoneF && btn && dateEls.length && timeEls.length) {
        var nameText = nameF.textContent.trim(), caret = $('.cl-caret', phoneF), phoneNode = phoneF.firstChild, phoneText = phoneNode.nodeValue, btnText = btn.textContent;
        var selDate = dateEls.filter(function (e) { return e.classList.contains('cl-sel'); })[0];
        var selTime = timeEls.filter(function (e) { return e.classList.contains('cl-sel'); })[0];
        var played = false, timers = [];
        var later = function (fn, ms) { timers.push(setTimeout(fn, ms)); };
        var type = function (set, text, start, speed) { for (var i = 1; i <= text.length; i++) (function (n) { later(function () { set(text.slice(0, n)); }, start + n * speed); })(i); };
        var play = function () {
          if (played) return; played = true;
          nameF.firstChild.nodeValue = ''; phoneNode.nodeValue = '';
          if (selDate) selDate.classList.remove('cl-sel'); if (selTime) selTime.classList.remove('cl-sel');
          btn.textContent = btnText; btn.classList.remove('done');
          chipEls.forEach(function (c) { c.classList.add('pre'); });
          type(function (t) { nameF.firstChild.nodeValue = t; }, nameText, 300, 70);
          var t1 = 300 + nameText.length * 70 + 250;
          type(function (t) { phoneNode.nodeValue = t; }, phoneText, t1, 80);
          var t2 = t1 + phoneText.length * 80 + 350;
          later(function () { if (selDate) selDate.classList.add('cl-sel'); }, t2);
          later(function () { if (selTime) selTime.classList.add('cl-sel'); }, t2 + 600);
          later(function () { btn.classList.add('done'); btn.textContent = 'Appointment booked ✓'; }, t2 + 1300);
          chipEls.forEach(function (c, k) { later(function () { c.classList.remove('pre'); }, t2 + 1400 + k * 260); });
        };
        // start empty only when the graphic is about to be seen, then play
        var ioCl = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (e.isIntersecting) { if (!played) play(); }
            else if (played && e.boundingClientRect.top > 0) { /* scrolled back up past it: replay next time */ timers.forEach(clearTimeout); timers = []; played = false;
              nameF.firstChild.nodeValue = nameText; phoneNode.nodeValue = phoneText; if (selDate) selDate.classList.add('cl-sel'); if (selTime) selTime.classList.add('cl-sel'); btn.textContent = btnText; btn.classList.remove('done'); chipEls.forEach(function (c) { c.classList.remove('pre'); }); }
          });
        }, { threshold: 0.45 });
        ioCl.observe(cl);
      }
    }

    frame();
  }

  function start() { try { run(); } catch (err) { root.classList.add('fx-show'); if (W.console) console.warn('fx:', err); } }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
})();
