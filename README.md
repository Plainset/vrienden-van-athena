# Vrienden van AthenA

Website voor het sponsornetwerk van Hockeyclub AthenA. Statische site, geen backend nodig — gebouwd om direct op GitHub Pages te draaien.

Live: `https://plainset.github.io/vrienden-van-athena/` (of `vriendenvanathena.nl` zodra het domein hierheen wijst, zie hieronder).

## Nog te doen door de club (belangrijk)

1. **Sponsorformulier activeren.** Het formulier op de site (`#contact`) verstuurt naar [Formspree](https://formspree.io):
   - Maak een gratis Formspree-account (of gebruik een bestaand account).
   - Maak een nieuw formulier aan met bestemmingsadres `sponsors@hcathena.nl`.
   - Formspree stuurt een bevestigingslink naar `sponsors@hcathena.nl` — die moet iemand met toegang tot dat postvak aanklikken. **Zonder die bevestiging komen aanvragen niet aan.**
   - Kopieer het endpoint dat Formspree geeft (iets als `https://formspree.io/f/abcd1234`) en plak dat in `index.html`, in het `<form ... action="...">` attribuut (zoek naar `REPLACE_WITH_FORMSPREE_ENDPOINT`).
   - Zolang dit niet is ingesteld, opent de "Verstuur aanvraag"-knop automatisch een e-mail naar `sponsors@hcathena.nl` met de ingevulde gegevens — de site blijft dus altijd bruikbaar, ook vóór deze stap.
   - Gratis Formspree-tier: 50 inzendingen/maand, ruim voldoende voor een sponsorformulier.

2. **Foto's.** ✅ Gedaan — 19 wedstrijdfoto's staan in `assets/photos/` (`1.jpg` t/m `19.jpg`), fotocredit "Robert Janssen Fotografie" staat eronder. Wil je foto's vervangen of toevoegen: zelfde bestandsnaam-conventie aanhouden. Zonder foto's in die map toont de site automatisch nette gekleurde tegels in plaats van kapotte afbeeldingen — niets breekt.

3. **Sponsoropties controleren.** In `index.html`, sectie `#pakketten`, staan de vijf opties uit de AthenA Sponsorkit 2025-2026 (Hoofdsponsor, Partnersponsor, Buurtsponsor, Maatwerk, Tenuesponsor) met de bijbehorende prijzen en voordelen. Namen, prijzen en teksten staan in `js/i18n.js` (sleutels `tiers.*`, zowel NL als EN) — werk deze bij zodra de sponsorkit wijzigt. Alle bedragen zijn excl. btw. Voeg je een optie toe/verwijder je er een? Pas ook de keuzelijst in het contactformulier aan (`<select id="fldPakket">`).

4. **Social media links.** In `index.html` staan placeholder-links (`href="#"`) bij de social iconen in de contactsectie en de footer (zoek naar `CLIENT: vul de juiste social links in`). Vul de echte X/Facebook/LinkedIn/Instagram-URLs in.

5. **Domein koppelen (optioneel maar aanbevolen).** De QR-code en de tekst op de site verwijzen naar `vriendenvanathena.nl`. Om dat domein daadwerkelijk naar deze nieuwe site te laten wijzen:
   - Voeg een bestand `CNAME` toe aan de root met daarin exact: `vriendenvanathena.nl`
   - Stel bij de DNS-provider van het domein een `A`/`ALIAS`-record in naar GitHub Pages en een `www` CNAME naar `plainset.github.io`.
   - Zet het custom domain in de GitHub repo-instellingen onder Settings → Pages.
   - Tot die tijd werkt de site prima op de `github.io`-URL, alleen wijst de QR-code dan nog naar het oude/huidige `vriendenvanathena.nl`.

## Structuur

```
index.html          De volledige site (one-pager, secties via ankers)
qr.html              Losse, printvriendelijke pagina met alleen de QR-code
404.html             GitHub Pages foutpagina
css/styles.css        Alle styling + design tokens (kleuren, typografie)
css/print.css         Printstijlen voor qr.html
js/hero.js            Twee zelfspelende hockey-animaties. (1) Home-hero (#home): één grote hockeybal stuitert over het scherm en de sequentie eindigt in het clublogo met confetti boven de fotoachtergrond — speelt bij het laden en opnieuw bij terugscrollen naar boven. (2) Speelwijze-band (#speelwijze, lager op de pagina): een tactiekbord dat zichzelf tekent (veldlijnen, spelers, aanvalspijlen) en de bal het doel in stuurt — speelt zodra de band in beeld scrollt. Beide draaien via dezelfde tijd-gestuurde 'scene'-speler; zonder JS of met 'verminderde beweging' toont de site de rustige eindversie en blijft de speelwijze-band verborgen
js/i18n.js             NL/EN vertaalsysteem (NL is standaard); onthoudt de taalkeuze van de bezoeker
js/main.js             Navigatie, formulier, fotogalerij, QR-render
js/qrcode.min.js       Vendored QR-library (qrcodejs, MIT-licentie)
assets/img/            Logo's, banner (plus de hockeystick-foto en het POV-avondveld van een eerdere hero-versie, niet meer in gebruik)
assets/photos/         19 wedstrijdfoto's (Robert Janssen Fotografie), genaamd 1.jpg t/m 19.jpg
assets/downloads/       Kant-en-klare QR-bestanden (SVG + PNG) voor drukwerk
assets/favicon/         Favicons, gegenereerd uit het clublogo
```

## Taal (NL/EN)

De site heeft een taalschakelaar rechtsboven in de header (NL/EN). Nederlands is en blijft de standaardtaal voor nieuwe bezoekers; de taalkeuze van een bezoeker wordt onthouden (localStorage) voor een volgend bezoek. Alle teksten — inclusief door JavaScript gegenereerde inhoud zoals formulierberichten en de fotogalerij-tegels — komen uit `js/i18n.js`. Nieuwe tekst toevoegen? Zet een `data-i18n="jouw.sleutel"` (of `data-i18n-html` voor tekst met opmaak) op het element in de HTML en vul de Nederlandse + Engelse waarde aan in `js/i18n.js`.

## Lokaal bekijken

Geen build-stap nodig. Serveer de map met een simpele lokale server, bijvoorbeeld:

```bash
python3 -m http.server 8000
```

en open `http://localhost:8000`.

## Deployen

De site staat al op GitHub Pages via de `main`-branch (root). Wijzigingen op `main` worden automatisch gepubliceerd — commit en push, en de live site update binnen enkele minuten.
