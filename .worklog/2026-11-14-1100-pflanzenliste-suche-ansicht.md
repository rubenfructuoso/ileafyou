---
project: ileafyou
title: Pflanzenliste: Suche und Ansicht Bilder oder Liste
visible_to_client: true
minutes: 30
---
- Unter „Deine Pflanzen“ lässt sich zwischen grossen Bildern und einer kompakten Liste mit kleinem Bild umschalten.
- Die App merkt sich die gewählte Ansicht auf dem Gerät.
- Neues Suchfeld filtert die Pflanzen beim Tippen nach Name, Art, Raum oder Ort.
- Im Browser mit Beispielgarten getestet (Umschalten, Neuladen, Suche).

## Intern
js/app.js `plantListHtml()`, `plantView()`, localStorage `ileafyou.view`; CSS `.ptools`, `.plist`, `.prow`; i18n `search_ph`, `search_none`, `v_grid`, `v_list`.
