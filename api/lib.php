<?php
/**
 * i leaf you: gemeinsame Funktionen für Konten und Sync.
 * Konfiguration aus ileafyou-config.php (über dem Webroot) oder api/config.php.
 * Ohne Datenbank-Eintrag läuft die App wie bisher nur auf dem Gerät.
 */
declare(strict_types=1);

function config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    foreach ([dirname(__DIR__, 2) . '/ileafyou-config.php', __DIR__ . '/config.php'] as $c) {
        if (is_file($c)) return $cfg = (array)require $c;
    }
    return $cfg = [];
}
function cfg(string $key, $default = null) { return config()[$key] ?? $default; }
function db_configured(): bool { return (bool)(cfg('db_dsn') || cfg('db_name')); }

function out($data, int $code = 200): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(int $code, string $error): never { out(['error' => $error], $code); }

// POST nur mit eigenem Header: Fremde Seiten können ihn nicht ohne CORS-Freigabe setzen (CSRF-Schutz)
function body(): array {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'method');
    if (($_SERVER['HTTP_X_ILY'] ?? '') !== '1') fail(403, 'header');
    $b = json_decode(file_get_contents('php://input') ?: '{}', true);
    return is_array($b) ? $b : [];
}

function t(string $name): string {
    return preg_replace('/[^a-z0-9_]/i', '', (string)cfg('table_prefix', 'ileafyou_')) . $name;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $dsn = cfg('db_dsn') ?: sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        cfg('db_host', 'localhost'), (int)cfg('db_port', 3306), cfg('db_name'));
    $pdo = new PDO($dsn, cfg('db_user'), cfg('db_pass'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $my = str_starts_with($dsn, 'mysql');
    $id = $my ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $long = $my ? 'LONGTEXT' : 'TEXT';
    $cs = $my ? ' DEFAULT CHARSET=utf8mb4' : '';
    foreach ([
        "users (id $id, email VARCHAR(190) NOT NULL UNIQUE, pass VARCHAR(255) NOT NULL, lang VARCHAR(5) NOT NULL DEFAULT 'de', created BIGINT NOT NULL)",
        "sessions (token CHAR(64) PRIMARY KEY, user_id INT NOT NULL, created BIGINT NOT NULL, seen BIGINT NOT NULL)",
        "states (user_id INT PRIMARY KEY, data $long NOT NULL, rev INT NOT NULL, updated BIGINT NOT NULL)",
        "photos (user_id INT NOT NULL, hash CHAR(64) NOT NULL, data $long NOT NULL, PRIMARY KEY (user_id, hash))",
        "resets (token CHAR(64) PRIMARY KEY, user_id INT NOT NULL, expires BIGINT NOT NULL)",
        "attempts (k CHAR(64) NOT NULL, at BIGINT NOT NULL)",
    ] as $sql) $pdo->exec('CREATE TABLE IF NOT EXISTS ' . t('') . $sql . $cs);
    return $pdo;
}

function q(string $sql, array $args = []): PDOStatement {
    $st = db()->prepare(str_replace('{p}', t(''), $sql));
    $st->execute($args);
    return $st;
}

/* ---------- Sitzung ---------- */
const COOKIE = 'ily_session';

function is_https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}
function set_session_cookie(string $value, int $expires): void {
    setcookie(COOKIE, $value, ['expires' => $expires, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => is_https()]);
}
function start_session(int $userId): void {
    $token = bin2hex(random_bytes(32));
    q('INSERT INTO {p}sessions (token, user_id, created, seen) VALUES (?, ?, ?, ?)', [hash('sha256', $token), $userId, time(), time()]);
    set_session_cookie($token, time() + 365 * 86400);
}
function end_session(): void {
    if (!empty($_COOKIE[COOKIE])) q('DELETE FROM {p}sessions WHERE token = ?', [hash('sha256', (string)$_COOKIE[COOKIE])]);
    set_session_cookie('', time() - 3600);
}
function current_user(): ?array {
    static $u = false;
    if ($u !== false) return $u;
    $tok = (string)($_COOKIE[COOKIE] ?? '');
    if ($tok === '') return $u = null;
    $h = hash('sha256', $tok);
    $u = q('SELECT u.id, u.email, u.lang FROM {p}sessions s JOIN {p}users u ON u.id = s.user_id WHERE s.token = ?', [$h])->fetch() ?: null;
    if ($u) q('UPDATE {p}sessions SET seen = ? WHERE token = ? AND seen < ?', [time(), $h, time() - 3600]);
    return $u;
}
function require_user(): array {
    if (!db_configured()) fail(503, 'not_configured');
    return current_user() ?? fail(401, 'login');
}

// Zu viele Fehlversuche von derselben Adresse bremsen
function throttle(string $what, int $max = 20, int $window = 900): void {
    $k = hash('sha256', $what . '|' . ($_SERVER['REMOTE_ADDR'] ?? ''));
    q('DELETE FROM {p}attempts WHERE at < ?', [time() - 86400]);
    if ((int)q('SELECT COUNT(*) FROM {p}attempts WHERE k = ? AND at >= ?', [$k, time() - $window])->fetchColumn() >= $max) fail(429, 'throttle');
}
function attempt_failed(string $what): void {
    q('INSERT INTO {p}attempts (k, at) VALUES (?, ?)', [hash('sha256', $what . '|' . ($_SERVER['REMOTE_ADDR'] ?? '')), time()]);
    sleep(1);
}

function base_url(): string {
    if (cfg('base_url')) return rtrim((string)cfg('base_url'), '/') . '/';
    $dir = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/x.php'))), '/');
    return (is_https() ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $dir . '/';
}
