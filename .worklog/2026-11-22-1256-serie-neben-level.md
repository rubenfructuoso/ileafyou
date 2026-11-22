---
project: ileafyou
title: Serie steht neben dem Level, Level-Name bekommt Platz
visible_to_client: true
minutes: 15
---
- Die Serie (Flamme, Zahl, „Tage am Stück“) steht jetzt klein oben rechts neben „Level 6“, statt rechts eine eigene Spalte zu belegen.
- Der Level-Name hat dadurch die volle Breite. Er wird nicht mehr mitten im Wort zerhackt und trennt nur noch, wenn nötig, sauber („Pflanzen-flüsterer“).
- Auf Handybreite 360 und 412 px, auch mit grösserer Schrift, in allen vier Sprachen geprüft.

## Intern
`levelHtml` in `js/app.js`: Streak in `.lhead` in der Spalte. CSS `.lvl .col>.lhead`, `.streak` horizontal; `overflow-wrap:anywhere` wieder entfernt, `.lvl .lk{hyphens:none}`, damit die weichen Trennstellen nur im Namen wirken.
