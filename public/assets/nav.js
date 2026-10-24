// Opens and closes the menu on phones.
(function () {
  var b = document.querySelector('.nav-toggle'), n = document.getElementById('mainnav');
  if (!b || !n) return;
  function set(open) { n.classList.toggle('open', open); b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.firstChild.nodeValue = open ? '✕' : '☰'; }
  b.addEventListener('click', function () { set(!n.classList.contains('open')); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  document.addEventListener('click', function (e) { if (!n.contains(e.target) && !b.contains(e.target)) set(false); });
  n.addEventListener('click', function (e) { if (e.target.tagName === 'A') set(false); });
})();
