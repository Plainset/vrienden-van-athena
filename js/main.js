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

  function placeholderLabel(i) {
    var key = 'gallery.placeholder.' + i;
    return window.i18n ? window.i18n.t(key) : key;
  }

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
      span.setAttribute('data-placeholder-index', i);
      span.textContent = placeholderLabel(i);
      tile.appendChild(span);
      grid.appendChild(tile);
    }
  }

  loadPhotoGrid();

  // Re-label placeholder tiles (if shown) when the language changes.
  document.addEventListener('languagechange', function () {
    document.querySelectorAll('[data-placeholder-index]').forEach(function (span) {
      span.textContent = placeholderLabel(Number(span.getAttribute('data-placeholder-index')));
    });
  });

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

      var i18n = window.i18n;
      var tr = function (key) { return i18n ? i18n.t(key) : key; };

      if (!endpointConfigured) {
        // Formspree not set up yet: build a mailto with the entered details so the
        // enquiry still reaches sponsors@hcathena.nl.
        evt.preventDefault();
        var data = new FormData(form);
        var body =
          tr('form.mailtoName') + ': ' + (data.get('naam') || '') + '\n' +
          tr('form.mailtoCompany') + ': ' + (data.get('bedrijf') || '') + '\n' +
          tr('form.mailtoEmail') + ': ' + (data.get('email') || '') + '\n' +
          tr('form.mailtoPhone') + ': ' + (data.get('telefoon') || '') + '\n' +
          tr('form.mailtoInterest') + ': ' + (data.get('pakket') || '') + '\n\n' +
          (data.get('bericht') || '');
        var mailto = 'mailto:sponsors@hcathena.nl' +
          '?subject=' + encodeURIComponent('Sponsoraanvraag Vrienden van AthenA') +
          '&body=' + encodeURIComponent(body);
        window.location.href = mailto;
        setStatus(tr('form.successMailto'), 'is-success');
        return;
      }

      evt.preventDefault();
      setStatus(tr('form.sending'), '');
      fetch(actionUrl, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      }).then(function (res) {
        if (res.ok) {
          form.reset();
          setStatus(tr('form.successFormspree'), 'is-success');
        } else {
          throw new Error('submit-failed');
        }
      }).catch(function () {
        setStatus(tr('form.error'), 'is-error');
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
