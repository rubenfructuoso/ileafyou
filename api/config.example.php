<?php
// Kopieren nach ileafyou-config.php (empfohlen: eine Ebene ÜBER dem Webroot)
// oder nach api/config.php. Diese Datei nie committen.
return [
    'plantnet_key'   => 'DEIN-PLANTNET-API-KEY',  // https://my.plantnet.org
    'project'        => 'all',                   // Pl@ntNet-Flora; "all" = weltweit
    'daily_limit'    => 400,                     // unter dem Gratis-Kontingent bleiben
    'allowed_origin' => '',                      // z. B. 'https://ileafyou.example.ch'
];
