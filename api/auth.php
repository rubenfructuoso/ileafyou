<?php
/**
 * i leaf you: Konten.
 * GET  ?a=status                     → { configured, user: {email} | null }
 * POST ?a=register  {email, password, lang}
 * POST ?a=login     {email, password}
 * POST ?a=logout
 * POST ?a=password  {old, password}
 * POST ?a=forgot    {email, lang}     → schickt einen Link zum Zurücksetzen
 * POST ?a=reset     {token, password}
 * POST ?a=delete    {password}        → löscht Konto und alle Daten
 * Fehler als { error: 'code' }, die App übersetzt die Codes.
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';

const LANGS = ['de', 'en', 'es', 'fr'];
const MIN_PW = 8;

// Texte der E-Mail zum Zurücksetzen (Server-seitig, deshalb nicht in i18n.js)
const RESET_MAIL = [
    'de' => ['Passwort zurücksetzen', "Hallo\n\nJemand möchte das Passwort für dein Konto bei i leaf you zurücksetzen. Mit diesem Link legst du ein neues fest (1 Stunde gültig):\n\n{link}\n\nWarst du das nicht? Dann ignoriere diese E-Mail, dein Passwort bleibt wie es ist.\n\ni leaf you"],
    'en' => ['Reset your password', "Hello\n\nSomeone asked to reset the password for your i leaf you account. Use this link to choose a new one (valid for 1 hour):\n\n{link}\n\nWasn’t you? Just ignore this email, your password stays the same.\n\ni leaf you"],
    'es' => ['Restablecer la contraseña', "Hola\n\nAlguien ha pedido restablecer la contraseña de tu cuenta de i leaf you. Con este enlace eliges una nueva (válido 1 hora):\n\n{link}\n\n¿No has sido tú? Ignora este correo, tu contraseña no cambia.\n\ni leaf you"],
    'fr' => ['Réinitialiser le mot de passe', "Bonjour\n\nQuelqu’un a demandé à réinitialiser le mot de passe de ton compte i leaf you. Avec ce lien, tu en choisis un nouveau (valable 1\u{00A0}heure)\u{00A0}:\n\n{link}\n\nCe n’était pas toi\u{00A0}? Ignore cet e-mail, ton mot de passe reste le même.\n\ni leaf you"],
];

$a = $_GET['a'] ?? '';
if ($a === 'status') {
    if (!db_configured()) out(['configured' => false, 'user' => null]);
    try { $u = current_user(); } catch (Throwable $e) { fail(500, 'db'); }
    out(['configured' => true, 'user' => $u ? ['email' => $u['email']] : null]);
}
if (!db_configured()) fail(503, 'not_configured');

$b = body();
$email = mb_strtolower(trim((string)($b['email'] ?? '')));
$pw = (string)($b['password'] ?? '');
$lang = in_array($b['lang'] ?? '', LANGS, true) ? $b['lang'] : 'de';

function check_pw(string $pw): void { if (mb_strlen($pw) < MIN_PW) fail(400, 'pw_short'); }

try {
    switch ($a) {
        case 'register':
            throttle('register', 10, 3600);
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) fail(400, 'email_bad');
            check_pw($pw);
            if (q('SELECT id FROM {p}users WHERE email = ?', [$email])->fetch()) { attempt_failed('register'); fail(409, 'email_taken'); }
            q('INSERT INTO {p}users (email, pass, lang, created) VALUES (?, ?, ?, ?)', [$email, password_hash($pw, PASSWORD_DEFAULT), $lang, time()]);
            start_session((int)db()->lastInsertId());
            out(['ok' => true, 'email' => $email]);

        case 'login':
            throttle('login');
            $u = q('SELECT id, pass FROM {p}users WHERE email = ?', [$email])->fetch();
            if (!$u || !password_verify($pw, $u['pass'])) { attempt_failed('login'); fail(401, 'login_bad'); }
            if (password_needs_rehash($u['pass'], PASSWORD_DEFAULT)) q('UPDATE {p}users SET pass = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
            start_session((int)$u['id']);
            out(['ok' => true, 'email' => $email]);

        case 'logout':
            end_session();
            out(['ok' => true]);

        case 'password':
            $u = require_user();
            throttle('password');
            $row = q('SELECT pass FROM {p}users WHERE id = ?', [$u['id']])->fetch();
            if (!password_verify((string)($b['old'] ?? ''), $row['pass'])) { attempt_failed('password'); fail(401, 'pw_wrong'); }
            check_pw($pw);
            q('UPDATE {p}users SET pass = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
            out(['ok' => true]);

        case 'forgot':
            throttle('forgot', 5, 3600);
            attempt_failed('forgot'); // jede Anfrage zählt, damit niemand Mails in Serie auslöst
            $u = q('SELECT id, lang FROM {p}users WHERE email = ?', [$email])->fetch();
            if ($u) {
                $token = bin2hex(random_bytes(32));
                q('DELETE FROM {p}resets WHERE user_id = ? OR expires < ?', [$u['id'], time()]);
                q('INSERT INTO {p}resets (token, user_id, expires) VALUES (?, ?, ?)', [hash('sha256', $token), $u['id'], time() + 3600]);
                [$subject, $text] = RESET_MAIL[in_array($lang, LANGS, true) ? $lang : $u['lang']] ?? RESET_MAIL['de'];
                $from = (string)cfg('mail_from', 'i leaf you <noreply@' . preg_replace('/^www\./', '', $_SERVER['HTTP_HOST'] ?? 'localhost') . '>');
                mail($email, '=?UTF-8?B?' . base64_encode('i leaf you: ' . $subject) . '?=',
                    str_replace('{link}', base_url() . '?reset=' . $token, $text),
                    "From: $from\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit");
            }
            out(['ok' => true]); // immer ok: verrät nicht, welche Adressen registriert sind

        case 'reset':
            throttle('reset');
            $h = hash('sha256', (string)($b['token'] ?? ''));
            $r = q('SELECT user_id FROM {p}resets WHERE token = ? AND expires >= ?', [$h, time()])->fetch();
            if (!$r) { attempt_failed('reset'); fail(400, 'reset_bad'); }
            check_pw($pw);
            q('UPDATE {p}users SET pass = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $r['user_id']]);
            q('DELETE FROM {p}resets WHERE user_id = ?', [$r['user_id']]);
            q('DELETE FROM {p}sessions WHERE user_id = ?', [$r['user_id']]); // überall abmelden
            start_session((int)$r['user_id']);
            $e = q('SELECT email FROM {p}users WHERE id = ?', [$r['user_id']])->fetchColumn();
            out(['ok' => true, 'email' => $e]);

        case 'delete':
            $u = require_user();
            throttle('delete');
            $row = q('SELECT pass FROM {p}users WHERE id = ?', [$u['id']])->fetch();
            if (!password_verify($pw, $row['pass'])) { attempt_failed('delete'); fail(401, 'pw_wrong'); }
            foreach (['sessions', 'states', 'photos', 'resets', 'push_subs'] as $tb) q("DELETE FROM {p}$tb WHERE user_id = ?", [$u['id']]);
            q('DELETE FROM {p}users WHERE id = ?', [$u['id']]);
            set_session_cookie('', time() - 3600);
            out(['ok' => true]);

        default:
            fail(404, 'unknown');
    }
} catch (Throwable $e) {
    fail(500, 'db');
}
