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

2. **Foto's toevoegen.** Zet foto's in `assets/photos/`, genaamd `1.jpg`, `2.jpg`, … `19.jpg`. Zodra er minimaal 1 foto staat, verschijnt automatisch de fotocredit "Robert Janssen Fotografie" onder de fotogalerij. Geen foto's? Dan toont de site nette gekleurde tegels in plaats van kapotte afbeeldingen — niets breekt.

3. **Sponsorpakketten controleren.** In `index.html`, sectie `#pakketten` (zoek naar `CLIENT: pas pakketnamen`), staan 4 voorgestelde pakketten (Hoofdsponsor / Goud / Zilver / Brons). Namen, prijzen ("Op aanvraag") en voordelen zijn een startpunt — pas aan naar wens.

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
js/hero.js            Hero-animatie (canvas deeltjes + crest-reveal)
js/main.js             Navigatie, formulier, fotogalerij, QR-render
js/qrcode.min.js       Vendored QR-library (qrcodejs, MIT-licentie)
assets/img/            Logo's en banner (officiële clubassets)
assets/photos/         Hier komen de wedstrijdfoto's (zie punt 2 hierboven)
assets/downloads/       Kant-en-klare QR-bestanden (SVG + PNG) voor drukwerk
assets/favicon/         Favicons, gegenereerd uit het clublogo
```

## Lokaal bekijken

Geen build-stap nodig. Serveer de map met een simpele lokale server, bijvoorbeeld:

```bash
python3 -m http.server 8000
```

en open `http://localhost:8000`.

## Deployen

De site staat al op GitHub Pages via de `main`-branch (root). Wijzigingen op `main` worden automatisch gepubliceerd — commit en push, en de live site update binnen enkele minuten.
