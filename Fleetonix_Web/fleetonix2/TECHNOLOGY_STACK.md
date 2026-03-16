

2. Develop the system with the following tools and standards:

2.1 PHP
To be used for the development of the administrator's web-based interface and client web-based interface.

Version: PHP 7.4+ / PHP 8.x  
Usage:
- Server-side logic for admin and client dashboards
- RESTful API endpoints for Android app communication
- Session management and authentication
- Database operations and business logic

Key Libraries:
- PHPMailer (for email/OTP functionality)
- MySQLi (database connectivity)

2.2 MySQL
To serve as the primary relational database for storing and managing structured data such as user accounts, transactions, and reports.

Version: MySQL 5.7+ / MySQL 8.0+  
Usage:
- User accounts (admin, client, driver)
- Booking and schedule management
- GPS tracking data
- Activity logs and notifications
- OTP codes for authentication

2.3 HTML, CSS, and JavaScript
Usage:
- Frontend user interface for web system (admin and client dashboards)
- Form validation and user interactions
- Map integration (Mapbox GL JS for route visualization)
- Address autocomplete (LocationIQ API)
- Dynamic UI updates and AJAX requests

2.4 Kotlin (Android Development)
Version: Kotlin 1.9+  
Usage:
- Native Android application for drivers
- GPS location tracking
- Real-time trip management
- Push notifications and alerts

Framework: Jetpack Compose (Modern Android UI toolkit)

2.5 Android Libraries and Tools
Key Libraries:
- Retrofit - RESTful API client for HTTP requests
- Gson - JSON serialization/deserialization
- OkHttp - HTTP client with logging interceptor
- Google Play Services Location - GPS and location services
- Material Icons Extended - UI icons
- Jetpack Compose - Declarative UI framework
- Coroutines - Asynchronous programming

2.6 RESTful API Architecture
Protocol: HTTP/HTTPS  
Data Format: JSON (JavaScript Object Notation)  
Authentication: Session-based (Bearer token)  
Endpoints:
- Driver authentication and OTP verification
- Driver schedule/booking feed
- GPS location updates
- Trip management (start, pickup, dropoff, complete)
- Driver logout

2.7 Third-Party Services
- Mapbox - Maps and route visualization (Directions API, GL JS)
- LocationIQ - Geocoding and address autocomplete
- Gmail SMTP - Email delivery for OTP codes

2.8 Development Environment
- Web Server: XAMPP (Apache, MySQL, PHP)
- Android IDE: Android Studio
- Hosting: Hostinger (Production deployment)

2.9 Security Features
- Password hashing (bcrypt)
- Multi-Factor Authentication (MFA) with email OTP
- Session management
- Input validation and sanitization
- CORS handling for API endpoints
- HTTPS/SSL encryption

