<?php
/**
 * i leaf you: Fälligkeiten auf dem Server berechnen und Erinnerungstexte bauen.
 * Gleiche Regeln wie dueOn() in js/app.js, gerechnet in der Zeitzone des Geräts.
 * Texte der Benachrichtigungen stehen hier (Server-seitig), nicht in i18n.js.
 */
declare(strict_types=1);

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

/** Nachricht für ein Abo, null wenn nichts fällig ist (ausser bei der Probe) */
function reminder_message(int $userId, array $sub, bool $test = false): ?array {
    $row = q('SELECT data FROM {p}states WHERE user_id = ?', [$userId])->fetchColumn();
    $state = $row ? (json_decode((string)$row, true) ?: []) : [];
    $lang = in_array($state['lang'] ?? '', ['de', 'en', 'es', 'fr'], true) ? $state['lang'] : 'de';
    $T = PUSH_TEXT[$lang];
    $tasks = due_tasks($state, new DateTimeZone($sub['tz']));
    if (!$tasks && !$test) return null;
    if ($tasks) {
        $items = array_map(fn($x) => $x[0] . ': ' . $T[$x[1]], array_slice($tasks, 0, 3));
        $list = implode(' · ', $items);
        if (count($tasks) > 3) $list = str_replace(['{list}', '{n}'], [$list, count($tasks) - 3], $T['more']);
        $body = str_replace('{list}', $list, $T['today']);
    } else {
        $body = str_replace('{hour}', (string)$sub['hour'], $T['test']);
    }
    if ($test && $tasks) $body .= "\n" . str_replace('{hour}', (string)$sub['hour'], $T['test']);
    return ['title' => 'i leaf you', 'body' => $body, 'tag' => 'ileafyou-due', 'url' => './'];
}

/** Täglicher Versand: alle Abos, deren Uhrzeit erreicht ist und die heute noch nichts bekommen haben */
function run_reminders(): array {
    $sent = 0; $skipped = 0; $removed = 0; $failed = 0;
    foreach (q('SELECT * FROM {p}push_subs')->fetchAll() as $sub) {
        $now = new DateTimeImmutable('now', new DateTimeZone($sub['tz']));
        $day = $now->format('Y-m-d');
        if ((int)$now->format('G') < (int)$sub['hour'] || $sub['last_day'] === $day) continue;
        $done = fn() => q('UPDATE {p}push_subs SET last_day = ? WHERE id = ?', [$day, $sub['id']]);
        $msg = reminder_message((int)$sub['user_id'], $sub);
        if (!$msg) { $done(); $skipped++; continue; }
        $code = push_send($sub, $msg);
        if ($code === 404 || $code === 410) { q('DELETE FROM {p}push_subs WHERE id = ?', [$sub['id']]); $removed++; }
        elseif ($code >= 200 && $code < 300) { $done(); $sent++; }
        else $failed++;   // Netz- oder Serverfehler: nächste Stunde nochmals versuchen
    }
    return ['sent' => $sent, 'nothing_due' => $skipped, 'removed' => $removed, 'failed' => $failed];
}
