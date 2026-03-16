-- ============================================
-- Fleettonix - Fleet Management System
-- Database: jettsan
-- ============================================

-- Create database
CREATE DATABASE IF NOT EXISTS jettsan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE jettsan;

-- ============================================
-- USERS TABLE
-- Stores all users: Admin, Client, Driver
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    user_type ENUM('admin', 'client', 'driver') NOT NULL,
    phone VARCHAR(20),
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_user_type (user_type),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DRIVERS TABLE
-- Extended information for drivers
-- ============================================
CREATE TABLE IF NOT EXISTS drivers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    license_number VARCHAR(50),
    license_expiry DATE,
    vehicle_assigned VARCHAR(100),
    plate_number VARCHAR(20),
    current_status ENUM('available', 'on_schedule', 'in_progress', 'offline') DEFAULT 'offline',
    current_latitude DECIMAL(10, 8) NULL,
    current_longitude DECIMAL(11, 8) NULL,
    last_location_update TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (current_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- CLIENTS TABLE
-- Extended information for clients
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    company_name VARCHAR(255),
    address TEXT,
    contact_person VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- BOOKINGS TABLE
-- Client booking requests
-- ============================================
CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    pickup_location VARCHAR(255) NOT NULL,
    pickup_latitude DECIMAL(10, 8) NOT NULL,
    pickup_longitude DECIMAL(11, 8) NOT NULL,
    dropoff_location VARCHAR(255) NOT NULL,
    dropoff_latitude DECIMAL(10, 8) NOT NULL,
    dropoff_longitude DECIMAL(11, 8) NOT NULL,
    return_to_pickup TINYINT(1) NOT NULL DEFAULT 0,
    return_pickup_time TIME NULL,
    booking_date DATE NOT NULL,
    booking_time TIME NOT NULL,
    number_of_passengers INT DEFAULT 1,
    special_instructions TEXT,
    status ENUM('pending', 'approved', 'assigned', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    INDEX idx_client_id (client_id),
    INDEX idx_status (status),
    INDEX idx_booking_date (booking_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- SCHEDULES TABLE
-- Driver schedules assigned by admin
-- ============================================
CREATE TABLE IF NOT EXISTS schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    driver_id INT NOT NULL,
    pickup_location VARCHAR(255) NOT NULL,
    pickup_latitude DECIMAL(10, 8) NOT NULL,
    pickup_longitude DECIMAL(11, 8) NOT NULL,
    dropoff_location VARCHAR(255) NOT NULL,
    dropoff_latitude DECIMAL(10, 8) NOT NULL,
    dropoff_longitude DECIMAL(11, 8) NOT NULL,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    status ENUM('pending', 'started', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
    trip_phase ENUM('pending', 'pickup', 'dropoff', 'return_pickup', 'ready_to_complete', 'completed') DEFAULT 'pending',
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    estimated_arrival_time TIME NULL,
    actual_arrival_time TIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
    INDEX idx_driver_id (driver_id),
    INDEX idx_booking_id (booking_id),
    INDEX idx_status (status),
    INDEX idx_scheduled_date (scheduled_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- GPS_TRACKING TABLE
-- Real-time GPS tracking data
-- ============================================
CREATE TABLE IF NOT EXISTS gps_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    driver_id INT NOT NULL,
    schedule_id INT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    speed DECIMAL(5, 2) NULL,
    heading DECIMAL(5, 2) NULL,
    accuracy DECIMAL(5, 2) NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL,
    INDEX idx_driver_id (driver_id),
    INDEX idx_schedule_id (schedule_id),
    INDEX idx_recorded_at (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DRIVER_ACTIVITY TABLE
-- Logs driver activities for performance monitoring
-- ============================================
CREATE TABLE IF NOT EXISTS driver_activity (
    id INT AUTO_INCREMENT PRIMARY KEY,
    driver_id INT NOT NULL,
    schedule_id INT NULL,
    activity_type ENUM('schedule_started', 'pickup_completed', 'dropoff_completed', 'return_pickup_completed', 'schedule_completed', 'location_update', 'face_verification') NOT NULL,
    description TEXT,
    location_latitude DECIMAL(10, 8) NULL,
    location_longitude DECIMAL(11, 8) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL,
    INDEX idx_driver_id (driver_id),
    INDEX idx_schedule_id (schedule_id),
    INDEX idx_activity_type (activity_type),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- NOTIFICATIONS TABLE
-- System notifications for users
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_is_read (is_read),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- INSERT DEFAULT ADMIN USER
-- Default admin credentials (change after first login!)
-- Email: aisenaldersonquia05@gmail.com
-- Password: admin123
-- ============================================
INSERT INTO users (email, password, full_name, user_type, status) 
VALUES ('aisenaldersonquia05@gmail.com', '$2y$10$r/ZeSkqtG7Ai8dSuH37tbO3E9vuiEOC9Vsf4wqYKnkaPkw8SByhLO', 'System Administrator', 'admin', 'active')
ON DUPLICATE KEY UPDATE password = '$2y$10$r/ZeSkqtG7Ai8dSuH37tbO3E9vuiEOC9Vsf4wqYKnkaPkw8SByhLO';

-- Note: Default password is 'admin123' (hashed with bcrypt)
-- Please change this password immediately after first login!

-- ============================================
-- ADDITIONAL PERFORMANCE INDEXES
-- These indexes improve query performance for common operations
-- ============================================

-- Users table - additional indexes
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Drivers table - additional indexes
CREATE INDEX IF NOT EXISTS idx_drivers_last_location_update ON drivers(last_location_update);
CREATE INDEX IF NOT EXISTS idx_drivers_location ON drivers(current_latitude, current_longitude);

-- Bookings table - additional indexes
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_client_status ON bookings(client_id, status);

-- Schedules table - additional indexes
CREATE INDEX IF NOT EXISTS idx_schedules_trip_phase ON schedules(trip_phase);
CREATE INDEX IF NOT EXISTS idx_schedules_completed_at ON schedules(completed_at);
CREATE INDEX IF NOT EXISTS idx_schedules_date_time ON schedules(scheduled_date, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_schedules_status_phase ON schedules(status, trip_phase);
CREATE INDEX IF NOT EXISTS idx_schedules_driver_status_phase ON schedules(driver_id, status, trip_phase);

-- GPS Tracking table - additional composite index
CREATE INDEX IF NOT EXISTS idx_gps_driver_schedule ON gps_tracking(driver_id, schedule_id);

-- Driver Activity table - additional composite index
CREATE INDEX IF NOT EXISTS idx_activity_driver_schedule ON driver_activity(driver_id, schedule_id);
CREATE INDEX IF NOT EXISTS idx_activity_schedule_type ON driver_activity(schedule_id, activity_type);

-- Notifications table - additional composite index
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);



-- ============================================
-- OTP CODES TABLE
-- Stores OTP codes for MFA authentication
-- ============================================
CREATE TABLE IF NOT EXISTS otp_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    email VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_otp_code (otp_code),
    INDEX idx_expires_at (expires_at),
    INDEX idx_is_used (is_used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ACCIDENT REPORTS TABLE
-- Stores accident reports from drivers
-- ============================================
CREATE TABLE IF NOT EXISTS accident_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    driver_id INT NOT NULL,
    schedule_id INT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    description TEXT,
    status ENUM('reported', 'acknowledged', 'resolved') DEFAULT 'reported',
    reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP NULL,
    resolved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL,
    INDEX idx_driver_id (driver_id),
    INDEX idx_schedule_id (schedule_id),
    INDEX idx_status (status),
    INDEX idx_reported_at (reported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- VEHICLE ISSUES TABLE
-- Stores vehicle issue reports from drivers
-- ============================================
CREATE TABLE IF NOT EXISTS vehicle_issues (
    id INT AUTO_INCREMENT PRIMARY KEY,
    driver_id INT NOT NULL,
    schedule_id INT NULL,
    issue_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    status ENUM('reported', 'acknowledged', 'resolved') DEFAULT 'reported',
    reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP NULL,
    resolved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL,
    INDEX idx_driver_id (driver_id),
    INDEX idx_schedule_id (schedule_id),
    INDEX idx_status (status),
    INDEX idx_issue_type (issue_type),
    INDEX idx_reported_at (reported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

