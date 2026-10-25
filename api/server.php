<?php
/**
 * i leaf you: Server-Infos für die Einstellungen (nur angemeldet). Keine Zugangsdaten, keine Pfade.
 * GET → { php: {version, ok, min, stand, grund}, sapi, os, webserver, db, ini, ext, app }
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';
require_user();

// Kleinste sichere Version je PHP-Zweig. Bei neuen Sicherheitsmeldungen auf php.net nachführen
// (Datum und Grund anpassen). Zweige, die fehlen, gelten als nicht mehr unterstützt.
const PHP_SICHER = [
    'stand' => '21.10.2026',
    'grund' => 'CVE-2026-109618, CVE-2026-109619',
    'zweige' => ['8.5' => '8.5.12', '8.4' => '8.4.27', '8.3' => '8.3.36', '8.2' => '8.2.35'],
];
const PHP_ERWEITERUNGEN = ['pdo', 'pdo_mysql', 'json', 'mbstring', 'openssl', 'curl'];

$zweig = PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION;
$min = PHP_SICHER['zweige'][$zweig] ?? null;
$php = [
    'version' => PHP_VERSION,
    'status' => $min === null ? 'eol' : (version_compare(PHP_VERSION, $min, '<') ? 'update' : 'ok'),
    'min' => $min ?? array_key_first(PHP_SICHER['zweige']),
    'stand' => PHP_SICHER['stand'],
    'grund' => PHP_SICHER['grund'],
];

try {
    $treiber = db()->getAttribute(PDO::ATTR_DRIVER_NAME);
    $v = (string)db()->query($treiber === 'sqlite' ? 'SELECT sqlite_version()' : 'SELECT VERSION()')->fetchColumn();
    $dbv = ($treiber === 'sqlite' ? 'SQLite ' : (stripos($v, 'mariadb') !== false ? 'MariaDB ' : 'MySQL ')) . preg_replace('/-.*$/', '', $v);
} catch (Throwable $e) {
    $dbv = '–';
}

$ini = [];
foreach (['memory_limit', 'post_max_size', 'upload_max_filesize', 'max_execution_time', 'display_errors'] as $k) {
    $v = ini_get($k);
    $ini[$k] = $v === false ? '–' : ($v === '' ? '0' : $v);
}
$ini['date.timezone'] = date_default_timezone_get();

$ext = [];
foreach (PHP_ERWEITERUNGEN as $e) $ext[$e] = extension_loaded($e);

// App-Version: der Deploy-Workflow schreibt den Commit in sw.js
preg_match("/const VERSION = '([^']*)'/", (string)@file_get_contents(dirname(__DIR__) . '/sw.js'), $m);

out([
    'php' => $php,
    'sapi' => PHP_SAPI,
    'os' => PHP_OS_FAMILY . (function_exists('php_uname') ? ' ' . php_uname('r') : ''),
    'webserver' => preg_replace('#/.*$#', '', (string)($_SERVER['SERVER_SOFTWARE'] ?? '–')),
    'db' => $dbv,
    'ini' => $ini,
    'ext' => $ext,
    'app' => $m[1] ?? '–',
]);
