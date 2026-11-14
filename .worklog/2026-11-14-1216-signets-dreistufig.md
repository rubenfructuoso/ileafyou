---
project: ileafyou
title: Signets: Licht und Wasser als Skala in drei Stufen
visible_to_client: true
minutes: 15
---
- Licht und Wasser zeigen jetzt eine einfache Skala: drei Pixel-Sonnen bzw. drei Pixel-Tropfen, je nach Bedarf ein, zwei oder drei farbig, der Rest grau.
- So lässt sich auf einen Blick vergleichen, welche Pflanze mehr Licht oder Wasser braucht.
- Im Browser hell und dunkel in allen drei Ansichten getestet.

## Intern
js/app.js `meter()`, `LIGHT_LV` (shade/partial 1, bright 2, sun 3), `WATER_LV` (dry 1, moderate/orchid 2, moist 3).
