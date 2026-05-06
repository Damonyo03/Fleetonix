# Fleetonix System Technical Documentation

## 1. Executive Summary
Fleetonix is a comprehensive fleet management and driver tracking platform that bridges real-time telematic data from a mobile driver application to a centralized administrative web dashboard. Built on an offline-first, serverless architecture using Firebase, Fleetonix offers live GPS tracking, dynamic scheduling, automated daily time records (DTR), and emergency incident handling through intelligent sensor processing.

---

## 2. 📁 Project Structure Breakdown

The repository is modularized into distinct operational units:

```text
Fleetonix/
├── Fleetonix_Android_App/       # The Driver's Mobile Interface
│   └── app/src/main/java/.../fleetonix/
│       ├── DriverDashboard.kt   # Main UI and driver state management
│       ├── LocationService.kt   # Foreground service handling GPS and odometer sync
│       ├── TelematicsProcessor.kt # Smoothes erratic GPS data
│       ├── ShakeDetector.kt     # Hardware sensor listener for crash/accident detection
│       └── DataModels.kt        # Data structures for Firestore sync
├── web/                         # The Admin Web Dashboard
│   ├── admin/                   # Secure admin HTML views (dashboard, drivers, schedules)
│   ├── assets/js/               # Client-side logic for the web portal
│   │   ├── admin-dashboard.js   # Live map rendering and real-time state updates
│   │   ├── admin-bookings.js    # Dispatching and ride assignment logic
│   │   └── admin-dtr-monitoring.js # Attendance and reverse geocoding
│   └── ...                      # Public pages (login, tracking links, driver signup)
├── functions/                   # Firebase Cloud Functions (Backend compute)
│   └── audit_users.js           # Administrative tasks and auditing
├── firestore.rules              # Server-side database security policies and RBAC
└── firebase.json                # Firebase hosting and emulator configuration
```

---

## 3. ⚙️ Tech Stack Summary

- **Mobile Application (Driver Node):** Native Android (Kotlin), Google Maps SDK, Hardware Sensor API (Accelerometer).
- **Web Dashboard (Admin Node):** HTML5, CSS3, Vanilla JavaScript, Mapbox/Google Maps API for live tracking.
- **Backend & Database:** Firebase Authentication, Cloud Firestore (NoSQL), Cloud Storage, Cloud Functions.
- **Security:** Firebase Server-Side Security Rules (Role-Based Access Control).

---

## 4. 🧠 System Architecture Diagram

```mermaid
graph TD
    subgraph Driver Node [Driver Mobile App - Android/Kotlin]
        UI[Driver Dashboard UI]
        GPS[Location & Sensor Services]
        Off[Local Offline Cache]
        
        UI <--> GPS
        GPS <--> Off
    end

    subgraph Firebase Backend [Cloud Infrastructure]
        Auth[Firebase Authentication]
        FS[(Cloud Firestore NoSQL)]
        CF[Cloud Functions]
        Rule[Firestore Security Rules]
        
        Rule --> FS
        Auth --> Rule
    end

    subgraph Admin Node [Admin Web Dashboard - JS/HTML]
        AdminUI[Admin Dashboard]
        Map[Live Map Tracker]
        Reports[Excel/PDF Exporter]
    end
    
    subgraph Public Node [External]
        TrackLink[Public Tracking URL]
    end

    Off <-->|Real-time Sync / Offline Queueing| FS
    AdminUI <-->|Real-time Listeners| FS
    Map <--> FS
    CF --> FS
    TrackLink -.->|Read-Only| FS
```

---

## 5. 🔄 Data Flow Diagrams (DFD)

### Level 0 DFD (Context Diagram)

This high-level context diagram illustrates the Fleetonix system as a single process, showing how external entities (Drivers, Administrators, and Passengers) interact with the system as a whole. It highlights the primary inputs (telemetry, actions) and outputs (reports, updates).

```mermaid
graph LR
    Driver[Driver] -- Submits GPS, DTR, Incidents --> System[Fleetonix System]
    System -- Sends Schedules, Bookings --> Driver
    Admin[Administrator] -- Assigns Trips, Approves Accounts --> System
    System -- Provides Live Tracking, Reports --> Admin
    Passenger[Passenger] -- Views Tracking Link --> System
```

### Level 1 DFD (Core Processes)

This diagram breaks down the main system into its primary sub-systems (Authentication, Telemetry, Dispatch, and DTR). It maps the major data flows between the external entities, these core processes, and the central Firestore database, establishing a clearer view of internal routing.

```mermaid
graph TD
    D[Driver Mobile App]
    A[Admin Web Portal]
    P[Passenger Web Link]
    
    subgraph Fleetonix Backend Processes
        P1((1. Auth & Approval))
        P2((2. Live Telemetry))
        P3((3. Dispatch & Scheduling))
        P4((4. DTR & Billing))
    end
    
    DB[(Firestore Database)]
    
    D -- OTP / Login Details --> P1
    P1 -- Approved Token --> D
    A -- Approves Driver --> P1
    
    D -- GPS, Speed, G-Force --> P2
    P2 -- Updates /driver_locations --> DB
    A -- Reads Map Data --> P2
    P -- Reads Map Data --> P2
    
    A -- Creates Booking --> P3
    P3 -- Writes to /schedules --> DB
    P3 -- Notifies Driver --> D
    D -- Accepts/Completes Trip --> P3
    
    D -- Clocks In/Out --> P4
    P4 -- Writes to /dtr_logs --> DB
    A -- Exports Excel Reports --> P4
```

### Level 2 DFD (Process 2.0: Live Telemetry & Safety)

This diagram breaks down the specific technical flow of how raw hardware data is processed into actionable fleet tracking and emergency alerts.

```mermaid
graph TD
    Hardware[Driver Device Hardware]
    
    subgraph Mobile Telemetry Engine
        T1((2.1 Raw GPS Polling))
        T2((2.2 Kalman Smoothing))
        T3((2.3 Odometer Sync))
        S1((2.4 G-Force Sensing))
        S2((2.5 Shake Validation))
    end
    
    Cache[(Local SQLite/Cache)]
    DB[(Firestore)]
    AdminUI[Admin Live Map]
    
    Hardware -- "Lat/Lng Coords" --> T1
    T1 -- "Erratic GPS Data" --> T2
    T2 -- "Cleaned Location" --> T3
    T3 -- "Distance Increments" --> Cache
    T2 -- "Live Location" --> Cache
    
    Hardware -- "Accelerometer Spikes" --> S1
    S1 -- "Raw G-Force Data" --> S2
    
    Cache -- "If Online: Push" --> DB
    S2 -- "If Crash: Push Priority Alert" --> DB
    
    DB -- "Real-time Listeners" --> AdminUI
```

### Level 2 DFD (Process 3.0: Dispatch & Scheduling)

This details how trips are assigned and tracked through their entire lifecycle.

```mermaid
graph TD
    A[Admin]
    D[Driver App]
    
    subgraph Trip Lifecycle Engine
        D1((3.1 Create Booking))
        D2((3.2 Driver Assignment))
        D3((3.3 Trip Execution))
        D4((3.4 Completion & Logging))
    end
    
    DB[(Firestore)]
    
    A -- "Passenger & Route Info" --> D1
    D1 -- "New Document" --> DB
    DB -- "Trigger Notification" --> D2
    D2 -- "Displays Alert" --> D
    
    D -- "Accepts Trip" --> D3
    D3 -- "Update Phase: En Route" --> DB
    D -- "Starts Moving" --> D3
    D3 -- "Update Polyline & Odometer" --> DB
    
    D -- "Ends Trip" --> D4
    D4 -- "Finalize Odometer" --> DB
```

---

## 6. 🗄️ Database Schema (Entity Relationship Diagram)

The system relies on a heavily connected NoSQL document structure.

```mermaid
erDiagram
    USERS {
        string uid PK
        string full_name
        string role "super_admin, company_admin, admin"
        string status
    }
    DRIVERS {
        string driver_uid PK
        string current_status
        string current_trip_id FK
        float current_speed
        float current_mileage
        boolean is_currently_timed_in
    }
    DRIVER_LOCATIONS {
        string driver_uid PK
        float current_latitude
        float current_longitude
    }
    SCHEDULES {
        string docId PK
        string driver_uid FK
        string trip_phase
        float odometer_start
        float odometer_end
        string route_polyline
    }
    TRIP_TICKETS {
        string docId PK
        string driver_uid FK
        timestamp start_time
        timestamp end_time
    }
    DTR_LOGS {
        string docId PK
        string driver_uid FK
        timestamp time_in
        timestamp time_out
    }
    INCIDENTS {
        string docId PK
        string driver_uid FK
        string type "shake_alert, accident"
        timestamp time
    }

    USERS ||--o{ DRIVERS : manages
    DRIVERS ||--|| DRIVER_LOCATIONS : has_live
    DRIVERS ||--o{ SCHEDULES : assigned_to
    DRIVERS ||--o{ TRIP_TICKETS : generates
    DRIVERS ||--o{ DTR_LOGS : records
    DRIVERS ||--o{ INCIDENTS : triggers
```

---

## 7. 🔐 Authentication & Authorization Flow

The system employs strict **Server-Side Security Rules** using `firestore.rules`. Authorization is evaluated dynamically at the database layer before any read/write operation is executed.

```mermaid
sequenceDiagram
    participant D as Driver (Mobile)
    participant A as Admin (Web)
    participant Auth as Firebase Auth
    participant DB as Firestore (Rules)

    Note over D, DB: 1. Registration & Approval Flow
    D->>DB: Submits Signup Details (Status: Pending)
    A->>DB: Reviews & Approves Driver (Status: Active)
    D->>Auth: Logs in via OTP / Email
    Auth-->>D: Returns JWT Auth Token
    
    Note over D, DB: 2. Protected Data Write (e.g., GPS Update)
    D->>DB: Write {latitude, longitude} to /driver_locations/{uid}
    DB->>DB: Check Rule: isOwner() AND isSignedIn()
    DB-->>D: Permission Granted (Write Success)

    Note over D, DB: 3. Cross-Data Protection
    D->>DB: Attempt Write to /driver_locations/{other_uid}
    DB->>DB: Check Rule: isOwner() == False
    DB-->>D: PERMISSION_DENIED (Intercepted)
```

**Key Security Principles Implemented:**
- **`isAdmin()` Check:** Validators verify if the requesting user's UID corresponds to a document in the `users` collection with a valid admin role.
- **`isAuthorizedDriver()` Check:** Allows drivers to only modify documents assigned to them via `driver_uid` or `driver_email`.

---

## 8. 🧩 Module Breakdown & Explanations

1. **Live GPS & Telemetry Engine (`LocationService.kt`, `TelematicsProcessor.kt`)**
   - Runs as an Android Foreground Service, ensuring tracking persists even when the screen is off.
   - Applies a Kalman-inspired smoothing algorithm to filter out GPS noise and prevent erratic location jumps.
2. **Offline-First Synchronization (Firebase Persistence)**
   - If the driver enters a dead zone (e.g., a tunnel), DTR logs and trip milestones are cached locally. Once connectivity is restored, the queue is pushed to Firestore automatically.
3. **Hardware Shake Detection (`ShakeDetector.kt`)**
   - Listens to device accelerometer spikes. If a high G-force event is detected (indicative of a crash), an immediate "Priority 0" alert is dispatched to the admin dashboard.
4. **Real-time Odometer Sync (`LocationService.kt`)**
   - Calculates distance incrementally on the device and updates the `current_mileage` in Firestore, rendering manual odometer tampering impossible.
5. **Admin Dispatch & Live Mapping (`admin-dashboard.js`, `admin-bookings.js`)**
   - Admins can view driver statuses in real-time. Assigning a booking instantly propagates to the driver's assignment queue without needing a manual refresh.

---

## 9. 📌 Key Features

- **Real-Time Visibility:** 5-second interval GPS map updates for dispatchers.
- **Automated DTR:** Geofenced and timestamped attendance tracking.
- **Passenger Tracking Links:** Shareable URLs for external users to monitor driver ETA.
- **Emergency Management:** Automated crash detection via mobile hardware sensors.
- **Audit Trails & Exporting:** 1-click Excel downloading for trip histories and DTR.
- **Unbreakable Validation:** Database rules prevent data spoofing, cross-driver access, and unauthorized deletion.

---

## 10. 🧪 Suggested Improvements

1. **Scalability (Database Indexing)**
   - *Current State:* As historical `trip_tickets` and `dtr_logs` grow, large read operations may degrade dashboard load times.
   - *Solution:* Implement automated data archiving via Cloud Functions (moving data older than 6 months to Cold Storage/BigQuery) and utilize pagination cursors in the admin UI.
2. **Security (Token Revocation)**
   - *Current State:* Deactivated drivers may retain session access until their JWT token expires (up to 1 hour).
   - *Solution:* Implement Firebase Custom Claims and a token revocation check in Cloud Functions upon driver termination to force immediate logout.
3. **Structure (State Management)**
   - *Current State:* The Android app utilizes basic ViewModels and the Web app relies heavily on DOM manipulation with Vanilla JS.
   - *Solution:* Refactor the Web dashboard to use a reactive framework (React/Vue) or a global state manager to reduce complex DOM event listener chains. Update Android to utilize modern Jetpack Compose for UI.
4. **Resilience (Battery Optimization)**
   - *Current State:* The foreground service runs constant location updates, which drains battery life.
   - *Solution:* Implement dynamic geofencing and motion detection algorithms that pause high-frequency GPS polling when the device is completely stationary.
