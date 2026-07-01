(function () {
  'use strict';

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Sticky header state ---------- */
  var header = document.getElementById('siteHeader');
  function onScroll() {
    if (!header) return;
    if (window.scrollY > 40) header.classList.add('is-scrolled');
    else header.classList.remove('is-scrolled');
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Mobile nav toggle ---------- */
  var navToggle = document.getElementById('navToggle');
  var mainNav = document.getElementById('mainNav');
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', function () {
      var open = mainNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    mainNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mainNav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
  }

  /* ---------- Photo grid: probe assets/photos/1.jpg ... 19.jpg ---------- */
  var PHOTO_COUNT = 19;
  var PLACEHOLDER_LABELS = [
    'Jeugdopleiding', 'Teamspirit', 'Overgangsklasse', 'Community',
    'Vrijwilligers', 'Wedstrijddag', 'Trainersteam', 'Clubgevoel'
  ];

  function loadPhotoGrid() {
    var grid = document.getElementById('photoGrid');
    var creditEl = document.getElementById('photoCredit');
    if (!grid) return;

    var checks = [];
    for (var i = 1; i <= PHOTO_COUNT; i++) {
      checks.push(probeImage('assets/photos/' + i + '.jpg'));
    }

    Promise.all(checks).then(function (results) {
      var found = results.filter(Boolean);

      if (found.length === 0) {
        renderPlaceholderTiles(grid);
        return;
      }

      found.forEach(function (src) {
        var tile = document.createElement('div');
        tile.className = 'photo-tile';
        var img = document.createElement('img');
        img.src = src;
        img.loading = 'lazy';
        img.alt = 'AthenA in actie';
        tile.appendChild(img);
        grid.appendChild(tile);
      });

      if (creditEl) creditEl.hidden = false;
    });
  }

  function probeImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(src); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function renderPlaceholderTiles(grid) {
    var count = 8;
    for (var i = 0; i < count; i++) {
      var tile = document.createElement('div');
      tile.className = 'photo-tile placeholder';
      var span = document.createElement('span');
      span.textContent = PLACEHOLDER_LABELS[i % PLACEHOLDER_LABELS.length];
      tile.appendChild(span);
      grid.appendChild(tile);
    }
  }

  loadPhotoGrid();

  /* ---------- Sponsor tier -> form prefill ---------- */
  var pakketSelect = document.getElementById('fldPakket');
  document.querySelectorAll('[data-pakket]').forEach(function (el) {
    if (el.tagName !== 'A') return;
    el.addEventListener('click', function () {
      var pakket = el.getAttribute('data-pakket');
      if (pakketSelect && pakket) {
        Array.prototype.forEach.call(pakketSelect.options, function (opt) {
          if (opt.value === pakket) pakketSelect.value = pakket;
        });
      }
    });
  });

  /* ---------- Sponsor form submission (Formspree + mailto fallback) ---------- */
  var form = document.getElementById('sponsorForm');
  var statusEl = document.getElementById('formStatus');
  var PLACEHOLDER_ACTION_MARKER = 'REPLACE_WITH_FORMSPREE_ENDPOINT';

  if (form) {
    form.addEventListener('submit', function (evt) {
      var actionUrl = form.getAttribute('action') || '';
      var endpointConfigured = actionUrl.indexOf(PLACEHOLDER_ACTION_MARKER) === -1;

      if (!endpointConfigured) {
        // Formspree not set up yet: build a mailto with the entered details so the
        // enquiry still reaches sponsors@hcathena.nl.
        evt.preventDefault();
        var data = new FormData(form);
        var body =
          'Naam: ' + (data.get('naam') || '') + '\n' +
          'Bedrijf: ' + (data.get('bedrijf') || '') + '\n' +
          'E-mail: ' + (data.get('email') || '') + '\n' +
          'Telefoon: ' + (data.get('telefoon') || '') + '\n' +
          'Interesse: ' + (data.get('pakket') || '') + '\n\n' +
          (data.get('bericht') || '');
        var mailto = 'mailto:sponsors@hcathena.nl' +
          '?subject=' + encodeURIComponent('Sponsoraanvraag Vrienden van AthenA') +
          '&body=' + encodeURIComponent(body);
        window.location.href = mailto;
        setStatus('We openen je e-mailprogramma zodat je de aanvraag direct kunt versturen.', 'is-success');
        return;
      }

      evt.preventDefault();
      setStatus('Versturen…', '');
      fetch(actionUrl, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      }).then(function (res) {
        if (res.ok) {
          form.reset();
          setStatus('Bedankt! We nemen zo snel mogelijk contact met je op.', 'is-success');
        } else {
          throw new Error('submit-failed');
        }
      }).catch(function () {
        setStatus('Versturen is niet gelukt. Mail ons gerust direct via sponsors@hcathena.nl.', 'is-error');
      });
    });
  }

  function setStatus(text, cls) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'form-status' + (cls ? ' ' + cls : '');
  }

  /* ---------- QR code render ---------- */
  var qrTarget = document.getElementById('qrRender');
  if (qrTarget && window.QRCode) {
    new QRCode(qrTarget, {
      text: 'https://vriendenvanathena.nl',
      width: 176,
      height: 176,
      colorDark: '#071C6B',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  }
})();
