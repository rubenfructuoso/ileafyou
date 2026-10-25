# i leaf you

Pflanzen pflegen, Level sammeln. Eine installierbare Web-App (PWA) für iPhone und Android, auf Deutsch, Englisch, Spanisch und Französisch: Pflanzen erfassen, Giess- und Düngerhythmus, Protokoll, Foto-Tagebuch, Erkennung per Foto und ein Levelsystem, bei dem die Pflanze mitwächst.

## Lokal starten

```bash
php -S localhost:8000
```

Dann http://localhost:8000 öffnen. PHP braucht es nur für die Pflanzenerkennung, alles andere läuft auch mit einem beliebigen statischen Server (`npx serve`).

## Pflanzenerkennung einrichten

1. Gratis-Konto bei https://my.plantnet.org anlegen und einen API-Schlüssel erstellen.
2. `api/config.example.php` kopieren nach `ileafyou-config.php` eine Ebene über dem Webroot (oder lokal nach `api/config.php`).
3. Schlüssel eintragen. Die Datei ist in `.gitignore` und gehört nie ins Repo.

## Konten und Datenbank einrichten

1. Im Hosttech-Kundencenter eine MariaDB-Datenbank anlegen (oder die von famileat mitbenutzen, die Tabellen heissen `ileafyou_…`).
2. In `ileafyou-config.php` (über dem Webroot) `db_name`, `db_user`, `db_pass` und `mail_from` eintragen, Vorlage in `api/config.example.php`.
3. App neu laden: Ab jetzt ist die Anmeldung Pflicht. Wer schon Pflanzen auf dem Handy hat, erstellt ein Konto, die Daten werden hochgeladen.

Ohne diese Einträge läuft die App wie bisher nur auf dem Gerät.

## Push-Erinnerungen einrichten

1. In `ileafyou-config.php` einen langen Zufallswert als `cron_key` eintragen.
2. Im Hosttech-Kundencenter einen Cron-Job anlegen, der **jede Stunde** diese Adresse aufruft: `https://ileafyou.rekreativ.ch/api/cron.php?key=<cron_key>`
3. In der App: Einstellungen → Erinnerungen → „Erinnerungen einschalten“, dann „Probe schicken“.

## Auf dem Handy installieren

Die App muss über **HTTPS** laufen.
- **iPhone:** In Safari öffnen, Teilen, „Zum Home-Bildschirm“.
- **Android:** In Chrome öffnen, Menü, „App installieren“.

## Deployen

Jeder Push auf `main` lädt die App automatisch per FTPS nach `/ileafyou.rekreativ.ch` (Hosttech, Server `181.hosttech.eu`, Benutzer `rekreativ`), siehe `.github/workflows/deploy.yml`. Von Hand auslösen: GitHub → Actions → Deploy → Run workflow.

Einmalig einrichten:
1. Im Hosttech-Kundencenter die Subdomain `ileafyou.rekreativ.ch` mit Ordner `/ileafyou.rekreativ.ch` anlegen, SSL und PHP ab 8.1 aktivieren.
2. FTP-Passwort als Secret `FTP_PASSWORD` hinterlegen: GitHub → Settings → Secrets and variables → Actions → New repository secret. Auf dem Mac in die Zwischenablage kopieren mit `security find-generic-password -s rekreativ-ftp -a rekreativ -w | pbcopy`.
3. `ileafyou-config.php` von Hand in den FTP-Wurzelordner `/` legen (ausserhalb des Webroots). Der Workflow fasst sie nicht an.

Die `VERSION` in `sw.js` setzt der Workflow beim Deployen automatisch auf den Commit-Hash.

## Struktur

```
index.html              App-Markup
css/app.css             Styles und Design-Tokens
js/i18n.js              alle Texte in vier Sprachen
js/care.js              Pflegetabelle (Giess- und Düngevorschläge)
js/app.js               App-Logik (Vanilla JS)
js/account.js           Login, Sync, Einstellungen, App-Start
sw.js                   Service Worker (offline)
manifest.json           PWA-Manifest
.htaccess               Dateitypen und Caching (Apache)
img/                    App-Icons (nicht /icons/, den belegt Apache)
fonts/                  Schriften (selbst gehostet, SIL OFL)
api/identify.php        Proxy zu Pl@ntNet
api/auth.php            Konten (Registrieren, Login, Passwort)
api/sync.php            Daten und Fotos synchronisieren
api/server.php          Server-Infos für die Einstellungen
api/push.php            Erinnerungen an- und abmelden, Probe
api/cron.php            stündlicher Versand der Erinnerungen
api/reminders.php       Fälligkeiten und Texte der Erinnerungen
api/webpush.php         Web Push (VAPID, Verschlüsselung)
api/lib.php             Datenbank, Sitzung, Hilfsfunktionen
api/config.example.php  Vorlage für die Konfiguration
CLAUDE.md               Projektkontext für Claude Code
```
