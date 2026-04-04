<?php
/**
 * Fleettonix - Company Handler
 * Processes Add and Edit actions for accredited companies
 */

session_start();
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin_functions.php';

// Require super_admin access
requireUserType('super_admin');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = isset($_POST['action']) ? $_POST['action'] : '';
    $name = isset($_POST['name']) ? trim($_POST['name']) : '';
    $id = isset($_POST['id']) ? intval($_POST['id']) : 0;
    $status = isset($_POST['status']) ? $_POST['status'] : 'active';

    if (empty($name)) {
        $_SESSION['error'] = 'Company name is required';
        header('Location: companies.php');
        exit;
    }

    if ($action === 'add') {
        if (addAccreditedCompany($name)) {
            $_SESSION['success'] = 'Company added successfully!';
        } else {
            $_SESSION['error'] = 'Failed to add company. Name might already exist.';
        }
    } elseif ($action === 'edit' && $id > 0) {
        if (updateAccreditedCompany($id, $name, $status)) {
            $_SESSION['success'] = 'Company updated successfully!';
        } else {
            $_SESSION['error'] = 'Failed to update company.';
        }
    }

    header('Location: companies.php');
    exit;
} else {
    header('Location: companies.php');
    exit;
}
