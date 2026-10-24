// Builds and sends the "Tell us your problem" form. Put <div data-enquiry="home"></div> (or "contact") where it should appear.
(function () {
  var hosts = document.querySelectorAll('[data-enquiry]');
  if (!hosts.length) return;
  var NEEDS = ['A business website', 'A custom business tool', 'Monthly care and support', 'Not sure yet'];
  function build(host) {
    var src = host.getAttribute('data-enquiry') || 'home', id = 'q' + Math.random().toString(36).slice(2, 7);
    host.className = 'enq';
    host.innerHTML =
      '<h3>Write to us here</h3><p class="enq-sub">Tell us your problem in your own words. We reply within one business day.</p>' +
      '<form novalidate><div class="eg">' +
      '<div class="ef"><label for="' + id + 'n">Your name</label><input id="' + id + 'n" name="name" autocomplete="name" maxlength="80"></div>' +
      '<div class="ef"><label for="' + id + 'p">Mobile number</label><input id="' + id + 'p" name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="16" placeholder="10-digit number"></div>' +
      '<div class="ef"><label for="' + id + 'e">Email (optional)</label><input id="' + id + 'e" name="email" type="email" autocomplete="email" maxlength="120"></div>' +
      '<div class="ef"><label for="' + id + 'k">What do you need?</label><select id="' + id + 'k" name="need">' + NEEDS.map(function (n) { return '<option>' + n + '</option>'; }).join('') + '</select></div>' +
      '<div class="ef full"><label for="' + id + 'm">What problem do you want to solve?</label><textarea id="' + id + 'm" name="problem" maxlength="1200" placeholder="For example: I keep my customer list in Excel and I forget to follow up."></textarea></div>' +
      '</div><div class="hp" aria-hidden="true"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<div class="eb"><button class="btn" type="submit">Send my message</button></div>' +
      '<p class="em" role="status" aria-live="polite"></p>' +
      '<p class="en">We use your details only to reply to you. See our <a href="/privacy">privacy policy</a>.</p></form>';
    var f = host.querySelector('form'), m = host.querySelector('.em'), btn = host.querySelector('button');
    function val(n) { return f.elements[n].value.trim(); }
    function mark(n, bad) { f.elements[n].setAttribute('aria-invalid', bad ? 'true' : 'false'); return bad; }
    f.addEventListener('input', function (e) { if (e.target && e.target.setAttribute) e.target.setAttribute('aria-invalid', 'false'); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var phone = val('phone').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
      var bad = [mark('name', val('name').length < 2), mark('phone', !/^[6-9]\d{9}$/.test(phone)), mark('email', val('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val('email'))), mark('problem', val('problem').length < 5)];
      if (bad.some(Boolean)) { m.className = 'em bad'; m.textContent = 'Please check the highlighted boxes: your name, a 10-digit mobile number, and a few words about your problem.'; return; }
      btn.disabled = true; m.className = 'em'; m.textContent = 'Sending…';
      fetch('/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: val('name'), phone: phone, email: val('email'), need: val('need'), problem: val('problem'), website: val('website'), source: src }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok) { btn.disabled = false; m.className = 'em bad'; m.textContent = x.j.error || 'Sorry, that did not go through. Please message us on WhatsApp.'; return; }
          try { window.vsTrack && window.vsTrack('Lead', { content_name: 'Enquiry form' }); } catch (er) {}
          host.innerHTML = '<div class="done" role="status"><b>Thank you!</b>We have your message and will reply on your mobile number within one business day.</div>';
        })
        .catch(function () { btn.disabled = false; m.className = 'em bad'; m.textContent = 'Sorry, that did not go through. Please check your internet or message us on WhatsApp.'; });
    });
  }
  for (var i = 0; i < hosts.length; i++) build(hosts[i]);
})();
