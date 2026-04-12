# Project Structure & Functional Architecture - Fleetonix

**Fleetonix** is an advanced fleet management and real-time tracking system strictly operating with three distinct roles: **Super Admin**, **Admin**, and **Driver**. The system focuses on absolute transparency via 1:1 GPS telemetry matching and high-security driver onboarding.

---

## System Process Flow
This diagram illustrates the operational lifecycle of the system, from account creation to the final auditing of a trip.

```mermaid
sequenceDiagram
    participant SA as Super Admin
    participant A as Admin
    participant D as Driver App
    participant FS as Firestore/Backend

    Note over SA, FS: [ 1. Onboarding Phase ]
    A->>FS: 1.1 Create Driver Account
    D->>FS: 1.2 Driver OTP & Password Reset
    Note right of D: Status: Pending Approval
    SA->>FS: 1.3 Approve Enrollment
    Note right of D: Status: Active

    Note over SA, FS: [ 2. Operational Phase ]
    A->>FS: 2.1 Create Trip/Booking
    A->>FS: 2.2 Assign Driver & Publish
    D->>FS: 2.3 Accept Assignment
    D->>FS: 2.4 Start Trip (Live GPS ON)
    
    Note over SA, FS: [ 3. Safety & Audit Phase ]
    D-->>A: 3.1 Real-time Location/Speed
    D->>A: 3.2 Shake Alert (Accident Event)
    D->>FS: 3.3 Complete Trip (Actual Path)
    A->>SA: 3.4 Export Transparency Report
```

---

## 1.0 Accounts & Access Module
Responsible for the secure multi-stage onboarding process required for all personnel.

```mermaid
graph TD
    A[1.0 Accounts] --> B[1.1 Role-Based Auth]
    A --> C[1.2 3-Step Verification]
    A --> D[1.3 User Management]
    
    B --> B1[1.1.1 Super Admin: Full Access]
    B --> B2[1.1.2 Admin: Fleet Ops]
    B --> B3[1.1.3 Driver: Mobile Feed]
    
    C --> C1[1.2.1 OTP Verification]
    C --> C2[1.2.2 Force Password Reset]
    C --> C3[1.2.3 Super Admin Approval]
```

---

## 2.0 Command Center (Admin/Super Admin)
The web-based nerve center for monitoring the entire fleet and managing logistics.

```mermaid
graph TD
    A[2.0 Command Center] --> B[2.1 Live Monitoring]
    A --> C[2.2 Trip Management]
    A --> D[2.3 Enrollment Control]
    A --> E[2.4 Telemetry Audits]
    
    B --> B1[2.1.1 Blinking Incident Indicators]
    B --> B2[2.1.2 ETA & Speed Tracking]
    
    C --> C1[2.2.1 Multi-Segment Booking]
    C --> C2[2.2.2 Real-time Assigning]
    
    E --> E1[2.3.1 Trip Transparency Map]
    E --> E2[2.3.2 Odometer/Excel Export]
```

---

## 3.0 Driver Application Module
The high-frequency telemetry source used by drivers to manage assignments and safety.

```mermaid
graph TD
    A[3.0 Driver App] --> B[3.1 Assignment Feed]
    A --> C[3.2 Navigation Core]
    A --> D[3.3 Incident Reporting]
    
    C --> C1[3.2.1 Start/Stop Telemetry]
    C --> C2[3.2.2 Live Odometer Sync]
    
    D --> D1[3.3.1 Shake-to-Report Detection]
    D --> D2[3.3.2 Manual Panic Signal]
```

---

## Project Capabilities and Limitations

### A. COMMAND CENTER (Capabilities)
1. **Dynamic Fleet Control**: Real-time management of driver shifts, assignments, and work hours with immediate publish capabilities.
2. **"God-View" Monitoring**: High-frequency map updates showing every driver's precise position, speed, and heading.
3. **High-Security Onboarding**: Mandatory OTP and Password Reset for all users, followed by a hard-block until a Super Admin approves the account.
4. **Automated Incident Response**: Real-time listening for accident events (Shake Detection) with intrusive visual alerts in the command center.
5. **Absolute Trip Transparency**: A specialized map feature that renders the **exact path** traveled by the driver, mathematical proof of trip completion without relying on signatures.
6. **Unified Reporting**: Exporting historical DTR and Trip Ticket data to formatted Excel files for official documentation.

### B. LIMITATIONS
1. **Telemetry Continuity**: GPS tracking and live map updates require persistent cellular data (LTE/5G).
2. **Sensor Calibration**: Automatic accident detection requires a functional accelerometer on the driver's mobile device.
3. **Geolocation Drift**: In extremely dense urban areas, path rendering may show minor deviations (urban canyons).
