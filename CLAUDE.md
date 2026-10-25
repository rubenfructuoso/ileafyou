# CLAUDE.md – i leaf you

Kontext für Claude Code. Erst lesen, dann arbeiten.

## Worum es geht

„i leaf you“ ist eine Pflanzenpflege-App von Rubén Fructuoso, als PWA für iPhone und Android. Der Name spielt mit „I love you“ und „I leave you“. Die App gibt es auf Deutsch, Englisch, Spanisch und Französisch. Früherer Arbeitstitel: Blattwerk. Kernidee: Pflege wird zum Spiel. Wer pünktlich giesst, sammelt Punkte und steigt Levels auf, die Bildmarke (eine Topfpflanze) wächst dabei mit. Wer Pflanzen vernachlässigt, fällt zurück.

Die App bleibt grundsätzlich **kostenlos**. Eine KI-Erkennung als Abo ist eine spätere Option, nicht jetzt.

## Stack und Regeln

- **Vanilla HTML, CSS, JS.** Kein Framework, kein Build-Schritt, keine npm-Abhängigkeiten im Frontend. So bleibt das Projekt ohne Toolchain wartbar.
- **PHP ≥ 8.1** nur für `api/` (Proxy zu Externen). Kein Datenbankserver bisher.
- Daten liegen in `localStorage` unter dem Schlüssel `ileafyou.v1` (alte Daten unter `blattwerk.v1` werden beim Laden übernommen). Änderungen am Datenmodell brauchen eine Migration in `load()`, bestehende Daten dürfen nicht verloren gehen.
- Geheimnisse (API-Schlüssel) nie ins Frontend und nie ins Repo. Konfiguration: `ileafyou-config.php` über dem Webroot, Vorlage in `api/config.example.php`.
- `VERSION` in `sw.js` setzt der Deploy-Workflow automatisch auf den Commit-Hash. Neue Shell-Dateien in `SHELL` in `sw.js` eintragen.
- Deployment: Push auf `main` lädt per FTPS nach `/ileafyou.rekreativ.ch` (Hosttech `181.hosttech.eu`, Benutzer `rekreativ`, Secret `FTP_PASSWORD`), siehe `.github/workflows/deploy.yml`.
- **Direkt auf `main` arbeiten:** committen und `main` pushen, keine Branches und keine Pull Requests. Jeder Push geht sofort live.
- Kleine, gezielte Änderungen statt Komplett-Umbauten. Rubén bevorzugt iteratives Verfeinern.

## Sprachen und Texte

- **Vier Sprachen:** Deutsch, Englisch, Spanisch, Französisch. Alle Texte stehen in `js/i18n.js`, im Code nur über `tr('schlüssel', { variablen })`. Nie Text hart codieren. Neue Schlüssel immer in allen vier Sprachen ergänzen.
- Sprache: beim ersten Start aus der Browsersprache (Fallback Englisch), danach `state.lang`, umschaltbar unten in der App. Statische Texte im HTML über `data-i18n`, `data-i18n-ph`, `data-i18n-aria`.
- Datumsformate über `locale` je Sprache (de-CH, en-GB, es-ES, fr-CH).
- Deutsch in Schweizer Schreibweise: **ss statt ß**.
- Typografie je Sprache: ’ als Apostroph; Anführungszeichen „ “ (DE), “ ” (EN), « » (ES), « » mit geschütztem Leerzeichen (FR); im Französischen geschütztes Leerzeichen vor : ? !. Im Code bleiben ' und ".
- Vom Nutzer eingegebene Texte (Pflanzennamen, Orte, Notizen) werden nicht übersetzt.
- Ton: kurz, direkt, freundlich, nicht übererklärend. Buttons sagen, was passiert („Pflanze speichern“, nicht „Absenden“).
- Fehlermeldungen erklären, was los ist und was hilft. Keine Entschuldigungen.

## Corporate Design

**Schriften** (beide SIL Open Font License):
- *Gluten* für Logo, Titel, Pflanzennamen, Level-Namen
- *Atkinson Hyperlegible* für Text und Bedienung

**Farben** (Tokens in `css/app.css` unter `:root`, Dunkelmodus inklusive):

| Name | Hell | Rolle |
|---|---|---|
| Moos | `#2F5A35` | Hauptfarbe, Buttons, Fortschritt |
| Trieb | `#9BD25B` | Wachstum, Level-ups, Erfolge |
| Erde | `#3B2A20` | Schrift, ersetzt Schwarz |
| Kalk | `#F2F4EC` | Grund |
| Giesswasser | `#2F7CB0` | alles rund ums Giessen |
| Dünger | `#E0A43A` | alles rund ums Düngen, Herz im Logo |

**Spiel-Icons:** Abzeichen, Serie (Flamme) und „Tag geschafft“ (Medaille) sind 16×16-Pixel-Sprites im 16-Bit-Konsolenstil, definiert als Zeichenraster in `PIX` mit Palette `PIXPAL` in `app.js`, gerendert als SVG mit `crispEdges`. Eigene Motive, keine Figuren oder Gegenstände aus bestehenden Spielen. Neue Sprites im gleichen Raster und mit der gleichen Palette anlegen. Logo, Wachstumsstufen, Pflanzen-Symbole (`KINDS`, wählbar im Formular, wenn kein Foto da ist) und Spiel-Icons teilen Raster und Palette. Die App enthält keine Emojis mehr. Gluten bleibt für Titel, Atkinson Hyperlegible für Text.

**Logo:** Pixel-Topfpflanze (16×16) mit Herz am Topf („love“), daneben die Wortmarke „i leaf you“ klein in Gluten (glatt, nicht gepixelt). Die Pflanze existiert in 8 Wachstumsstufen (`PLANTS` in `app.js`, gerendert über `plantSvg(stage)`), eine pro Level; Stufe 8 ist das Logo.

## Datenmodell

```js
state = {
  plants: [{
    id, name, species, siteId,           // siteId verweist auf state.sites
    location,                            // Raum oder Platz, "Raum, Detail"; Raum = Teil vor dem Komma
    icon,                                // Pixel-Symbol, falls kein Foto: generic, monstera, herb, lemon, orchid, pothos, aloe, cactus
    waterEvery, feedEvery,               // Tage, 0 = keine Erinnerung
    notes, photo,                        // photo: JPEG als data-URL, max. 640 px
    created,                             // ISO-Datum
    log: [{ id, type, date, note, xp, bonus?, for?, days?, img? }]
  }],
  lang,                                  // 'de' | 'en' | 'es' | 'fr'
  sites: [{ id, name }],                 // Orte: Zuhause, Büro, Atelier …; mindestens einer
  site,                                  // aktiver Ort-Filter, null = alle Orte
  game: { xp, level, streak, best, lastCheck, dayDone, badges: [], vacation?: { until } }
}
```

Orte filtern „Heute dran“, „Nächste Tage“ und die Pflanzenliste. Punkte, Levels, Serie und der Bonus „Tag geschafft“ gelten über alle Orte gemeinsam. Bei „Alle Orte“ ist die Pflanzenliste nach Ort gruppiert. Ein Ort lässt sich nur löschen, wenn er leer ist. Alte Daten ohne `sites` migriert `migrateSites()` auf „Zuhause“.

Log-Typen: `water`, `feed`, `repot`, `note`, `photo` (mit `img`), `check` (Später/Erde feucht, mit `for` und `days`; der Text wird beim Anzeigen übersetzt, nicht gespeichert).

## Spielregeln

- Pünktlich giessen/düngen +10, verspätet +5, zu früh +2, ohne Rhythmus +3
- Umtopfen +5, Foto +3, Notiz +2, Erde geprüft +2
- Pro Pflanze und Typ nur einmal pro Tag Punkte
- Alle fälligen Aufgaben eines Tages erledigt: +15 Bonus („Tag geschafft“)
- `dailyCheck()` wertet vergangene Tage aus: pro überfälliger Aufgabe und Tag −5, Serie zurück auf 0. Im Ferienmodus keine Abzüge, Serie bleibt stehen.
- Levels ab 0, 50, 150, 300, 500, 800, 1200, 1800 Punkten. Namen je Sprache in `i18n.js` (`lv`), z. B. Samenkorn/Seed/Semilla/Graine bis Botanik-Legende/Botany legend/Leyenda botánica/Légende botanique
- 10 Abzeichen in `BADGES`, Texte in `i18n.js` (`b`), einmal freigeschaltet bleiben sie

## Stand

Fertig: vier Sprachen, Pflanzen erfassen und bearbeiten, Fälligkeiten, „Heute dran“, Wochenvorschau, Protokoll, Foto-Tagebuch, Später-Funktion, mehrere Orte mit Räume-Filter, Ferienmodus, Levels, Serie, Abzeichen, Beispielgarten, PWA (installierbar, offline, Button „App installieren“ mit Anleitung fürs iPhone), Erkennungs-Proxy.

Ungetestet: `api/identify.php` gegen die echte Pl@ntNet-API. Antwortformat vor dem ersten Einsatz mit einem echten Schlüssel prüfen.

## Nächste Schritte (Vorschläge, nicht beschlossen)

1. **Erinnerungen:** Web Push mit VAPID-Schlüsseln, Abos serverseitig speichern, Cron-Job prüft täglich Fälligkeiten. Auf dem iPhone nur, wenn die App installiert ist (ab iOS 16.4). Braucht Fälligkeiten auf dem Server, also Sync.
2. **Datensicherung:** Export und Import als JSON, damit beim Handywechsel nichts verloren geht.
3. **Schriften selbst hosten** statt Google Fonts (Datenschutz, nDSG).
4. **Speicher:** Fotos aus `localStorage` nach IndexedDB verschieben, sobald das Tagebuch wächst (localStorage ist auf ca. 5 MB begrenzt).
5. **Familie / mehrere Geräte:** Konten und Sync über PHP + MySQL.
6. **Eigene Illustrationen** für Abzeichen und Pflanzen-Platzhalter statt Emojis.

## Build-Varianten

`<body data-build="pwa">` auf dem eigenen Server: Erkennung und Service Worker aktiv. Der Claude-Prototyp nutzt `data-build="artifact"` und blendet beides aus.

## Offene Fragen

- Markenrecht: Vor dem öffentlichen Start prüfen, ob „i leaf you“ als Name und Domain frei ist.

- Soll die Erkennung auch Pflegewerte (Giessintervall) vorschlagen? Dafür bräuchte es eine zusätzliche Datenquelle.
