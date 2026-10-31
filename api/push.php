<?php
/**
 * i leaf you: Push-Erinnerungen.
 * GET  ?a=key                                        → { key }  öffentlicher VAPID-Schlüssel
 * POST ?a=subscribe   {sub: {endpoint, keys}, tz, hour} → { ok }
 * POST ?a=unsubscribe {endpoint}                     → { ok }
 * POST ?a=test        {endpoint}                     → { ok } schickt sofort eine Probe
 * Den täglichen Versand macht api/cron.php.
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';
require __DIR__ . '/webpush.php';
require __DIR__ . '/reminders.php';

$u = require_user();
$a = $_GET['a'] ?? '';

try {
    if ($a === 'key') out(['key' => vapid_keys()[1]]);
    $b = body();
    $endpoint = (string)($b['sub']['endpoint'] ?? $b['endpoint'] ?? '');
    if ($a === 'cron') {   // Cron-Status ohne Abo (für die Einstellungen, wenn Erinnerungen aus sind)
        $cron = meta_get('cron_last'); out(['cron_last' => $cron ? (int)$cron : null]);
    }
    if (!preg_match('#^https://[^\s]+$#', $endpoint) || strlen($endpoint) > 1000) fail(400, 'bad');
    $id = hash('sha256', $endpoint);

    switch ($a) {
        case 'subscribe':
            $p256dh = (string)($b['sub']['keys']['p256dh'] ?? ''); $auth = (string)($b['sub']['keys']['auth'] ?? '');
            if (strlen(b64u_dec($p256dh)) !== 65 || strlen(b64u_dec($auth)) !== 16) fail(400, 'bad');
            $tz = in_array($b['tz'] ?? '', DateTimeZone::listIdentifiers(), true) ? $b['tz'] : 'Europe/Zurich';
            $hour = max(0, min(23, (int)($b['hour'] ?? 18)));
            // Wer nach der Erinnerungszeit einschaltet, bekommt die erste Erinnerung morgen
            $now = new DateTimeImmutable('now', new DateTimeZone($tz));
            $last = (int)$now->format('G') >= $hour ? $now->format('Y-m-d') : '';
            q('DELETE FROM {p}push_subs WHERE id = ?', [$id]);
            q('INSERT INTO {p}push_subs (id, user_id, endpoint, p256dh, auth, tz, hour, last_day, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$id, $u['id'], $endpoint, $p256dh, $auth, $tz, $hour, $last, time()]);
            out(['ok' => true]);

        case 'unsubscribe':
            q('DELETE FROM {p}push_subs WHERE id = ? AND user_id = ?', [$id, $u['id']]);
            out(['ok' => true]);

        case 'status':   // für die Einstellungen: läuft der Cron-Job, was ging zuletzt an dieses Gerät?
            $sub = q('SELECT hour, tz, last_day FROM {p}push_subs WHERE id = ? AND user_id = ?', [$id, $u['id']])->fetch();
            $cron = meta_get('cron_last'); $last = meta_get('ps:' . substr($id, 0, 48));
            out(['cron_last' => $cron ? (int)$cron : null, 'registered' => (bool)$sub, 'last' => $last ? json_decode($last, true) : null] + ($sub ?: []));

        case 'test':
            $sub = q('SELECT * FROM {p}push_subs WHERE id = ? AND user_id = ?', [$id, $u['id']])->fetch();
            if (!$sub) fail(404, 'push_missing');
            $code = push_send($sub, reminder_message((int)$u['id'], $sub, true));
            if ($code === 404 || $code === 410) { q('DELETE FROM {p}push_subs WHERE id = ?', [$id]); fail(410, 'push_gone'); }
            if ($code < 200 || $code >= 300) fail(502, 'push_failed');
            out(['ok' => true]);

        default:
            fail(404, 'unknown');
    }
} catch (Throwable $e) {
    fail(500, 'server');
}
