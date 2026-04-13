# FLEETONIX: THE SIMPLE SYSTEM GUIDE

This guide explains how Fleetonix works in plain English and tells you exactly which files handle each job.

---

## 1.0 Joining the Team (Sign-up & Approval)
**The Simple Explanation**: This is the process for a new driver to join. A driver sends their details to the "Big Boss" (Super Admin) for a background check. Once approved, a manager (Admin) picks a car and a schedule for them. The driver then gets a security code on their email to finish setting up their account.

### Where the code lives:
- **The Sign-up Screen**: `register.html` / `LoginScreen.kt`
- **The Security Code (OTP)**: `otp_verify.js`
- **The Manager's Approval Page**: `admin-approvals.js`

---

## 2.0 The Driver's App (Daily Work)
**The Simple Explanation**: This is the driver’s main tool on their phone. It tells the office exactly where they are on a map every few seconds and lets them clock in and out. It also has a "Safety Sensor"—if the driver’s phone shakes hard (like in a bump or accident), it sends an immediate emergency alert to the office.

### Where the code lives:
- **The Main Phone Dashboard**: `DriverDashboard.kt`
- **The GPS Tracker**: `LocationService.kt`
- **The "Safety Sensor" (Crash Alert)**: `ShakeDetector.kt`

---

## 3.0 The Office Map (Live Monitoring)
**The Simple Explanation**: This is a big map for the office manager. It shows every active driver as a blue dot. If a driver is currently picking up a passenger, or if there is an emergency, the dots change colors or start blinking so the manager knows exactly what's happening.

### Where the code lives:
- **The Visual Map**: `admin-dashboard.js`
- **The Live Dashboard**: `dashboard.html`

---

## 4.0 The Attendance Log (DTR)
**The Simple Explanation**: This is the system's "Time Card." It keeps a record of every time a driver starts and ends their shift. To make it easy for managers to read, it automatically turns messy GPS numbers into real names of places (like "Barangay 123, Manila") so they know exactly where the driver clocked in.

### Where the code lives:
- **The Attendance Page**: `dtr-monitoring.html`
- **The "Address Finder" Logic**: `admin-dtr-monitoring.js`

---

## 5.0 Managing Drivers & Cars
**The Simple Explanation**: This is like a "Digital Directory" of all staff. Managers can add new drivers, edit their info, or give them a profile picture. It also makes sure that a manager can't accidentally mark a driver as "Available" if the driver's phone is actually turned off.

### Where the code lives:
- **Staff List Page**: `drivers.html`
- **Updating Staff Info**: `admin-drivers.js`

---

## 6.0 Booking a Trip (Dispatching)
**The Simple Explanation**: When someone needs a ride, the manager creates a "Booking." They type in where to pick up the passenger and where to drop them off. The system then automatically sends a message to the driver's phone, which pops up in their "Assignments" list.

### Where the code lives:
- **Creating a Ride**: `admin-bookings.js`
- **The Driver's Assignment List**: `AssignmentsScreen.kt`

---

## 7.0 Past Trips & Excel Reports
**The Simple Explanation**: This is the system’s memory. It stores every trip that has ever happened. If a manager needs a paper copy for records, they can click a button to download a professional Excel spreadsheet that shows the driver, the passenger, and the start/end mileage.

### Where the code lives:
- **History List**: `admin-trip-tickets.js`
- **Excel Download Logic**: `export_utils.js`

---

## 8.0 Permissions & Safety (Who can do what?)
**The Simple Explanation**: This makes sure the right people have the right keys. A regular Admin can manage drivers, but only the "Super Admin" can do big things like resetting the whole system. These "Rules" are locked deep in the database so nobody can cheat the system.

### Where the code lives:
- **The Big Vault Rules**: `firestore.rules`
- **User Permission Logic**: `admin-users.js`

---

## 9.0 Shared Tracking Links
**The Simple Explanation**: Even if a passenger doesn't have the app, the driver can send them a special link. When the passenger clicks it, they can see the driver’s car moving on a map in real-time on their web browser, so they know when their ride will arrive.

### Where the code lives:
- **The Tracking Page**: `tracking.html`
- **The Tracking Logic**: `tracking.js`

---

## How it all connects
The system uses **Firebase** (a cloud service) to act as a "Messenger" between the office and the drivers.
- **The Database**: `DataModels.kt` (This file defines what a "Driver" or a "Trip" looks like to the computer).
- **The Helper**: `Utils.kt` (General tools that help both the phone and the web app talk to each other).
