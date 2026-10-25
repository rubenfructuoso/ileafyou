<?php
/**
 * i leaf you: Proxy für die Pl@ntNet-Erkennung.
 * Hält den API-Schlüssel vom Browser fern und begrenzt die Anfragen pro Tag.
 *
 * POST multipart/form-data mit Feld "image" (JPEG oder PNG)
 * Antwort: {"results":[{"scientific":"...","common":"...","score":0.87}, ...]}
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

function fail(int $code, string $msg): never {
    http_response_code($code);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// Konfiguration: bevorzugt ausserhalb des Webroots, sonst api/config.php
$candidates = [dirname(__DIR__, 2) . '/ileafyou-config.php', __DIR__ . '/config.php'];
$configFile = null;
foreach ($candidates as $c) { if (is_file($c)) { $configFile = $c; break; } }
if (!$configFile) fail(500, 'Konfiguration fehlt (siehe config.example.php).');
$config = require $configFile;
if (empty($config['plantnet_key'])) fail(500, 'Kein Pl@ntNet-Schlüssel hinterlegt.');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'Nur POST erlaubt.');

$allowed = $config['allowed_origin'] ?? '';
if ($allowed !== '' && isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] !== $allowed) {
    fail(403, 'Herkunft nicht erlaubt.');
}

$file = $_FILES['image'] ?? null;
if (!$file || $file['error'] !== UPLOAD_ERR_OK) fail(400, 'Kein Bild erhalten.');
if ($file['size'] > 4 * 1024 * 1024) fail(413, 'Bild zu gross (max. 4 MB).');
$mime = mime_content_type($file['tmp_name']) ?: '';
if (!in_array($mime, ['image/jpeg', 'image/png'], true)) fail(415, 'Nur JPG oder PNG.');

// Einfaches Tageslimit, damit das Gratis-Kontingent nicht leerläuft
$limit = (int)($config['daily_limit'] ?? 400);
$counter = sys_get_temp_dir() . '/ileafyou-count-' . date('Y-m-d') . '.txt';
$fh = fopen($counter, 'c+');
if ($fh && flock($fh, LOCK_EX)) {
    $count = (int)stream_get_contents($fh);
    if ($count >= $limit) { flock($fh, LOCK_UN); fclose($fh); fail(429, 'Daily limit reached. Try again tomorrow.'); }
    ftruncate($fh, 0); rewind($fh); fwrite($fh, (string)($count + 1));
    flock($fh, LOCK_UN); fclose($fh);
}

$url = 'https://my-api.plantnet.org/v2/identify/' . rawurlencode($config['project'] ?? 'all') . '?' . http_build_query([
    'api-key'    => $config['plantnet_key'],
    'lang'       => in_array($_POST['lang'] ?? '', ['de', 'en', 'es', 'fr'], true) ? $_POST['lang'] : 'de',
    'nb-results' => 5,
]);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => [
        'images' => new CURLFile($file['tmp_name'], $mime, 'pflanze.jpg'),
        'organs' => 'auto',
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 20,
]);
$body = curl_exec($ch);
$status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($body === false) fail(502, 'Pl@ntNet nicht erreichbar.');
if ($status === 404) { echo json_encode(['results' => []]); exit; } // keine Art gefunden
if ($status !== 200) fail(502, 'Pl@ntNet antwortet mit Status ' . $status . '.');

$data = json_decode($body, true);
$results = [];
foreach (($data['results'] ?? []) as $r) {
    $results[] = [
        'scientific' => $r['species']['scientificNameWithoutAuthor'] ?? '',
        'common'     => $r['species']['commonNames'][0] ?? '',
        'family'     => $r['species']['family']['scientificNameWithoutAuthor'] ?? '',
        'score'      => round((float)($r['score'] ?? 0), 3),
    ];
}
echo json_encode(['results' => $results], JSON_UNESCAPED_UNICODE);
