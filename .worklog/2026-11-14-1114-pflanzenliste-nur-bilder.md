---
project: ileafyou
title: Pflanzenliste: dritte Ansicht „Nur Bilder“, Umschalter mit Symbolen
visible_to_client: true
minutes: 15
---
- Neue Ansicht „Nur Bilder“: dichtes Raster ohne Text, ideal für viele Pflanzen; ein roter Rahmen zeigt, wo Giessen fällig ist.
- Der Umschalter zeigt drei kleine Pixel-Symbole (Kacheln, Liste, Nur Bilder) statt Wörtern und braucht so weniger Platz.
- Im Browser mit Beispielgarten getestet.

## Intern
js/app.js `VIEWS`, `VIEW_ICON`, `viewSvg()`, `.pics`/`.pic`; i18n `v_pics`, `v_grid` jetzt „Kacheln“.
