<?php
/**
 * i leaf you: Daten eines Kontos synchronisieren.
 * Der Zustand liegt als JSON ohne Fotos in states; Fotos einzeln in photos (Schlüssel: SHA-256 der data-URL).
 * Im Zustand steht statt der data-URL ein Verweis "ily-photo:<hash>".
 *
 * GET  ?a=get                  → { rev, state | null }
 * POST ?a=put   {base, state, force?} → { rev } oder 409 { error:'conflict', rev, state }
 * POST ?a=need  {hashes: []}   → { missing: [] }
 * POST ?a=photo {hash, data}   → { ok }
 * GET  ?a=photo&h=<hash>       → { data }
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';

$u = require_user();
$uid = (int)$u['id'];
$a = $_GET['a'] ?? '';
const HASH = '/^[0-9a-f]{64}$/';

function current_state(int $uid): array {
    $r = q('SELECT data, rev FROM {p}states WHERE user_id = ?', [$uid])->fetch();
    return $r ? ['rev' => (int)$r['rev'], 'state' => json_decode($r['data'])] : ['rev' => 0, 'state' => null];
}

try {
    switch ($a) {
        case 'get':
            out(current_state($uid));

        case 'put':
            $b = body();
            if (!is_array($b['state'] ?? null) || !is_array($b['state']['plants'] ?? null)) fail(400, 'bad');
            // als Objekte neu lesen, damit leere {} nicht zu [] werden
            $json = json_encode(json_decode(file_get_contents('php://input'))->state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if (strlen($json) > 8 * 1024 * 1024) fail(413, 'too_big');
            db()->beginTransaction();
            $cur = q('SELECT rev FROM {p}states WHERE user_id = ?' . (str_starts_with((string)cfg('db_dsn', 'mysql'), 'sqlite') ? '' : ' FOR UPDATE'), [$uid])->fetchColumn();
            $rev = $cur === false ? 0 : (int)$cur;
            if (empty($b['force']) && (int)($b['base'] ?? -1) !== $rev) {
                db()->rollBack();
                out(['error' => 'conflict'] + current_state($uid), 409);
            }
            $next = $rev + 1;
            if ($cur === false) q('INSERT INTO {p}states (user_id, data, rev, updated) VALUES (?, ?, ?, ?)', [$uid, $json, $next, time()]);
            else q('UPDATE {p}states SET data = ?, rev = ?, updated = ? WHERE user_id = ?', [$json, $next, time(), $uid]);
            // Fotos, auf die nichts mehr verweist, aufräumen
            preg_match_all('/ily-photo:([0-9a-f]{64})/', $json, $m);
            $keep = array_unique($m[1]);
            $st = q('SELECT hash FROM {p}photos WHERE user_id = ?', [$uid]);
            foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $h) if (!in_array($h, $keep, true)) q('DELETE FROM {p}photos WHERE user_id = ? AND hash = ?', [$uid, $h]);
            db()->commit();
            out(['rev' => $next]);

        case 'need':
            $b = body();
            $want = array_values(array_unique(array_filter((array)($b['hashes'] ?? []), fn($h) => is_string($h) && preg_match(HASH, $h))));
            $have = q('SELECT hash FROM {p}photos WHERE user_id = ?', [$uid])->fetchAll(PDO::FETCH_COLUMN);
            out(['missing' => array_values(array_diff($want, $have))]);

        case 'photo':
            if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
                $h = (string)($_GET['h'] ?? '');
                if (!preg_match(HASH, $h)) fail(400, 'bad');
                $d = q('SELECT data FROM {p}photos WHERE user_id = ? AND hash = ?', [$uid, $h])->fetchColumn();
                if ($d === false) fail(404, 'missing');
                header('Cache-Control: private, max-age=31536000, immutable');
                out(['data' => $d]);
            }
            $b = body();
            $h = (string)($b['hash'] ?? ''); $d = (string)($b['data'] ?? '');
            if (!preg_match(HASH, $h) || !preg_match('#^data:image/(jpeg|png|webp);base64,#', $d) || strlen($d) > 4 * 1024 * 1024) fail(400, 'bad');
            if (!hash_equals($h, hash('sha256', $d))) fail(400, 'hash');
            if (!q('SELECT 1 FROM {p}photos WHERE user_id = ? AND hash = ?', [$uid, $h])->fetch()) q('INSERT INTO {p}photos (user_id, hash, data) VALUES (?, ?, ?)', [$uid, $h, $d]);
            out(['ok' => true]);

        default:
            fail(404, 'unknown');
    }
} catch (Throwable $e) {
    if (db()->inTransaction()) db()->rollBack();
    fail(500, 'db');
}
