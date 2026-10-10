// Shared by every page: loads the Meta Pixel (only if you set PIXEL_ID in config.js).
(function () {
  var c = window.VS_CONFIG || {};
  window.vsTrack = function () {};
  if (!c.PIXEL_ID) return;
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', c.PIXEL_ID);
  fbq('track', 'PageView');
  window.vsTrack = function (ev, data) { try { fbq('track', ev, data || {}); } catch (e) {} };
})();
