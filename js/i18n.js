/*
  Minimal client-side i18n. No build step: walks [data-i18n] / [data-i18n-html] /
  [data-i18n-attr] elements and swaps text per the active language. Dutch is the
  default and the language the static HTML is authored in; English is a full
  translation layered on top. Preference persists via localStorage.

  Exposes window.i18n = { lang, t(key), setLang(lang) } for other scripts
  (main.js) to translate JS-generated content and react to language switches
  via a "languagechange" event on document.
*/
(function () {
  var STORAGE_KEY = 'vva-lang';
  var DEFAULT_LANG = 'nl';

  var dict = {
    nl: {
      'meta.title': 'Vrienden van AthenA — Sponsornetwerk van Hockeyclub AthenA',
      'meta.description': 'Word vriend of sponsor van Hockeyclub AthenA. Samen investeren we in goede jeugdtrainers en de toekomst van een van de snelst groeiende hockeyclubs van Nederland.',
      'meta.ogDescription': 'Samen investeren we in de toekomst van Hockeyclub AthenA.',

      'a11y.skipLink': 'Ga naar inhoud',
      'a11y.mainNav': 'Hoofdnavigatie',
      'a11y.menuOpen': 'Menu openen',
      'a11y.crestLabel': 'AthenA logo',
      'a11y.scrollCue': 'Scroll naar de volgende sectie',
      'a11y.footerNav': 'Footer navigatie',

      'nav.over': 'Over ons',
      'nav.cijfers': 'In cijfers',
      'nav.pakketten': 'Sponsorpakketten',
      'nav.beeld': 'In beeld',
      'nav.sponsorkit': 'Sponsorkit',
      'nav.cta': 'Word vriend',

      'hero.title': 'Vrienden maken<br>het verschil.',
      'hero.sub': 'Samen investeren we in de toekomst van Hockeyclub AthenA — op en naast het veld.',
      'hero.ctaPrimary': 'Word vriend van AthenA',
      'hero.ctaSecondary': 'Ontdek waarom',

      'about.eyebrow': 'Waarom AthenA',
      'about.heading': 'Een jonge club met grote ambities',
      'about.paragraph1': 'AthenA is, zoals je waarschijnlijk al weet, in 2004 opgericht en in korte tijd uitgegroeid tot de achtste hockeyclub van Nederland qua ledenaantal. Met zowel Dames 1 als Heren 1 in de Overgangsklasse is dat een resultaat waar we als jonge club trots op mogen zijn. Tegelijkertijd zien we nog volop potentieel voor verdere groei en ontwikkeling. Een belangrijk speerpunt daarbij is het aantrekken en behouden van goede (jeugd)trainers. Om hierin structureel te kunnen investeren, is de steun van betrokken sponsoren onmisbaar.',
      'about.paragraph2': 'Als vriend van AthenA maak je deel uit van een ondernemend netwerk. Minstens één keer per jaar ontmoet je elkaar tijdens de inspirerende en gezellige <em>“Vrienden van AthenA”-avond</em>, met een interessante spreker en volop gelegenheid om te netwerken. Ook door het jaar heen weten vrienden en Atheners elkaar te vinden, langs de velden, bij activiteiten en daarbuiten.',
      'about.lead': 'Samen bouwen we aan de toekomst van onze club.',

      'stats.founded': 'Opgericht',
      'stats.rankNumber': '8<sup>e</sup>',
      'stats.rankLabel': 'Grootste hockeyclub van Nederland',
      'stats.flagship': 'Vlaggenschepen in de Overgangsklasse',
      'stats.driven': 'Gedreven door vrijwilligers & sponsoren',

      'tiers.eyebrow': 'Sponsorpakketten',
      'tiers.heading': 'Kies hoe jij AthenA verder helpt',
      'tiers.intro': 'Elk pakket is een investering in de sportieve en persoonlijke ontwikkeling van onze leden — van de jongste jeugd tot Dames 1 en Heren 1. Onderstaande indeling is een startpunt; we denken graag mee over maatwerk.',
      'tiers.badge': 'Meeste impact',
      'tiers.price': 'Op aanvraag',
      'tiers.cta': 'Meer weten',
      'tiers.main.name': 'Hoofdsponsor',
      'tiers.main.b1': 'Logo op tenue & velddoek',
      'tiers.main.b2': 'Prominente vermelding op website en bij evenementen',
      'tiers.main.b3': 'Uitnodiging Vrienden-avond voor meerdere personen',
      'tiers.main.b4': 'Persoonlijk relatiebeheer',
      'tiers.gold.name': 'Goud',
      'tiers.gold.b1': 'Logo op sponsorbord en website',
      'tiers.gold.b2': 'Uitnodiging Vrienden-avond (2 personen)',
      'tiers.gold.b3': 'Vermelding in de nieuwsbrief',
      'tiers.silver.name': 'Zilver',
      'tiers.silver.b1': 'Logo op de website',
      'tiers.silver.b2': 'Uitnodiging Vrienden-avond (1 persoon)',
      'tiers.silver.b3': 'Vermelding in de nieuwsbrief',
      'tiers.bronze.name': 'Brons & Vriend',
      'tiers.bronze.b1': 'Naamsvermelding op de Vriendenmuur',
      'tiers.bronze.b2': 'Uitnodiging Vrienden-avond',
      'tiers.bronze.b3': 'Je steunt direct de jeugdtrainers',

      'gallery.eyebrow': 'De club in beeld',
      'gallery.heading': 'AthenA op en naast het veld',
      'gallery.intro': 'Een impressie van wedstrijddagen, jeugdopleiding en clubgevoel.',
      'gallery.credit': 'Fotografie: Robert Janssen Fotografie',
      'gallery.placeholder.0': 'Jeugdopleiding',
      'gallery.placeholder.1': 'Teamspirit',
      'gallery.placeholder.2': 'Overgangsklasse',
      'gallery.placeholder.3': 'Community',
      'gallery.placeholder.4': 'Vrijwilligers',
      'gallery.placeholder.5': 'Wedstrijddag',
      'gallery.placeholder.6': 'Trainersteam',
      'gallery.placeholder.7': 'Clubgevoel',

      'contact.eyebrow': 'Word vriend',
      'contact.heading': 'Praat met ons over sponsoring',
      'contact.intro': 'Laat hieronder je gegevens achter en we nemen persoonlijk contact met je op.',
      'contact.direct': 'Direct contact',
      'contact.responseTime': 'We reageren doorgaans binnen enkele werkdagen.',
      'contact.follow': 'Volg AthenA',

      'form.name': 'Naam',
      'form.company': 'Bedrijf',
      'form.optional': '(optioneel)',
      'form.email': 'E-mail',
      'form.phone': 'Telefoon',
      'form.interest': 'Interesse',
      'form.optGeneral': 'Algemene vraag',
      'form.message': 'Bericht',
      'form.submit': 'Verstuur aanvraag',
      'form.fallback': 'Liever direct mailen? <a href="mailto:sponsors@hcathena.nl?subject=Sponsoraanvraag%20Vrienden%20van%20AthenA">sponsors@hcathena.nl</a>',
      'form.sending': 'Versturen…',
      'form.successFormspree': 'Bedankt! We nemen zo snel mogelijk contact met je op.',
      'form.successMailto': 'We openen je e-mailprogramma zodat je de aanvraag direct kunt versturen.',
      'form.error': 'Versturen is niet gelukt. Mail ons gerust direct via sponsors@hcathena.nl.',
      'form.mailtoName': 'Naam',
      'form.mailtoCompany': 'Bedrijf',
      'form.mailtoEmail': 'E-mail',
      'form.mailtoPhone': 'Telefoon',
      'form.mailtoInterest': 'Interesse',

      'social.x': 'AthenA op X (Twitter)',
      'social.facebook': 'AthenA op Facebook',
      'social.linkedin': 'AthenA op LinkedIn',
      'social.instagram': 'AthenA op Instagram',

      'kit.eyebrow': 'Sponsorkit',
      'kit.heading': 'Deel AthenA verder',
      'kit.intro': 'Print de QR-code op flyers, banners of in het clubhuis — een scan brengt iedereen direct naar deze pagina.',
      'kit.downloadSvg': 'Download QR (SVG)',
      'kit.downloadPng': 'Download QR (PNG)',
      'kit.printSheet': 'Print-vel openen',
      'kit.qrCaption': 'Scan om vriendenvanathena.nl te openen',

      'footer.tagline': 'Vrienden van AthenA — hét sponsornetwerk van Hockeyclub AthenA.',
      'footer.contact': 'Contact',
      'footer.copyrightPre': '© ',
      'footer.copyrightPost': ' Vrienden van AthenA. Onderdeel van Hockeyclub AthenA.',
      'footer.videoCredit': 'Herovideo: \u00a9 Xavier Car\u00e9 / Wikimedia Commons / CC BY-SA 3.0 (bewerkt)',

      'print.title': 'Print QR — Vrienden van AthenA',
      'print.hint': 'Scan de code met je telefooncamera om de Vrienden-pagina van Hockeyclub AthenA te openen.',
      'print.button': 'Print dit vel',
      'print.back': '← Terug naar de website',

      'notfound.title': 'Pagina niet gevonden — Vrienden van AthenA',
      'notfound.heading': 'Pagina niet gevonden',
      'notfound.body': 'Deze pagina bestaat niet (meer). Ga terug naar de homepage van Vrienden van AthenA.',
      'notfound.cta': 'Naar de homepage'
    },

    en: {
      'meta.title': 'Vrienden van AthenA — Sponsor Network of Hockeyclub AthenA',
      'meta.description': 'Become a friend or sponsor of Hockeyclub AthenA. Together we invest in good (youth) coaches and the future of one of the fastest-growing hockey clubs in the Netherlands.',
      'meta.ogDescription': 'Together we invest in the future of Hockeyclub AthenA.',

      'a11y.skipLink': 'Skip to content',
      'a11y.mainNav': 'Main navigation',
      'a11y.menuOpen': 'Open menu',
      'a11y.crestLabel': 'AthenA logo',
      'a11y.scrollCue': 'Scroll to the next section',
      'a11y.footerNav': 'Footer navigation',

      'nav.over': 'About us',
      'nav.cijfers': 'In numbers',
      'nav.pakketten': 'Sponsor packages',
      'nav.beeld': 'Gallery',
      'nav.sponsorkit': 'Sponsor kit',
      'nav.cta': 'Become a friend',

      'hero.title': 'Friends make<br>the difference.',
      'hero.sub': 'Together we invest in the future of Hockeyclub AthenA — on and off the pitch.',
      'hero.ctaPrimary': 'Become a friend of AthenA',
      'hero.ctaSecondary': 'Discover why',

      'about.eyebrow': 'Why AthenA',
      'about.heading': 'A young club with big ambitions',
      'about.paragraph1': 'As you probably already know, AthenA was founded in 2004 and quickly grew into the eighth-largest hockey club in the Netherlands by membership. With both Ladies 1 and Men 1 in the Overgangsklasse, that’s a result we’re proud of as a young club. At the same time, we still see plenty of potential for further growth and development. A key focus area is attracting and retaining good (youth) coaches. To invest in this structurally, the support of committed sponsors is essential.',
      'about.paragraph2': 'As a friend of AthenA, you’re part of an entrepreneurial network. At least once a year you meet during the inspiring and sociable <em>“Friends of AthenA” evening</em>, with an interesting speaker and plenty of opportunity to network. Throughout the year, friends and Athenians also find each other pitch-side, at events and beyond.',
      'about.lead': 'Together we’re building the future of our club.',

      'stats.founded': 'Founded',
      'stats.rankNumber': '8<sup>th</sup>',
      'stats.rankLabel': 'Largest hockey club in the Netherlands',
      'stats.flagship': 'Flagship teams in the Overgangsklasse',
      'stats.driven': 'Driven by volunteers & sponsors',

      'tiers.eyebrow': 'Sponsor packages',
      'tiers.heading': 'Choose how you help AthenA grow',
      'tiers.intro': 'Every package is an investment in the sporting and personal development of our members — from the youngest youth teams to Ladies 1 and Men 1. The packages below are a starting point; we’re happy to think along on custom options.',
      'tiers.badge': 'Biggest impact',
      'tiers.price': 'On request',
      'tiers.cta': 'Learn more',
      'tiers.main.name': 'Main sponsor',
      'tiers.main.b1': 'Logo on kit & field cover',
      'tiers.main.b2': 'Prominent mention on the website and at events',
      'tiers.main.b3': 'Invitation to the Friends evening for multiple guests',
      'tiers.main.b4': 'Personal relationship management',
      'tiers.gold.name': 'Gold',
      'tiers.gold.b1': 'Logo on sponsor board and website',
      'tiers.gold.b2': 'Invitation to the Friends evening (2 guests)',
      'tiers.gold.b3': 'Mention in the newsletter',
      'tiers.silver.name': 'Silver',
      'tiers.silver.b1': 'Logo on the website',
      'tiers.silver.b2': 'Invitation to the Friends evening (1 guest)',
      'tiers.silver.b3': 'Mention in the newsletter',
      'tiers.bronze.name': 'Bronze & Friend',
      'tiers.bronze.b1': 'Name on the Friends wall',
      'tiers.bronze.b2': 'Invitation to the Friends evening',
      'tiers.bronze.b3': 'You directly support the youth coaches',

      'gallery.eyebrow': 'The club in pictures',
      'gallery.heading': 'AthenA on and off the pitch',
      'gallery.intro': 'A glimpse of match days, youth development and club spirit.',
      'gallery.credit': 'Photography: Robert Janssen Fotografie',
      'gallery.placeholder.0': 'Youth academy',
      'gallery.placeholder.1': 'Team spirit',
      'gallery.placeholder.2': 'Overgangsklasse',
      'gallery.placeholder.3': 'Community',
      'gallery.placeholder.4': 'Volunteers',
      'gallery.placeholder.5': 'Match day',
      'gallery.placeholder.6': 'Coaching staff',
      'gallery.placeholder.7': 'Club spirit',

      'contact.eyebrow': 'Become a friend',
      'contact.heading': 'Talk to us about sponsoring',
      'contact.intro': 'Leave your details below and we’ll get in touch personally.',
      'contact.direct': 'Direct contact',
      'contact.responseTime': 'We usually respond within a few business days.',
      'contact.follow': 'Follow AthenA',

      'form.name': 'Name',
      'form.company': 'Company',
      'form.optional': '(optional)',
      'form.email': 'Email',
      'form.phone': 'Phone',
      'form.interest': 'Interest',
      'form.optGeneral': 'General enquiry',
      'form.message': 'Message',
      'form.submit': 'Send request',
      'form.fallback': 'Prefer to email directly? <a href="mailto:sponsors@hcathena.nl?subject=Sponsorship%20enquiry%20Vrienden%20van%20AthenA">sponsors@hcathena.nl</a>',
      'form.sending': 'Sending…',
      'form.successFormspree': 'Thanks! We’ll get back to you as soon as possible.',
      'form.successMailto': 'We’re opening your email app so you can send the request directly.',
      'form.error': 'Sending failed. Feel free to email us directly at sponsors@hcathena.nl.',
      'form.mailtoName': 'Name',
      'form.mailtoCompany': 'Company',
      'form.mailtoEmail': 'Email',
      'form.mailtoPhone': 'Phone',
      'form.mailtoInterest': 'Interest',

      'social.x': 'AthenA on X (Twitter)',
      'social.facebook': 'AthenA on Facebook',
      'social.linkedin': 'AthenA on LinkedIn',
      'social.instagram': 'AthenA on Instagram',

      'kit.eyebrow': 'Sponsor kit',
      'kit.heading': 'Help spread the word about AthenA',
      'kit.intro': 'Print the QR code on flyers, banners or in the clubhouse — a scan takes anyone straight to this page.',
      'kit.downloadSvg': 'Download QR (SVG)',
      'kit.downloadPng': 'Download QR (PNG)',
      'kit.printSheet': 'Open print sheet',
      'kit.qrCaption': 'Scan to open vriendenvanathena.nl',

      'footer.tagline': 'Vrienden van AthenA — the sponsor network of Hockeyclub AthenA.',
      'footer.contact': 'Contact',
      'footer.copyrightPre': '© ',
      'footer.copyrightPost': ' Vrienden van AthenA. Part of Hockeyclub AthenA.',
      'footer.videoCredit': 'Hero video: \u00a9 Xavier Car\u00e9 / Wikimedia Commons / CC BY-SA 3.0 (edited)',

      'print.title': 'Print QR — Vrienden van AthenA',
      'print.hint': 'Scan the code with your phone camera to open the Friends page of Hockeyclub AthenA.',
      'print.button': 'Print this sheet',
      'print.back': '← Back to the website',

      'notfound.title': 'Page not found — Vrienden van AthenA',
      'notfound.heading': 'Page not found',
      'notfound.body': 'This page no longer exists. Go back to the Vrienden van AthenA homepage.',
      'notfound.cta': 'Go to homepage'
    }
  };

  function getStoredLang() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      return (v === 'en' || v === 'nl') ? v : null;
    } catch (e) { return null; }
  }

  function storeLang(lang) {
    try { window.localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
  }

  function t(key, lang) {
    var table = dict[lang || currentLang] || dict[DEFAULT_LANG];
    return (table && table[key] != null) ? table[key] : (dict[DEFAULT_LANG][key] || key);
  }

  function applyTranslations(lang) {
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      el.textContent = t(key, lang);
    });

    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      el.innerHTML = t(key, lang);
    });

    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      var spec = el.getAttribute('data-i18n-attr');
      spec.split(',').forEach(function (pair) {
        var parts = pair.split(':');
        var attr = parts[0];
        var key = parts[1];
        if (attr && key) el.setAttribute(attr, t(key, lang));
      });
    });

    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      var isActive = btn.getAttribute('data-lang') === lang;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  var currentLang = getStoredLang() || DEFAULT_LANG;

  function setLang(lang) {
    if (lang !== 'nl' && lang !== 'en') return;
    currentLang = lang;
    storeLang(lang);
    applyTranslations(lang);
    document.dispatchEvent(new CustomEvent('languagechange', { detail: { lang: lang } }));
  }

  window.i18n = {
    get lang() { return currentLang; },
    t: function (key) { return t(key, currentLang); },
    setLang: setLang
  };

  applyTranslations(currentLang);

  document.addEventListener('click', function (evt) {
    var btn = evt.target.closest ? evt.target.closest('.lang-btn') : null;
    if (!btn) return;
    var lang = btn.getAttribute('data-lang');
    if (lang) setLang(lang);
  });
})();
