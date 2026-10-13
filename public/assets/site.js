// Shared by every public page: loads the Meta Pixel when you have one.
// Put your Pixel ID either in config.js (PIXEL_ID) or in Netlify as META_PIXEL_ID.
// It is never loaded on the admin, dashboard or login pages.
(function () {
  var c = window.VS_CONFIG || {}, q = [], ready = false;
  function send(ev, data) { try { window.fbq('track', ev, data || {}); } catch (e) {} }
  window.vsTrack = function (ev, data) { if (ready) send(ev, data); else q.push([ev, data]); };
  if (/^\/(admin|dashboard|login)(\/|\.html|$)/.test(location.pathname)) { window.vsTrack = function () {}; return; }
  function start(id) {
    id = String(id || '').replace(/\D/g, '');
    if (!id || window.fbq) return;
    !function (f, b, e, v, n, t, s) {
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', id);
    window.fbq('track', 'PageView');
    ready = true;
    q.forEach(function (x) { send(x[0], x[1]); }); q = [];
    if (location.pathname === '/' || /^\/(hi|pa|for)\//.test(location.pathname)) send('ViewContent', { content_name: 'Instagram Growth Report', value: c.PRICE_BASE || 1499, currency: 'INR' });
  }
  if (c.PIXEL_ID) start(c.PIXEL_ID);
  else if (window.fetch) fetch('/api/site-config').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.pixelId) start(j.pixelId); }).catch(function () {});
})();
