<?php
/**
 * i leaf you: Wetter über den eigenen Server (Rückfall, falls das Handy Open-Meteo nicht direkt erreicht,
 * z. B. wegen eines Werbe- oder Tracking-Blockers). Liefert die Antwort von Open-Meteo unverändert.
 * GET ?lat=47.70&lon=8.63
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';
if (db_configured()) require_user();   // nur für angemeldete Nutzer, damit niemand den Server als Wetterdienst missbraucht

$lat = filter_var($_GET['lat'] ?? null, FILTER_VALIDATE_FLOAT);
$lon = filter_var($_GET['lon'] ?? null, FILTER_VALIDATE_FLOAT);
if ($lat === false || $lon === false || abs($lat) > 90 || abs($lon) > 180) fail(400, 'bad');

$ch = curl_init(sprintf('https://api.open-meteo.com/v1/forecast?latitude=%.2f&longitude=%.2f&daily=temperature_2m_min&current=temperature_2m&timezone=auto&forecast_days=8', $lat, $lon));
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
$body = curl_exec($ch);
$code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
if ($body === false || $code !== 200) fail(502, 'weather');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, max-age=1800');
echo $body;
