---
project: ileafyou
title: Level-Name überdeckt die Serien-Flamme nicht mehr
visible_to_client: true
minutes: 15
---
- Lange Level-Namen wie «Pflanzenflüsterer» brechen auf der Startseite jetzt mit Trennstrich um, statt unter die Flamme der Serie zu laufen.
- Die Level-Karte wirkt auf schmalen Handys wieder aufgeräumt.
- In einer Handybreite (412 px) im Browser geprüft.

## Intern
Weiche Trennstellen in `lv` (de) in `js/i18n.js`, `.lvl .ln` mit `overflow-wrap:anywhere` als Rückfall. Commit f03e63a.
