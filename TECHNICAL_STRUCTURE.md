# Technical Project Structure - Fleetonix

This document provides a technical breakdown of the Fleetonix repository, mapping directories and major files to their specific roles in the ecosystem.

---

## 📂 Repository Root
| File/Folder | Description |
| :--- | :--- |
| `Fleetonix_Android_App/` | The source code for the Android Driver Application (Kotlin/Jetpack Compose). |
| `web/` | The administrative web dashboard for Admins and Super Admins. |
| `functions/` | Node.js Firebase Cloud Functions for backend logic and automated workflows. |
| `firestore.rules` | Security rules for the Firestore NoSQL database. |
| `storage.rules` | Security rules for Firebase Storage (Profile photos, etc.). |
| `project_structure.md` | Functional architecture and system process flow documentation. |

---

## 📱 1.0 Fleetonix Android App
Located at: `Fleetonix_Android_App/Fleetonix/app/src/main/java/com/prototype/fleetonix/`

### Core Components
- **`AuthFlow.kt`**: The authentication state machine. Manages OTP, First Login, and Approval states.
- **`DriverDashboard.kt`**: The main interface for active drivers; handles trip accepts, telemetry displays, and UI navigation.
- **`LocationService.kt`**: The background engine for high-frequency GPS tracking and Firestore synchronization.
- **`ShakeDetector.kt`**: Hardware sensor integration for automatic accident detection.
- **`PresenceManager.kt`**: Manages real-time "Online/Offline" status using Firebase Realtime Database.
- **`DataModels.kt`**: Shared Kotlin data classes for API responses and Firestore documents.

---

## 🖥️ 2.0 Admin Web Dashboard
Located at: `web/`

The dashboard is built as a modular application with HTML views in `web/admin/` and logic in `web/assets/js/`.

### Administrative Views (`web/admin/`)
- **`dashboard.html`**: The "Command Center" featuring the live map and global operational metrics.
- **`approvals.html`**: Exclusive gateway for Super Admins to authorize new Driver enrollments.
- **`trip-tickets.html`**: Historical ledger and Transparency Map viewer.
- **`dtr-monitoring.html`**: Driver time-tracking (Clock-in/Clock-out) logs.

### Logic & Assets (`web/assets/js/`)
- **`admin-trip-tickets.js`**: Logic for rendering unified transparency maps and GPS path comparisons.
- **`modules/export_utils.js`**: Advanced ExcelJS integration for generating official GCR-style reports.
- **`tracking.js`**: Real-time map coordinate smoothing and driver marker management.
- **`firebase-init.js`**: Centralized Firebase SDK initialization used across all pages.

---

## ⚙️ 3.0 Firebase Backend & Infrastructure

### Cloud Functions (`functions/`)
- **`index.js`**: Entry point for all secure backend logic:
    - `adminCreateUser`: Secure user provisioning.
    - `resetPasswordWithOTP`: Handles the security transition from OTP verification to Pending Approval.
- **`cleanup_stale_tickets.js`**: Scheduled cron jobs to maintain database health.

### Security Layer
- **NoSQL Rules**: `firestore.rules` enforces role-based access control, ensuring drivers can only see their own data while admins can monitor the entire fleet.
- **Blob Storage**: `storage.rules` protects assets like profile photos, ensuring owner-only isolation.

---

## 🛠️ Technology Stack
- **Frontend**: HTML5, Vanilla JavaScript, CSS3 (Custom Glassmorphism theme), Google Maps JavaScript API.
- **Mobile**: Kotlin 1.9+, Jetpack Compose, Material Design 3, Google Maps SDK for Android.
- **Backend**: Firebase Authentication, Cloud Firestore (Real-time NoSQL), Firebase Storage, Cloud Functions (Node.js).
- **Reporting**: ExcelJS for high-fidelity spreadsheet generation.
