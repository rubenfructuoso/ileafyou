<?php
// Kopieren nach ileafyou-config.php (empfohlen: eine Ebene ÜBER dem Webroot)
// oder nach api/config.php. Diese Datei nie committen.
return [
    // Pflanzenerkennung
    'plantnet_key'   => 'DEIN-PLANTNET-API-KEY',  // https://my.plantnet.org
    'project'        => 'all',                   // Pl@ntNet-Flora; "all" = weltweit
    'daily_limit'    => 400,                     // unter dem Gratis-Kontingent bleiben
    'allowed_origin' => '',                      // z. B. 'https://ileafyou.example.ch'

    // Konten und Sync: MariaDB aus dem Hosttech-Kundencenter (Datenbanken).
    // Ohne diese Einträge läuft die App nur auf dem Gerät, ohne Anmeldung.
    'db_host'      => 'localhost',
    'db_port'      => 3306,
    'db_name'      => 'DATENBANKNAME',
    'db_user'      => 'BENUTZER',
    'db_pass'      => 'PASSWORT',
    'table_prefix' => 'ileafyou_',               // Tabellen werden beim ersten Aufruf angelegt
    // Lokal testen statt MariaDB: 'db_dsn' => 'sqlite:' . __DIR__ . '/test.sqlite',

    // Absender der E-Mail «Passwort zurücksetzen» (Adresse auf einer eigenen Domain)
    'mail_from'    => 'i leaf you <noreply@rekreativ.ch>',
    // Optional: feste Adresse, falls die automatische Erkennung nicht passt
    // 'base_url'  => 'https://ileafyou.rekreativ.ch/',
];
