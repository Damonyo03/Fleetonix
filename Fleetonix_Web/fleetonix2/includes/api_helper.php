<?php
/**
 * Fleettonix - API Helper Functions
 * Standardized response handling for all API endpoints
 */

/**
 * Send standardized JSON response
 * 
 * @param bool $success Whether the request was successful
 * @param string $message Response message
 * @param mixed $data Response data (optional)
 * @param int $code HTTP status code
 * @param array $errors Validation errors (optional)
 */
function apiRespond($success, $message, $data = null, $code = 200, $errors = null) {
    // Set headers
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    
    // Set HTTP status code
    http_response_code($code);
    
    // Build response
    $response = [
        'success' => $success,
        'message' => $message,
        'timestamp' => date('c') // ISO 8601 format
    ];
    
    // Add data if provided
    if ($data !== null) {
        $response['data'] = $data;
    }
    
    // Add errors if provided
    if ($errors !== null && is_array($errors)) {
        $response['errors'] = $errors;
    }
    
    // Output JSON and exit
    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

/**
 * Send success response
 */
function apiSuccess($message, $data = null, $code = 200) {
    apiRespond(true, $message, $data, $code);
}

/**
 * Send error response
 */
function apiError($message, $code = 400, $errors = null) {
    apiRespond(false, $message, null, $code, $errors);
}

/**
 * Handle OPTIONS request (CORS preflight)
 */
function handleCorsPreflight() {
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        header('Access-Control-Max-Age: 3600');
        http_response_code(204);
        exit;
    }
}

/**
 * Validate required fields
 * 
 * @param array $data Input data
 * @param array $required Required field names
 * @return array|null Array of errors or null if valid
 */
function validateRequired($data, $required) {
    $errors = [];
    
    foreach ($required as $field) {
        if (!isset($data[$field]) || trim($data[$field]) === '') {
            $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . ' is required';
        }
    }
    
    return empty($errors) ? null : $errors;
}

/**
 * Validate email format
 */
function validateEmailFormat($email) {
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

/**
 * Validate phone number (Philippines format)
 */
function validatePhoneFormat($phone) {
    $cleaned = preg_replace('/\D/', '', $phone);
    return preg_match('/^(09|\+639)\d{9}$/', $cleaned);
}

/**
 * Get JSON input from request body
 * 
 * @return array Decoded JSON data
 */
function getJsonInput() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        apiError('Invalid JSON format: ' . json_last_error_msg(), 400);
    }
    
    return $data ?: [];
}

/**
 * Get request data (JSON or POST)
 */
function getRequestData() {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    
    if (strpos($contentType, 'application/json') !== false) {
        return getJsonInput();
    }
    
    return $_POST;
}

/**
 * Sanitize string input
 */
function sanitizeInput($input) {
    if (is_array($input)) {
        return array_map('sanitizeInput', $input);
    }
    return htmlspecialchars(trim($input), ENT_QUOTES, 'UTF-8');
}

/**
 * Validate session token from Authorization header or query parameter
 */
function validateApiSession() {
    $token = null;
    
    // Check Authorization header
    $headers = getallheaders();
    if (isset($headers['Authorization'])) {
        $authHeader = $headers['Authorization'];
        if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            $token = $matches[1];
        }
    }
    
    // Check query parameter
    if (!$token && isset($_GET['session_token'])) {
        $token = $_GET['session_token'];
    }
    
    if (!$token) {
        apiError('Session token required', 401);
    }
    
    // Validate token (check if session exists)
    session_id($token);
    session_start();
    
    if (!isset($_SESSION['user_id']) || !isset($_SESSION['user_type'])) {
        apiError('Invalid or expired session token', 401);
    }
    
    return [
        'user_id' => $_SESSION['user_id'],
        'user_type' => $_SESSION['user_type'],
        'session_token' => $token
    ];
}

/**
 * Log API error for debugging
 */
function logApiError($endpoint, $message, $data = null) {
    $logData = [
        'endpoint' => $endpoint,
        'message' => $message,
        'data' => $data,
        'timestamp' => date('Y-m-d H:i:s'),
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
    ];
    
    error_log('API Error: ' . json_encode($logData));
}

