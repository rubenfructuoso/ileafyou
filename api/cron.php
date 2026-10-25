<?php
/**
 * i leaf you: täglicher Versand der Erinnerungen. Jede Stunde aufrufen (Cron-Job bei Hosttech):
 *   https://ileafyou.rekreativ.ch/api/cron.php?key=<cron_key aus ileafyou-config.php>
 * oder auf der Kommandozeile: php api/cron.php
 * Schickt pro Gerät höchstens eine Erinnerung am Tag, sobald dessen Uhrzeit (Standard 18 Uhr) erreicht ist.
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';
require __DIR__ . '/webpush.php';
require __DIR__ . '/reminders.php';

if (PHP_SAPI !== 'cli') {
    $key = (string)cfg('cron_key', '');
    if ($key === '' || !hash_equals($key, (string)($_GET['key'] ?? ''))) fail(403, 'key');
}
if (!db_configured()) fail(503, 'not_configured');
@set_time_limit(300);
try {
    out(run_reminders() + ['time' => date('c')]);
} catch (Throwable $e) {
    fail(500, 'server');
}
