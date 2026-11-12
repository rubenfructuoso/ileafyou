---
name: arbeits-log
description: Am Ende jeder abgeschlossenen Arbeit in diesem Repository einen kurzen Eintrag fürs Arbeits-Log im CMS von Rubén Fructuoso schreiben (für Kundengespräche «was wurde seit dem letzten Treffen gemacht»). Verwenden, sobald eine Aufgabe fertig, committet und gepusht ist, oder wenn Rubén um einen Log-Eintrag bittet.
---

# Arbeits-Log ins CMS

Rubén bespricht mit seinen Kundinnen und Kunden regelmässig, was seit dem letzten Treffen passiert ist. Dafür landet jede abgeschlossene Arbeit als Eintrag im Arbeits-Log seines CMS (ruben.fructuoso.info/cms). Die Einträge werden im Gespräch abgehakt; mit «für Kunde sichtbar» erscheinen sie auch auf dem Kunden-Link.

## Wann

- Nach jeder in sich abgeschlossenen Arbeit (Feature, Fix, Textänderung, Deployment …), nachdem sie committet ist.
- Ein Eintrag pro Arbeitspaket, nicht pro Commit. Mehrere kleine Änderungen einer Sitzung zu einem Eintrag zusammenfassen.
- Nicht für reine Zwischenstände, Experimente ohne Ergebnis oder Rückfragen.

## Scrum-Board (Sprints & Karten)

Jedes Kundenprojekt hat im CMS ein Board wie Trello: Product Backlog, Sprints und die Spalten «Zu tun → In Arbeit → Review → Erledigt».

- **Vor der Arbeit** (wenn die Domain erreichbar ist): aktuellen Sprint ansehen, um die passende Karte zu finden:
  `curl -s -H "Authorization: Bearer $RF_CMS_TOKEN" "${RF_CMS_URL:-https://ruben.fructuoso.info/cms}/api/board.php?project=<slug>"`
  Rubén nennt die Karte oft auch direkt («Karte #12»).
- **Nach der Arbeit:** im Log-Eintrag die Karte angeben (`card: 12`) und sie auf **Review** setzen (`card_status: review`). Auf «Erledigt» setzt Rubén sie nach der Abnahme selbst – ausser er sagt ausdrücklich, dass sie fertig ist.
- Neue Aufgaben, die während der Arbeit auffallen, als Karte ins Backlog legen (POST `api/board.php` mit `title`, `type`, `description`) statt sie still mitzuerledigen.

## Wie (Standard: über Git, funktioniert auch in Cloud-Sitzungen)

1. Datei anlegen: `.worklog/JJJJ-MM-TT-HHMM-<kurzer-slug>.md` (Datum/Zeit in Europe/Zurich).
2. Inhalt:

   ```markdown
   ---
   project: <Projekt-Slug>
   title: <Kurzer Titel, max. ~70 Zeichen, deutsch>
   visible_to_client: true
   card: 12              # optional: Karte auf dem Scrum-Board
   card_status: review   # optional: Karte dabei verschieben (todo|doing|review|done)
   minutes: 45           # Aufwand dieser Arbeit in Minuten, in 15-Minuten-Schritten (siehe unten)
   ---
   - <Was ist neu oder anders – aus Sicht der Kundin/des Kunden, in einfacher Sprache>
   - <Warum / welcher Nutzen>
   - <Wie geprüft (z. B. «auf iPhone und Desktop getestet»)>
   - <Offene Punkte oder Fragen fürs nächste Treffen, falls vorhanden>

   ## Intern
   <Optional: technische Details nur für Rubén – Dateien, Entscheidungen, Commit/PR-Link. Wird dem Kunden nie gezeigt.>
   ```

3. Die Datei mit der Arbeit committen und pushen. Das CMS holt neue Dateien aus `.worklog/` aller Repositories selbst von GitHub ab (alle 10 Minuten; ein GitHub-Schlüssel im CMS, kein Secret pro Repository). Das klappt auch in Cloud-Sitzungen.

**Projekt-Slug:** steht in `.worklog/PROJECT` (eine Zeile). Fehlt die Datei, den Repository-Namen in Kleinbuchstaben verwenden. Das CMS ordnet über Slug → Repository → Namen zu (von Hand angelegtes «Zeitmaschine» passt auch zu `kulturlabor-zeitmaschine`) und merkt sich dabei das Repository. Nur was gar nicht passt, legt es als neues Projekt an.

**Aufwand (`minutes`):** Immer angeben. Gemeint ist die Zeit, die Rubén mit Claude an dieser Arbeit gesessen hat: von der ersten Nachricht zur Aufgabe bis zum Push, Pausen über 30 Minuten abgezogen, auf 15 Minuten aufgerundet (15, 30, 45, 60 …). Die Zeitstempel der Unterhaltung sind die Grundlage; im Zweifel knapp schätzen statt grosszügig. Der Aufwand ist nur intern sichtbar (CMS), nie auf dem Kunden-Link. Rubén kann ihn im CMS korrigieren.

## Schreibstil

- Deutsch (Schweizer Schreibweise: «ss», Anführungszeichen «…»), sachlich, freundlich, ohne Fachjargon in der Zusammenfassung.
- 2–5 Aufzählungspunkte. Konkrete Ergebnisse statt Tätigkeiten («Formular schickt jetzt eine Bestätigung» statt «FormHandler refactored»).
- Nichts Vertrauliches in die Zusammenfassung (Passwörter, Schlüssel, interne Kundendaten). Technisches gehört unter «## Intern».
- `visible_to_client: false`, wenn der Eintrag nur intern ist (z. B. Aufräumarbeiten ohne sichtbare Wirkung).
