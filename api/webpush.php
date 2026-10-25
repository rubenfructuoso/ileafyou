<?php
/**
 * i leaf you: Web Push ohne Zusatzbibliotheken (nur openssl und curl).
 * VAPID (RFC 8292) mit ES256, Inhalt verschlüsselt nach RFC 8291 (aes128gcm).
 * Die VAPID-Schlüssel erzeugt der Server beim ersten Gebrauch und legt sie in der Tabelle meta ab.
 */
declare(strict_types=1);

function b64u(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64u_dec(string $s): string { return (string)base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4)); }

function meta_get(string $k): ?string {
    $v = q('SELECT v FROM {p}meta WHERE k = ?', [$k])->fetchColumn();
    return $v === false ? null : (string)$v;
}
function meta_set(string $k, string $v): void {
    q('DELETE FROM {p}meta WHERE k = ?', [$k]);
    q('INSERT INTO {p}meta (k, v) VALUES (?, ?)', [$k, $v]);
}

// Öffentlicher P-256-Schlüssel als 65 Byte (0x04 || x || y)
function ec_raw_public($key): string {
    $d = openssl_pkey_get_details($key)['ec'];
    return "\x04" . str_pad($d['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['y'], 32, "\0", STR_PAD_LEFT);
}
function ec_new() {
    return openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
}
// Rohen öffentlichen Schlüssel in ein PEM verpacken (SubjectPublicKeyInfo für P-256)
function ec_public_pem(string $raw): string {
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $raw;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

/** @return array{0: OpenSSLAsymmetricKey, 1: string} privater Schlüssel, öffentlicher Schlüssel base64url */
function vapid_keys(): array {
    $pem = meta_get('vapid_private');
    if (!$pem) {
        $k = ec_new();
        openssl_pkey_export($k, $pem);
        meta_set('vapid_private', $pem);
    }
    $k = openssl_pkey_get_private($pem);
    return [$k, b64u(ec_raw_public($k))];
}

// DER-Signatur (SEQUENCE von zwei INTEGER) in 64 Byte r || s umwandeln
function der_to_raw(string $der): string {
    $o = 2 + (ord($der[1]) & 0x80 ? (ord($der[1]) & 0x7f) : 0);
    $out = '';
    for ($i = 0; $i < 2; $i++) {
        $len = ord($der[$o + 1]);
        $int = ltrim(substr($der, $o + 2, $len), "\0");
        $out .= str_pad($int, 32, "\0", STR_PAD_LEFT);
        $o += 2 + $len;
    }
    return $out;
}

function vapid_header(string $endpoint): string {
    [$key, $pub] = vapid_keys();
    $u = parse_url($endpoint);
    $aud = $u['scheme'] . '://' . $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '');
    $sub = (string)cfg('push_contact', cfg('mail_from') ? 'mailto:' . preg_replace('/^.*<([^>]+)>.*$/', '$1', (string)cfg('mail_from')) : 'mailto:noreply@example.com');
    $data = b64u(json_encode(['typ' => 'JWT', 'alg' => 'ES256'])) . '.' . b64u(json_encode(['aud' => $aud, 'exp' => time() + 12 * 3600, 'sub' => $sub]));
    openssl_sign($data, $sig, $key, OPENSSL_ALGO_SHA256);
    return 'vapid t=' . $data . '.' . b64u(der_to_raw($sig)) . ', k=' . $pub;
}

function hkdf(string $salt, string $ikm, string $info, int $len): string {
    return substr(hash_hmac('sha256', $info . "\x01", hash_hmac('sha256', $ikm, $salt, true), true), 0, $len);
}

// Inhalt für ein Abo verschlüsseln (RFC 8291, ein Datensatz)
function push_encrypt(string $payload, string $p256dh, string $auth): string {
    $uaPub = b64u_dec($p256dh); $authSecret = b64u_dec($auth);
    $as = ec_new(); $asPub = ec_raw_public($as);
    $secret = openssl_pkey_derive(openssl_pkey_get_public(ec_public_pem($uaPub)), $as, 32);
    if ($secret === false) throw new RuntimeException('ecdh');
    $ikm = hkdf($authSecret, $secret, "WebPush: info\0" . $uaPub . $asPub, 32);
    $salt = random_bytes(16);
    $cek = hkdf($salt, $ikm, "Content-Encoding: aes128gcm\0", 16);
    $nonce = hkdf($salt, $ikm, "Content-Encoding: nonce\0", 12);
    $ct = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
    return $salt . pack('N', 4096) . chr(65) . $asPub . $ct . $tag;
}

/** Schickt eine Nachricht. Rückgabe: HTTP-Status (201 = ok, 404/410 = Abo ungültig, 0 = Netzfehler) */
function push_send(array $sub, array $message): int {
    $body = push_encrypt(json_encode($message, JSON_UNESCAPED_UNICODE), $sub['p256dh'], $sub['auth']);
    $ch = curl_init($sub['endpoint']);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            'Authorization: ' . vapid_header($sub['endpoint']),
            'Content-Encoding: aes128gcm',
            'Content-Type: application/octet-stream',
            'TTL: 43200',
            'Urgency: normal',
        ],
    ]);
    curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code;
}
