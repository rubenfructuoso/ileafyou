<?php
/**
 * i leaf you: Fälligkeiten auf dem Server berechnen und Erinnerungstexte bauen.
 * Gleiche Regeln wie dueOn() in js/app.js, gerechnet in der Zeitzone des Geräts.
 * Texte der Benachrichtigungen stehen hier (Server-seitig), nicht in i18n.js.
 */
declare(strict_types=1);

const COLD_TEXT = [
    'de' => ['in' => '{min} °C heute Nacht: {name} reinholen', 'cover' => '{min} °C heute Nacht: {name} abdecken', 'hardy' => '{min} °C heute Nacht: Topf von {name} schützen', 'annual' => '{min} °C heute Nacht: {name} vorher ernten'],
    'en' => ['in' => '{min} °C tonight: bring {name} inside', 'cover' => '{min} °C tonight: cover {name}', 'hardy' => '{min} °C tonight: protect the pot of {name}', 'annual' => '{min} °C tonight: harvest {name} first'],
    'es' => ['in' => '{min} °C esta noche: mete {name} dentro', 'cover' => '{min} °C esta noche: cubre {name}', 'hardy' => '{min} °C esta noche: protege la maceta de {name}', 'annual' => '{min} °C esta noche: cosecha {name} antes'],
    'fr' => ['in' => "{min}\u{00A0}°C cette nuit\u{00A0}: rentrer {name}", 'cover' => "{min}\u{00A0}°C cette nuit\u{00A0}: couvrir {name}", 'hardy' => "{min}\u{00A0}°C cette nuit\u{00A0}: protéger le pot de {name}", 'annual' => "{min}\u{00A0}°C cette nuit\u{00A0}: récolter {name} avant"],
];

const PUSH_TEXT = [
    'de' => ['water' => 'giessen', 'feed' => 'düngen', 'today' => 'Heute dran: {list}', 'more' => '{list} und {n} weitere', 'test' => 'So sehen deine Erinnerungen aus. Sie kommen um {hour} Uhr, wenn etwas fällig ist.'],
    'en' => ['water' => 'water', 'feed' => 'feed', 'today' => 'Due today: {list}', 'more' => '{list} and {n} more', 'test' => 'This is what your reminders look like. They come at {hour}:00 when something is due.'],
    'es' => ['water' => 'regar', 'feed' => 'abonar', 'today' => 'Para hoy: {list}', 'more' => '{list} y {n} más', 'test' => 'Así son tus recordatorios. Llegan a las {hour}:00 cuando toca algo.'],
    'fr' => ['water' => 'arroser', 'feed' => 'engrais', 'today' => "Aujourd’hui\u{00A0}: {list}", 'more' => '{list} et {n} autres', 'test' => "Voici à quoi ressemblent tes rappels. Ils arrivent à {hour}\u{00A0}h quand quelque chose est à faire."],
];

function day_of(string $iso, DateTimeZone $tz): DateTimeImmutable {
    return (new DateTimeImmutable($iso))->setTimezone($tz)->setTime(0, 0);
}
function days_from(DateTimeImmutable $a, DateTimeImmutable $b): int { return (int)$a->diff($b)->format('%r%a'); }

// Tage bis fällig (negativ = überfällig), null = keine Erinnerung. Entspricht dueOn() in app.js.
function due_in(array $p, string $t, DateTimeImmutable $today, DateTimeZone $tz): ?int {
    $every = (int)($t === 'water' ? ($p['waterEvery'] ?? 0) : ($p['feedEvery'] ?? 0));
    if ($every <= 0 || empty($p['created'])) return null;
    if (day_of($p['created'], $tz) > $today) return null;
    $log = $p['log'] ?? [];
    $prior = null;
    foreach ($log as $l) if (($l['type'] ?? '') === $t && day_of($l['date'], $tz) <= $today && ($prior === null || $l['date'] > $prior)) $prior = $l['date'];
    $d = $every - days_from(day_of($prior ?? $p['created'], $tz), $today);
    $chk = null;
    foreach ($log as $l) {
        if (($l['type'] ?? '') !== 'check' || ($l['for'] ?? '') !== $t || day_of($l['date'], $tz) > $today) continue;
        if ($prior !== null && $l['date'] < $prior) continue;
        if ($chk === null || $l['date'] > $chk['date']) $chk = $l;
    }
    if ($chk) $d = max($d, (int)($chk['days'] ?? 0) - days_from(day_of($chk['date'], $tz), $today));
    return $d;
}

/** Fällige Aufgaben heute: [[name, 'water'|'feed'], ...] */
function due_tasks(array $state, DateTimeZone $tz): array {
    $today = new DateTimeImmutable('today', $tz);
    $vac = $state['game']['vacation']['until'] ?? null;
    if ($vac && $vac >= $today->format('Y-m-d')) return [];
    $out = [];
    foreach ($state['plants'] ?? [] as $p) foreach (['water', 'feed'] as $t) {
        $d = due_in($p, $t, $today, $tz);
        if ($d !== null && $d <= 0) $out[] = [(string)($p['name'] ?? ''), $t];
    }
    return $out;
}

// Tiefstwerte der nächsten Tage von Open-Meteo, pro Koordinate einmal pro Lauf: ['YYYY-MM-DD' => min]
function forecast_min(float $lat, float $lon): array {
    static $cache = [];
    $k = sprintf('%.2f,%.2f', $lat, $lon);
    if (isset($cache[$k])) return $cache[$k];
    $ch = curl_init(sprintf('https://api.open-meteo.com/v1/forecast?latitude=%.2f&longitude=%.2f&daily=temperature_2m_min&timezone=auto&forecast_days=3', $lat, $lon));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
    $j = json_decode((string)curl_exec($ch), true); curl_close($ch);
    $out = [];
    foreach ($j['daily']['time'] ?? [] as $i => $d) $out[$d] = (int)round((float)$j['daily']['temperature_2m_min'][$i]);
    return $cache[$k] = $out;
}

/** Frostwarnungen für heute Nacht (Tiefstwert des nächsten Morgens), wie outStatus() in js/outdoor.js */
function cold_alerts(array $state, DateTimeZone $tz, string $lang): array {
    $tomorrow = (new DateTimeImmutable('tomorrow', $tz))->format('Y-m-d');
    $now = new DateTimeImmutable('now', $tz);
    $season = (int)$now->format('n') >= 7 ? (int)$now->format('Y') : (int)$now->format('Y') - 1;   // wie season() in outdoor.js
    $geo = [];
    foreach ($state['sites'] ?? [] as $s) if (isset($s['geo']['lat'], $s['geo']['lon'])) $geo[$s['id']] = $s['geo'];
    $out = [];
    foreach ($state['plants'] ?? [] as $p) {
        if (empty($p['outdoor']) || !empty($p['inNow']) || !isset($geo[$p['siteId'] ?? ''], $p['minT'])) continue;
        $min = forecast_min((float)$geo[$p['siteId']]['lat'], (float)$geo[$p['siteId']]['lon'])[$tomorrow] ?? null;
        if ($min === null || $min >= (int)$p['minT'] || ($p['coldAck'] ?? '') === $tomorrow) continue;
        if (($p['winter'] ?? '') === 'annual' && (int)($p['coldSeason'] ?? 0) === $season) continue;   // geerntet, Pflanze bleibt
        $w = in_array($p['winter'] ?? '', ['cover', 'hardy', 'annual'], true) ? $p['winter'] : 'in';
        $out[] = str_replace(['{min}', '{name}'], [str_replace('-', '−', (string)$min), (string)($p['name'] ?? '')], COLD_TEXT[$lang][$w]);
    }
    return $out;
}

/** Nachricht für ein Abo, null wenn nichts fällig ist (ausser bei der Probe) */
function reminder_message(int $userId, array $sub, bool $test = false): ?array {
    $row = q('SELECT data FROM {p}states WHERE user_id = ?', [$userId])->fetchColumn();
    $state = $row ? (json_decode((string)$row, true) ?: []) : [];
    $lang = in_array($state['lang'] ?? '', ['de', 'en', 'es', 'fr'], true) ? $state['lang'] : 'de';
    $T = PUSH_TEXT[$lang];
    $tasks = due_tasks($state, new DateTimeZone($sub['tz']));
    $cold = cold_alerts($state, new DateTimeZone($sub['tz']), $lang);
    if (!$tasks && !$cold && !$test) return null;
    if ($cold && !$tasks) {
        $body = implode("\n", $cold);
    } elseif ($tasks) {
        $items = array_map(fn($x) => $x[0] . ': ' . $T[$x[1]], array_slice($tasks, 0, 3));
        $list = implode(' · ', $items);
        if (count($tasks) > 3) $list = str_replace(['{list}', '{n}'], [$list, count($tasks) - 3], $T['more']);
        $body = str_replace('{list}', $list, $T['today']);
    } else {
        $body = str_replace('{hour}', (string)$sub['hour'], $T['test']);
    }
    if ($cold && $tasks) $body = implode("\n", $cold) . "\n" . $body;   // Frost zuerst, das eilt mehr
    if ($test && ($tasks || $cold)) $body .= "\n" . str_replace('{hour}', (string)$sub['hour'], $T['test']);
    return ['title' => 'i leaf you', 'body' => $body, 'tag' => 'ileafyou-due', 'url' => './'];
}

/** Täglicher Versand: alle Abos, deren Uhrzeit erreicht ist und die heute noch nichts bekommen haben */
function run_reminders(): array {
    $sent = 0; $skipped = 0; $removed = 0; $failed = 0;
    meta_set('cron_last', (string)time());
    $log = fn($sub, string $what, int $code = 0) => meta_set('ps:' . substr($sub['id'], 0, 48), json_encode(['at' => time(), 'what' => $what, 'code' => $code]));
    foreach (q('SELECT * FROM {p}push_subs')->fetchAll() as $sub) {
        $now = new DateTimeImmutable('now', new DateTimeZone($sub['tz']));
        $day = $now->format('Y-m-d');
        if ((int)$now->format('G') < (int)$sub['hour'] || $sub['last_day'] === $day) continue;
        $done = fn() => q('UPDATE {p}push_subs SET last_day = ? WHERE id = ?', [$day, $sub['id']]);
        $msg = reminder_message((int)$sub['user_id'], $sub);
        if (!$msg) { $done(); $skipped++; $log($sub, 'nothing'); continue; }
        $code = push_send($sub, $msg);
        if ($code === 404 || $code === 410) { q('DELETE FROM {p}push_subs WHERE id = ?', [$sub['id']]); $removed++; }
        elseif ($code >= 200 && $code < 300) { $done(); $sent++; $log($sub, 'sent', $code); }
        else { $failed++; $log($sub, 'failed', $code); }   // Netz- oder Serverfehler: nächste Stunde nochmals versuchen
    }
    return ['sent' => $sent, 'nothing_due' => $skipped, 'removed' => $removed, 'failed' => $failed];
}
