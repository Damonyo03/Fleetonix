<?php
/**
 * Fleettonix - Address Search API
 * LocationIQ autocomplete for Philippine addresses
 */

header('Content-Type: application/json');

$query = isset($_GET['q']) ? trim($_GET['q']) : '';
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;

if (strlen($query) < 2) {
    echo json_encode([]);
    exit;
}

// LocationIQ API Token (public token provided by user)
$locationiq_token = 'pk.0b57c3a80ea3c7893de95270b2a3ad50';

// LocationIQ Autocomplete endpoint
$url = sprintf(
    'https://us1.locationiq.com/v1/autocomplete.php?key=%s&q=%s&limit=%d&dedupe=1&normalizecity=1&countrycodes=ph',
    $locationiq_token,
    urlencode($query),
    $limit
);

// Initialize cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Connection: keep-alive',
    'Accept-Encoding: gzip'
]);
curl_setopt($ch, CURLOPT_ENCODING, 'gzip');

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curl_error = curl_error($ch);
curl_close($ch);

if ($http_code !== 200 || !$response || $curl_error) {
    error_log("LocationIQ API Error: HTTP $http_code - $curl_error");
    echo json_encode([]);
    exit;
}

$data = json_decode($response, true);

if (!is_array($data) || empty($data)) {
    echo json_encode([]);
    exit;
}

$results = [];

foreach ($data as $entry) {
    $display_name = $entry['display_name'] ?? '';
    $lat = isset($entry['lat']) ? (float)$entry['lat'] : 0;
    $lng = isset($entry['lon']) ? (float)$entry['lon'] : 0;
    $address = $entry['address'] ?? [];

    $house_number = $address['house_number'] ?? '';
    $street = $address['road'] ?? ($address['neighbourhood'] ?? '');
    $city = $address['city'] ?? ($address['town'] ?? ($address['municipality'] ?? ($address['county'] ?? '')));
    $province = $address['state'] ?? ($address['region'] ?? ($address['province'] ?? ''));
    $zip_code = $address['postcode'] ?? '';

    // Determine region category for grouping
    $region_category = 'Philippines';
    $place_lower = strtolower($display_name);

    if (stripos($display_name, 'Metro Manila') !== false || stripos($display_name, 'NCR') !== false ||
        stripos($display_name, 'Manila') !== false || stripos($display_name, 'Makati') !== false ||
        stripos($display_name, 'Quezon City') !== false || stripos($display_name, 'Pasig') !== false ||
        stripos($display_name, 'Taguig') !== false || stripos($display_name, 'Mandaluyong') !== false ||
        stripos($display_name, 'Pasay') !== false || stripos($display_name, 'Parañaque') !== false ||
        stripos($display_name, 'Las Piñas') !== false || stripos($display_name, 'Muntinlupa') !== false ||
        stripos($display_name, 'Marikina') !== false || stripos($display_name, 'Caloocan') !== false ||
        stripos($display_name, 'Malabon') !== false || stripos($display_name, 'Navotas') !== false ||
        stripos($display_name, 'Valenzuela') !== false || stripos($display_name, 'San Juan') !== false) {
        $region_category = 'NCR';
    } elseif (stripos($display_name, 'Pampanga') !== false || stripos($display_name, 'Angeles') !== false ||
        stripos($display_name, 'San Fernando') !== false || stripos($display_name, 'Mabalacat') !== false) {
        $region_category = 'Pampanga';
    } elseif (stripos($display_name, 'Cavite') !== false || stripos($display_name, 'Laguna') !== false ||
        stripos($display_name, 'Batangas') !== false || stripos($display_name, 'Quezon') !== false ||
        stripos($display_name, 'Tagaytay') !== false || stripos($display_name, 'Calamba') !== false ||
        stripos($display_name, 'Santa Rosa') !== false || stripos($display_name, 'Los Baños') !== false) {
        $region_category = 'South Luzon';
    }

    $full_address = $display_name;
    if (!empty($house_number) && !empty($street)) {
        $full_address = trim($house_number . ' ' . $street);
        $remaining = [];
        foreach (['suburb', 'city', 'town', 'state', 'postcode', 'country'] as $component) {
            if (!empty($address[$component])) {
                $remaining[] = $address[$component];
            }
        }
        if (!empty($remaining)) {
            $full_address .= ', ' . implode(', ', $remaining);
        }
    }

    $results[] = [
        'address' => $full_address,
        'place_name' => $display_name,
        'lat' => $lat,
        'lng' => $lng,
        'region' => $region_category,
        'province' => $province ?: $region_category,
        'city' => $city,
        'house_number' => $house_number,
        'street' => $street,
        'zip_code' => $zip_code
    ];
}

echo json_encode($results);

