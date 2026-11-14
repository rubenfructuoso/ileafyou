---
project: ileafyou
title: Pflanzenliste: Signets für drinnen/draussen, Licht und Wasser
visible_to_client: true
minutes: 30
---
- Jede Pflanze zeigt in allen Ansichten drei kleine Pixel-Signets: Haus (nur drinnen), Haus mit Sonne (im Sommer draussen), Baum (kann draussen bleiben).
- Dazu Licht (volle Sonne, hell, Halbschatten, wenig Licht) und Wasser (Tropfen wenig, halb oder ganz gefüllt).
- Die gleichen Signets stehen in der Detailansicht bei den Pflegetipps; mit der Maus oder Vorlesefunktion erscheint die Bedeutung als Text.
- Im Browser hell und dunkel mit dem Beispielgarten getestet.

## Intern
js/app.js `SIGN`, `placeOf()`, `signsHtml()`, `careRule()` aus `careHtml()` herausgelöst; i18n `sg_*`, `sl_*`, `sw_*`.
