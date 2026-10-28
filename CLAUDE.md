# CLAUDE.md – i leaf you

Kontext für Claude Code. Erst lesen, dann arbeiten.

## Worum es geht

„i leaf you“ ist eine Pflanzenpflege-App von Rubén Fructuoso, als PWA für iPhone und Android. Der Name spielt mit „I love you“ und „I leave you“. Die App gibt es auf Deutsch, Englisch, Spanisch und Französisch. Früherer Arbeitstitel: Blattwerk. Kernidee: Pflege wird zum Spiel. Wer pünktlich giesst, sammelt Punkte und steigt Levels auf, die Bildmarke (eine Topfpflanze) wächst dabei mit. Wer Pflanzen vernachlässigt, fällt zurück.

Die App bleibt grundsätzlich **kostenlos**. Eine KI-Erkennung als Abo ist eine spätere Option, nicht jetzt.

## Stack und Regeln

- **Vanilla HTML, CSS, JS.** Kein Framework, kein Build-Schritt, keine npm-Abhängigkeiten im Frontend. So bleibt das Projekt ohne Toolchain wartbar.
- **PHP ≥ 8.1** nur für `api/`: Erkennungs-Proxy, Konten, Sync. MariaDB bei Hosttech (Tabellen mit Präfix `ileafyou_`, legt `api/lib.php` selbst an); lokal SQLite über `db_dsn`.
- Daten liegen in IndexedDB (Datenbank `ileafyou`, Store `kv`, Schlüssel `ileafyou.v1`) als JSON-String, ohne das 5-MB-Limit von localStorage. Alte Daten aus `localStorage` (`ileafyou.v1`, `blattwerk.v1`) übernimmt `load()` beim ersten Start; ohne IndexedDB bleibt localStorage als Rückfall. Änderungen am Datenmodell brauchen eine Migration in `normalize()` (läuft beim Laden und beim Import), bestehende Daten dürfen nicht verloren gehen.
- Datensicherung: „Daten sichern“ lädt `ileafyou-JJJJ-MM-TT.json` herunter (`{ app, v, exported, state }`), „Sicherung laden“ ersetzt nach Rückfrage alles auf dem Gerät.
- Geheimnisse (API-Schlüssel) nie ins Frontend und nie ins Repo. Konfiguration: `ileafyou-config.php` über dem Webroot, Vorlage in `api/config.example.php`.
- `VERSION` in `sw.js` setzt der Deploy-Workflow automatisch auf den Commit-Hash. Neue Shell-Dateien in `SHELL` in `sw.js` eintragen.
- Deployment: Push auf `main` lädt per FTPS nach `/ileafyou.rekreativ.ch` (Hosttech `181.hosttech.eu`, Benutzer `rekreativ`, Secret `FTP_PASSWORD`), siehe `.github/workflows/deploy.yml`.
- **Direkt auf `main` arbeiten:** committen und `main` pushen, keine Branches und keine Pull Requests. Jeder Push geht sofort live.
- Kleine, gezielte Änderungen statt Komplett-Umbauten. Rubén bevorzugt iteratives Verfeinern.

## Konten und Sync

- Eigene Konten mit E-Mail und Passwort (`api/auth.php`), Sitzung als httpOnly-Cookie `ily_session` (1 Jahr, Token gehasht in `sessions`). POSTs brauchen den Header `X-ILY: 1` (CSRF-Schutz), Fehler kommen als Code (`{ error: 'login_bad' }`), die App übersetzt sie mit `err_<code>`.
- **Anmeldung ist Pflicht, sobald die Datenbank konfiguriert ist.** Ohne `db_name`/`db_dsn` meldet `auth.php?a=status` `configured:false`, dann läuft die App wie früher nur auf dem Gerät.
- Sync (`api/sync.php`, `js/account.js`): ganzer Zustand als JSON mit Revision. Fotos stehen im Server-Zustand nur als Verweis `ily-photo:<sha256>` und liegen einzeln in `photos`. Speichern markiert „dirty“ und lädt nach 1,5 s hoch; beim Öffnen und bei Rückkehr in die App wird zuerst geholt. Bei Konflikt (409) führt `merge()` zusammen: Pflanzen und Log-Einträge nach `id` vereint, gelöschte Pflanzen über `state.deleted`. Import, Zurücksetzen und Beispielgarten ersetzen den Server-Stand (`replaced()`).
- Offline arbeitet ein angemeldetes Gerät mit dem letzten Stand weiter und synchronisiert später. Abmelden löscht die Daten auf dem Gerät (sie liegen auf dem Server).
- Passwort vergessen: `auth.php?a=forgot` schickt per `mail()` einen Link `?reset=<token>` (1 Stunde gültig). Die Mailtexte stehen in `auth.php` (`RESET_MAIL`), nicht in `i18n.js`.
- Push-Erinnerungen (`api/push.php`, `api/webpush.php`, `api/reminders.php`, `api/cron.php`): Web Push ohne Bibliotheken, VAPID-Schlüssel erzeugt der Server selbst (Tabelle `meta`), Inhalt verschlüsselt (aes128gcm). Abos pro Gerät in `push_subs` mit Zeitzone und Uhrzeit (Standard 18 Uhr, wählbar in den Einstellungen). Ein Cron-Job ruft stündlich `api/cron.php?key=<cron_key>` auf; pro Gerät höchstens eine Nachricht am Tag und nur, wenn etwas fällig ist (`due_in()` rechnet wie `dueOn()` in `app.js`, bei Änderungen beide anpassen). Texte der Benachrichtigungen in `PUSH_TEXT` in `reminders.php`. Abmelden meldet das Gerät von den Erinnerungen ab. Auf dem iPhone nur in der installierten App (ab iOS 16.4).
- Theme-Farbe im hellen Design ist Moos (`#2F5A35`), damit Android die grüne Navigationsleiste mit weissen Buttons zeigt.
- Einstellungen (Zahnrad oben rechts): Konto, Darstellung (pro Gerät in localStorage `ileafyou.theme`), Sprache, Garten, Daten, Server-Infos (`api/server.php`, Sicherheitsstand in `PHP_SICHER` nachführen).

## Sprachen und Texte

- **Vier Sprachen:** Deutsch, Englisch, Spanisch, Französisch. Alle Texte stehen in `js/i18n.js`, im Code nur über `tr('schlüssel', { variablen })`. Nie Text hart codieren. Neue Schlüssel immer in allen vier Sprachen ergänzen.
- Sprache: beim ersten Start aus der Browsersprache (Fallback Englisch), danach `state.lang`, umschaltbar in den Einstellungen (und auf der Anmeldeseite). Statische Texte im HTML über `data-i18n`, `data-i18n-ph`, `data-i18n-aria`.
- Datumsformate über `locale` je Sprache (de-CH, en-GB, es-ES, fr-CH).
- Deutsch in Schweizer Schreibweise: **ss statt ß**.
- Typografie je Sprache: ’ als Apostroph; Anführungszeichen „ “ (DE), “ ” (EN), « » (ES), « » mit geschütztem Leerzeichen (FR); im Französischen geschütztes Leerzeichen vor : ? !. Im Code bleiben ' und ".
- Ausnahme: Pflanzennamen der Pflegetabelle stehen mit allen vier Sprachen direkt in `js/care.js` (Daten, keine Bedienungstexte).
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
    family?,                             // Pflanzenfamilie aus der Foto-Erkennung (z. B. 'Araceae'), für Pflegetipps
    outdoor?, minT?, winter?, inNow?, coldAck?, // draussen: verträgt Kälte bis °C, Winter inside|cool|cover|hardy|annual, im Winterquartier, Warnung für Datum erledigt
    icon,                                // Pixel-Symbol, falls kein Foto: generic, monstera, herb, lemon, orchid, pothos, aloe, cactus
    waterEvery, feedEvery,               // Tage, 0 = keine Erinnerung
    notes, photo,                        // photo: JPEG als data-URL, max. 640 px
    created,                             // ISO-Datum
    log: [{ id, type, date, note, xp, bonus?, for?, days?, img? }]
  }],
  lang,                                  // 'de' | 'en' | 'es' | 'fr'
  sites: [{ id, name, geo? }],           // Orte: Zuhause, Büro, Atelier …; mindestens einer; geo { lat, lon, name } für den Wetterbericht (auf 0,01° gerundet)
  site,                                  // aktiver Ort-Filter, null = alle Orte
  deleted: [{ id, at }],                 // gelöschte Pflanzen, damit der Sync sie nicht zurückholt (max. 300)
  game: { xp, level, streak, best, lastCheck, dayDone, badges: [], vacation?: { until } }
}
```

Orte filtern „Heute dran“, „Nächste Tage“ und die Pflanzenliste. Punkte, Levels, Serie und der Bonus „Tag geschafft“ gelten über alle Orte gemeinsam. Bei „Alle Orte“ ist die Pflanzenliste nach Ort gruppiert. Ein Ort lässt sich nur löschen, wenn er leer ist. Alte Daten ohne `sites` migriert `migrateSites()` auf „Zuhause“.

Log-Typen: `water`, `feed`, `repot`, `note`, `photo` (mit `img`), `check` (Später/Erde feucht, mit `for` und `days`; der Text wird beim Anzeigen übersetzt, nicht gespeichert).

## Pflegevorschläge

`js/care.js` enthält `CARE`: rund 100 gängige Zimmer-, Balkonpflanzen und Kräuter mit wissenschaftlichem Namen, Namen in vier Sprachen, Giess- und Düngeintervall, Pixel-Symbol und Synonymen. Gratis, offline, ohne API. Beim Tippen in Name oder Art schlägt das Formular passende Pflanzen vor; ein Tipp füllt Art, Intervalle und Symbol. Nach der Foto-Erkennung sucht `careFor()` zuerst die Art, dann die Gattung, dann eine andere Art derselben Gattung, und übernimmt die Werte automatisch. Ohne Treffer zeigt die Detailansicht allgemeine Tipps nach Pflanzenfamilie (`CARE_FAMILY`, Familie kommt aus der Erkennung und steht in `plant.family`). Fehlt die Familie, schlägt `lookupFamily()` sie bei GBIF nach (`api.gbif.org/v1/species/match`, frei, ohne Schlüssel; es geht nur der botanische Name raus). Bis dahin oder ohne Art gelten Grundregeln (`CARE_GENERAL`), so hat jede Pflanze Tipps. Jede Zeile hat ausserdem Standort (`sun`, `bright`, `partial`, `shade`), Giessart (`dry`, `moderate`, `moist`, `orchid`) und Düngerart (`green`, `bloom`, `cactus`, `citrus`, `orchid`, `herb`, `veg`); die Texte dazu (`light_*`, `wat_*`, `fert_*`) stehen in `i18n.js` und erscheinen als „Pflegetipps“ in der Detailansicht (`careHtml()`). Neue Pflanzen einfach als Zeile in `CARE` ergänzen.

## Pflanzen draussen

`js/outdoor.js`: Pflanzen mit „Steht draussen“ haben `minT` (verträgt Kälte bis °C) und `winter` (`inside` Zimmerpflanze, `cool` hell und kühl überwintern, `cover` draussen mit Schutz, `hardy` winterhart, `annual` einjährig). Vorschläge aus `COLD`/`COLD_FAMILY` in `care.js`, im Formular änderbar. Wetter: Open-Meteo (frei, ohne Schlüssel, nur für nicht-kommerzielle Nutzung gratis), Tiefstwerte der nächsten Nächte für den Wetter-Standort des Orts, 3 Stunden zwischengespeichert. Die Startseite zeigt unter „Draussen“ pro Ort die Wetterlage (`wxHtml()`: Standort, aktuelle Temperatur, Tiefstwerte der nächsten 7 Nächte, zu kalte Nächte blau, Stand und Quelle, „Ort ändern“), darunter Warnungen für die nächsten 4 Nächte (reinholen, schützen, ernten) und im Frühling „darf wieder raus“; „Reingeholt“/„Rausgestellt“ setzt `inNow`. Die Push-Erinnerung um 18 Uhr enthält Frostwarnungen für heute Nacht (`cold_alerts()` in `reminders.php`, Texte in `COLD_TEXT`), auch an Tagen ohne fällige Pflege.

## Spielregeln

- Pünktlich giessen/düngen +10, verspätet +5, zu früh +2, ohne Rhythmus +3
- Umtopfen +5, Foto +3, Notiz +2, Erde geprüft +2
- Pro Pflanze und Typ nur einmal pro Tag Punkte
- Alle fälligen Aufgaben eines Tages erledigt: +15 Bonus („Tag geschafft“)
- `dailyCheck()` wertet vergangene Tage aus: pro überfälliger Aufgabe und Tag −5, Serie zurück auf 0. Im Ferienmodus keine Abzüge, Serie bleibt stehen.
- Levels ab 0, 50, 150, 300, 500, 800, 1200, 1800 Punkten. Namen je Sprache in `i18n.js` (`lv`), z. B. Samenkorn/Seed/Semilla/Graine bis Botanik-Legende/Botany legend/Leyenda botánica/Légende botanique
- 10 Abzeichen in `BADGES`, Texte in `i18n.js` (`b`), einmal freigeschaltet bleiben sie

## Stand

Fertig: vier Sprachen, Pflanzen erfassen und bearbeiten, Fälligkeiten, „Heute dran“, Wochenvorschau, Protokoll, Foto-Tagebuch, Später-Funktion, mehrere Orte mit Räume-Filter, Ferienmodus, Levels, Serie, Abzeichen, Beispielgarten, Pflegevorschläge (`js/care.js`), Datensicherung (Export/Import), Speicher in IndexedDB, Schriften selbst gehostet (`fonts/`), PWA (installierbar, offline, Button „App installieren“ mit Anleitung fürs iPhone), Erkennungs-Proxy, Konten mit Login, Sync zwischen Geräten, Einstellungen, Pflegetipps, Push-Erinnerungen, Pflanzen draussen mit Frostwarnungen.

Push über Google (Android, Chrome) im Einsatz geprüft; Apple (iPhone) und Mozilla noch ungetestet. Open-Meteo und GBIF sind nur mit simulierten Antworten getestet.

## Nächste Schritte (Vorschläge, nicht beschlossen)

1. **Familie:** Pflanzen oder Orte mit anderen Konten teilen.
2. **Mehr Pflanzen** in `CARE` (`js/care.js`), je nachdem, was Nutzer erfassen.

## Build-Varianten

`<body data-build="pwa">` auf dem eigenen Server: Erkennung und Service Worker aktiv. Der Claude-Prototyp nutzt `data-build="artifact"` und blendet beides aus.

## Offene Fragen

- Markenrecht: Vor dem öffentlichen Start prüfen, ob „i leaf you“ als Name und Domain frei ist.

