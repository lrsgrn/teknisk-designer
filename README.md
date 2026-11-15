# Ansøgningsside: teknisk designer, Vejdirektoratet

Min ansøgningsside til stillingen som teknisk designer i Vejdirektoratet, november 2026. Siden indeholder en prototype, der kontrollerer en vejtegning (DXF) og screener et kryds for modulvogntog.

Prototypen er udviklet af mig med AI (Claude). Den er ikke et færdigt produkt, den erstatter ikke AutoTURN eller faglig vurdering, og den er ikke godkendt af Vejdirektoratet.

Statisk side (HTML, CSS, JS). Ingen server, ingen API-nøgler. Åbn `index.html` direkte, eller læg mappen på GitHub Pages.

## Indhold

| Fil | Hvad |
| --- | --- |
| `index.html`, `css/style.css` | Siden |
| `js/demo/dxf.js` | DXF-læser og DXF-skriver |
| `js/demo/example.js` | Det indbyggede, opdigtede kryds (med otte bevidste afvigelser) |
| `js/demo/rules.js` | Tegningskontrol: regler R1–R8 og lagliste |
| `js/demo/mvt.js` | Screening: køretøjer, sporkurve, rasteranalyse, regler S1–S4 og forslag til tilpasning |
| `js/demo/notat.js` | Skabelon til screeningsnotat (HTML og PDF via udskrift) |
| `js/demo/ui.js` | Brugerflade til demoen |
| `src/hero.js` → `js/hero.bundle.js` | 3D-forsiden (three.js) |
| `cv.html` → `assets/CV_LarsHaugenGrenaker.pdf` | CV |

## Sådan virker demoen

1. **Tegning.** En DXF læses i browseren. Filen sendes ingen steder hen.
2. **Kontrol.** Otte regler tjekker blandt andet lag, attributter, dubletter og tegningshoved.
3. **Screening.** Et køretøj køres gennem krydset med en kinematisk lavhastighedsmodel. Arealbehovet rasteres og sammenlignes med tegningens arealer.
4. **Notat.** Resultatet samles i et udkast til screeningsnotat. "Foreslå tilpasning" viser krydset før og efter en udvidelse af kørebanen.

## Forudsætninger, der skal kendes

- Køretøjernes mål i `mvt.js` (`VEHICLES`) er antagelser, ikke Vejdirektoratets typekøretøjer.
- Laglisten i `rules.js` (`LAYERS`) er demoens egen, ikke DDA-lagstrukturen. Reglerne er inspireret af Vejdirektoratets Modelstandard og Tegningsstandard.
- Screeningen regner med køremåde A, 15 km/t og 0,3 m arealtillæg. Værdierne skal efterprøves mod gældende vejregler, før et resultat bruges.
- Sporkurven har ingen dækudskridning, ingen styrevinkelbegrænsning og ingen styrende bagaksler.
- Forslaget til tilpasning følger arealbehovet fra modellen. Det er ikke en projekteret geometri.

## Byg igen

Forsiden (kræver esbuild og three):

```
esbuild src/hero.js --bundle --minify --format=iife --target=es2019 --outfile=js/hero.bundle.js
```

CV som PDF (Chrome, mens siden kører på en lokal server):

```
chrome --headless=new --no-pdf-header-footer --print-to-pdf=assets/CV_LarsHaugenGrenaker.pdf http://localhost:8123/cv.html
```
