package com.prototype.fleetonix

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.Geocoder
import java.util.Locale
import android.os.Handler
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.app.PendingIntent
import android.os.HandlerThread
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.GeoPoint
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * LocationService is the backbone of the Fleetonix driver-side logic.
 * 
 * CORE FUNCTIONALITY:
 * 1. PERSISTENCE: Runs as a Foreground Service to ensure location updates continue even when 
 *    the application is minimized or the screen is off.
 * 2. SYNC: Pushes real-time coordinates, speed, and heading to the 'driver_locations' collection.
 * 3. PRESENCE: Periodically re-asserts the driver's 'online' status to the 'drivers' collection
 *    to prevent the Admin Dashboard from timing out the driver.
 * 4. TELEMATICS: Calculates G-Force and smooths speed data using a Kalman Filter (via TelematicsProcessor).
 */
class LocationService : Service() {

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var geofencingClient: GeofencingClient
    private var locationRequest: LocationRequest? = null
    private var locationCallback: LocationCallback? = null
    private lateinit var sensorManager: SensorManager
    private lateinit var wifiManager: WifiManager
    private val telematicsProcessor = TelematicsProcessor()
    private var wakeLock: PowerManager.WakeLock? = null
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var locationHandlerThread: HandlerThread // A4: Dedicated HandlerThread
    
    // Phase E: Connectivity
    private var commandListener: com.google.firebase.firestore.ListenerRegistration? = null
    private var currentListeningUid: String? = null

    // A5: Vehicle log throttling
    private var lastLoggedLocation: android.location.Location? = null
    private var lastLogTimestamp = 0L
    private val LOG_INTERVAL_MS = 30_000L
    private val LOG_MIN_DISTANCE_M = 50f


    private var totalDistanceMetres = 0f
    private var lastLocation: android.location.Location? = null
    private var driverUid: String = ""
    private var driverEmail: String = ""
    private val actualRoutePoints = mutableListOf<com.google.android.gms.maps.model.LatLng>()
    private var isTripActive = false
    
    // Telematics State
    private var currentGForce = 1.0 // Normalized Earth Gravity
    private var smoothedSpeed = 0.0
    private var currentWifiSsid: String = "Unknown"
    private var currentWifiRssi: Int = 0

    companion object {
        const val ACTION_LOCATION_UPDATE = "com.prototype.fleetonix.ACTION_LOCATION_UPDATE"
        const val EXTRA_LATITUDE = "extra_latitude"
        const val EXTRA_LONGITUDE = "extra_longitude"
        const val EXTRA_SPEED = "extra_speed"
        const val EXTRA_ACCURACY = "extra_accuracy"
        const val EXTRA_BEARING = "extra_bearing"
        const val EXTRA_DRIVER_ID = "extra_driver_id" // Legacy, keep for safety
        const val EXTRA_DRIVER_UID = "extra_driver_uid"
        const val EXTRA_DRIVER_EMAIL = "extra_driver_email"
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        
        const val ACTION_SET_GEOFENCE = "ACTION_SET_GEOFENCE"
        const val ACTION_CLEAR_GEOFENCES = "ACTION_CLEAR_GEOFENCES"
        const val ACTION_START_TRIP = "ACTION_START_TRIP"
        const val EXTRA_GEOFENCE_ID = "extra_geofence_id"
        const val EXTRA_TARGET_PHASE = "extra_target_phase"
        const val EXTRA_TOTAL_DISTANCE = "extra_total_distance"
        const val EXTRA_ROUTE_POLYLINE = "extra_route_polyline"
    }

    override fun onCreate() {
        super.onCreate()
        locationHandlerThread = HandlerThread("LocationCallbackThread").also { it.start() } // A4
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        geofencingClient = LocationServices.getGeofencingClient(this)
        
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                locationResult.lastLocation?.let { location ->
                    // 1. Telematics Processing (Kalman Filter for Speed Smoothing)
                    smoothedSpeed = telematicsProcessor.getSmoothedSpeed(location.speed)
                    updateWifiContext()

                    // 2. Calculate distance since last update
                    lastLocation?.let { last ->
                        val distance = last.distanceTo(location)
                        if (location.accuracy < 150) { // Relaxed to 150m for urban reliability
                            totalDistanceMetres += distance
                            
                            // Accumulate points for route visualization if trip is active
                            if (isTripActive) {
                                val newPoint = com.google.android.gms.maps.model.LatLng(location.latitude, location.longitude)
                                if (actualRoutePoints.isEmpty() || 
                                    GoogleMapsService.calculateDistance(actualRoutePoints.last(), newPoint) >= 10f) {
                                    actualRoutePoints.add(newPoint)
                                }
                            }
                        }
                    }
                    // lastLocation = location // Removed here, moved to end of outer block

                    // 3. Push to Firestore for Admin Dashboard (Real-time tracking)
                    if (driverEmail.isNotEmpty()) {
                        updateLocationInFirestore(driverEmail, location)
                        
                        // A5: Throttle vehicle_logs to save battery/data
                        if (shouldLogTelemetry(location)) {
                            pushToVehicleLogs(driverEmail, location)
                            lastLoggedLocation = location
                            lastLogTimestamp = System.currentTimeMillis()
                        }
                    }

                    // 4. Broadcast for internal UI (DriverDashboard)
                    val intent = Intent(ACTION_LOCATION_UPDATE).apply {
                        setPackage(packageName) // REQUIRED for RECEIVER_NOT_EXPORTED
                        putExtra(EXTRA_LATITUDE, location.latitude)
                        putExtra(EXTRA_LONGITUDE, location.longitude)
                        putExtra(EXTRA_SPEED, smoothedSpeed.toFloat()) // Use smoothed speed
                        putExtra(EXTRA_ACCURACY, location.accuracy)
                        putExtra(EXTRA_BEARING, location.bearing)
                        putExtra(EXTRA_TOTAL_DISTANCE, totalDistanceMetres)
                        putExtra(EXTRA_ROUTE_POLYLINE, GoogleMapsService.encodePolyline(actualRoutePoints))
                        putExtra("wifi_ssid", currentWifiSsid)
                    }
                    sendBroadcast(intent)
                    if (BuildConfig.DEBUG) {
                        Log.d("LocationService", "Processed Telematics: Speed=$smoothedSpeed G=$currentGForce Network=$currentWifiSsid")
                    }
                    lastLocation = location // Set after all calculations using the delta
                }
            }
        }
        
        setupSensors()
    }

    private var shakeDetector: ShakeDetector? = null

    private fun setupSensors() {
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        
        val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        accelerometer?.let {
            sensorManager.registerListener(sensorListener, it, SensorManager.SENSOR_DELAY_NORMAL)
            
            shakeDetector = ShakeDetector {
                Log.e("LocationService", "ShakeDetector triggered! Reporting accident incident.")
                if (driverEmail.isNotEmpty()) {
                    val email = driverEmail
                    serviceScope.launch {
                        try {
                            val db = FirebaseFirestore.getInstance()
                            
                            // 1. Update Driver Profile for Map Visibility
                            db.collection("drivers")
                                .whereEqualTo("driver_email", email)
                                .get()
                                .addOnSuccessListener { snapshot ->
                                    for (doc in snapshot.documents) {
                                        val driverId = doc.id
                                        val updateData = hashMapOf(
                                            "incident_active" to true,
                                            "incident_type" to "accident",
                                            "last_incident_at" to FieldValue.serverTimestamp()
                                        )
                                        doc.reference.update(updateData)
                                        
                                        // 2. Log incident with context for dispatch
                                        val incidentLog = hashMapOf(
                                            "driver_id" to driverId,
                                            "driver_email" to email,
                                            "incident_type" to "accident",
                                            "status" to "reported",
                                            "timestamp" to FieldValue.serverTimestamp()
                                        )
                                        
                                        // Attach location context if available
                                        lastLocation?.let { loc ->
                                            incidentLog["location"] = GeoPoint(loc.latitude, loc.longitude)
                                        }
                                        
                                        db.collection("incidents").add(incidentLog)
                                            .addOnSuccessListener {
                                                Log.d("LocationService", "Incident logged successfully")
                                            }
                                    }
                                }
                        } catch (e: Exception) {
                            Log.e("LocationService", "Failed to report shake incident", e)
                        }
                    }
                }
            }
            sensorManager.registerListener(shakeDetector, it, SensorManager.SENSOR_DELAY_NORMAL)
        }
    }

    private val sensorListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent?) {
            if (event?.sensor?.type == Sensor.TYPE_ACCELEROMETER) {
                currentGForce = telematicsProcessor.calculateGForce(event.values[0], event.values[1], event.values[2])
            }
        }
        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    private fun updateWifiContext() {
        try {
            val connectivityManager = applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
            val network = connectivityManager.activeNetwork
            val capabilities = connectivityManager.getNetworkCapabilities(network)
            
            if (capabilities != null) {
                if (capabilities.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR)) {
                    currentWifiSsid = "Mobile Data"
                    currentWifiRssi = -50 // Placeholder for good signal
                    return
                } else if (capabilities.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)) {
                    val connectionInfo = wifiManager.connectionInfo
                    val ssid = connectionInfo?.ssid?.replace("\"", "")
                    currentWifiSsid = if (ssid == null || ssid == "<unknown ssid>") "Connected" else ssid
                    currentWifiRssi = connectionInfo?.rssi ?: 0
                    return
                }
            }
            currentWifiSsid = "Offline"
            currentWifiRssi = 0
        } catch (e: Exception) {
            currentWifiSsid = "Restricted"
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val extraUid = intent?.getStringExtra(EXTRA_DRIVER_UID)
        val extraEmail = intent?.getStringExtra(EXTRA_DRIVER_EMAIL)
        val extraLegacyId = intent?.getStringExtra(EXTRA_DRIVER_ID)

        // Standardize: UID for profile/stats, Email for real-time map tracking
        if (extraUid != null) driverUid = extraUid.trim()
        if (extraEmail != null) driverEmail = extraEmail.lowercase().trim()
        
        // A7: Persist or Restore Identifiers
        if (driverUid.isNotEmpty() && driverEmail.isNotEmpty()) {
            getSharedPreferences("fleetonix_prefs", Context.MODE_PRIVATE).edit()
                .putString("driver_uid", driverUid)
                .putString("driver_email", driverEmail)
                .apply()
        } else {
            // Service restarted by OS with null intent — restore from prefs
            val prefs = getSharedPreferences("fleetonix_prefs", Context.MODE_PRIVATE)
            driverUid = prefs.getString("driver_uid", "") ?: ""
            driverEmail = prefs.getString("driver_email", "") ?: ""
        }

        if (driverEmail.isNotEmpty()) {
            Log.d("LocationService", "Tracking active for: $driverEmail [UID: ${driverUid.ifEmpty { "Restored" }}]")
            // Initialize command listener as soon as identifiers are resolved/restored
            initCommandListener()
        }

        when (intent?.action) {
            ACTION_START -> {
                if (wakeLock == null || !wakeLock!!.isHeld) {
                    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Fleetonix:LocationTrackingLock")
                    wakeLock?.acquire()
                }
                
                startLocationUpdates()
                PresenceManager.updateStatus(this@LocationService, true)
                Log.d("LocationService", "Service started: Driver $driverEmail is now ONLINE")
            }
            ACTION_STOP -> {
                actualRoutePoints.clear()
                PresenceManager.updateStatus(this@LocationService, false)
                
                // A6: stopForeground Deprecation Fix
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                } else {
                    @Suppress("DEPRECATION")
                    stopForeground(true)
                }
                
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_SET_GEOFENCE -> {
                val id = intent.getStringExtra(EXTRA_GEOFENCE_ID)
                val lat = intent.getDoubleExtra(EXTRA_LATITUDE, 0.0)
                val lng = intent.getDoubleExtra(EXTRA_LONGITUDE, 0.0)
                val phase = intent.getStringExtra(EXTRA_TARGET_PHASE)
                
                if (id != null && lat != 0.0 && lng != 0.0 && phase != null) {
                    addGeofence(id, lat, lng, phase)
                }
            }
            ACTION_CLEAR_GEOFENCES -> {
                clearGeofences()
            }
            ACTION_START_TRIP -> {
                totalDistanceMetres = 0f
                actualRoutePoints.clear()
                lastLocation = null
                isTripActive = true
                updateDriverStatus("on_trip")
                Log.d("LocationService", "Trip started, distance and route reset")
            }
        }


        createNotificationChannel()
        val notification: Notification = NotificationCompat.Builder(this, "LOCATION_CHANNEL_ID")
            .setContentTitle("Fleetonix")
            .setContentText("Fleetonix is actively tracking your route")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(1, notification)
        }

        return START_STICKY
    }

    private fun startLocationUpdates() {
        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000)
            .setMinUpdateIntervalMillis(2500)
            .build()

        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback!!,
                locationHandlerThread.looper // A4: Offload from MainThread
            )
        } catch (e: SecurityException) {
            Log.e("LocationService", "Location permission missing", e)
        }
    }

    override fun onDestroy() {
        Log.d("LocationService", "Destroying LocationService")
        
        // Phase E: Stop Command Listener
        commandListener?.remove()
        commandListener = null
        
        // Update presence with context
        PresenceManager.updateStatus(this, false)
        
        // A3: Unregister ShakeDetector to prevent leak
        shakeDetector?.let { sensorManager.unregisterListener(it) }
        
        // A4: Quit HandlerThread safely
        locationHandlerThread.quitSafely()

        // Release resources and cancel background tasks to prevent leaks
        serviceScope.cancel()
        
        // A1: Release WakeLock
        wakeLock?.let { lock -> 
            if (lock.isHeld) lock.release() 
        }
        wakeLock = null

        fusedLocationClient.removeLocationUpdates(locationCallback!!)
        sensorManager.unregisterListener(sensorListener)
        
        super.onDestroy()
    }
    
    private fun initCommandListener() {
        val uid = driverUid.ifEmpty { 
            getSharedPreferences("fleetonix_prefs", Context.MODE_PRIVATE)
                .getString("driver_uid", "") ?: ""
        }
        if (uid.isEmpty()) return
        
        // Prevent redundant registrations if already listening to the same UID
        if (commandListener != null && uid == currentListeningUid) {
            return
        }
        
        // Cleanup old listener if UID changed or we need a fresh start
        commandListener?.remove()
        currentListeningUid = uid
        
        val db = FirebaseFirestore.getInstance()
        commandListener = db.collection("drivers").document(uid)
            .addSnapshotListener { snapshot, e ->
                if (e != null) {
                    Log.w("LocationService", "Command listener failed", e)
                    return@addSnapshotListener
                }
                if (snapshot != null && snapshot.exists()) {
                    val command = snapshot.getString("command")
                    if (!command.isNullOrEmpty()) {
                        handleAdminCommand(command)
                        // Clear command after processing to avoid re-triggering
                        snapshot.reference.update("command", null)
                    }
                }
            }
        Log.d("LocationService", "Remote command listener active for $uid")
    }

    private fun handleAdminCommand(command: String) {
        Log.i("LocationService", "Executing Remote Admin Command: $command")
        when (command.lowercase()) {
            "ping", "refresh", "force_refresh" -> {
                // Force an immediate location update bypass
                lastLogTimestamp = 0
                fusedLocationClient.lastLocation.addOnSuccessListener { loc ->
                    loc?.let { updateLocationInFirestore(driverEmail, it) }
                }
            }
            "sos", "alert" -> {
                // Broadcast for UI notification
                val alertIntent = Intent("com.prototype.fleetonix.APP_NOTIFICATION")
                alertIntent.putExtra("title", "ADMIN ALERT")
                alertIntent.putExtra("message", "Priority message from Fleet Operations.")
                sendBroadcast(alertIntent)
            }
        }
    }


    override fun onTaskRemoved(rootIntent: Intent?) {
        // App was swiped away, but service is in foreground and should persist.
        // We log it but do NOT shut down or set to offline if the foreground service is active.
        Log.d("LocationService", "App swiped away, service persists in foreground")
        super.onTaskRemoved(rootIntent)
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    private fun updateDriverStatus(status: String) {
        val email = driverEmail.ifEmpty { return }
        val firestore = FirebaseFirestore.getInstance()
        
        // Query by email since drivers collection uses UID as document ID
        firestore.collection("drivers")
            .whereEqualTo("driver_email", email)
            .get()
            .addOnSuccessListener { snapshot ->
                for (doc in snapshot.documents) {
                    doc.reference.update("current_status", status)
                }
                Log.d("LocationService", "Driver status updated to $status for $email")
            }
            .addOnFailureListener { e ->
                Log.e("LocationService", "Failed to update driver status: ${e.message}")
            }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                "LOCATION_CHANNEL_ID",
                "Location Tracking",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(serviceChannel)
        }
    }

    /**
     * EXAMPLE FUNCTION: Write location data to Firestore with offline persistence capabilities.
     * Because FleetonixApplication initialized Firestore with PersistentCacheSettings,
     * this writes to the local cache immediately and automatically syncs to the backend 
     * once an internet connection is restored.
     * 
     * @param driverEmail The email for the driver (used for driver_locations doc ID).
     * @param location The Location object received from FusedLocationProviderClient.
     */
    private fun getAddressFromLocation(location: android.location.Location): String {
        return try {
            val geocoder = Geocoder(applicationContext, Locale.getDefault())
            val addresses = geocoder.getFromLocation(location.latitude, location.longitude, 1)
            var humanReadableAddress = "Lat: ${String.format(Locale.US, "%.4f", location.latitude)}, Lng: ${String.format(Locale.US, "%.4f", location.longitude)}"
            if (!addresses.isNullOrEmpty()) {
                val addr = addresses[0]
                val city = addr.locality ?: addr.subAdminArea ?: ""
                val thoroughfare = addr.thoroughfare ?: ""
                if (city.isNotEmpty() && thoroughfare.isNotEmpty()) {
                    humanReadableAddress = "$thoroughfare, $city"
                } else if (city.isNotEmpty()) {
                    humanReadableAddress = city
                } else if (thoroughfare.isNotEmpty()) {
                    humanReadableAddress = thoroughfare
                }
            }
            humanReadableAddress
        } catch (e: Exception) {
            Log.e("LocationService", "Geocoder failed", e)
            "GPS: ${location.latitude}, ${location.longitude}"
        }
    }

    private fun updateLocationInFirestore(driverEmail: String, location: android.location.Location) {
        val firestore = FirebaseFirestore.getInstance()
        val driverRef = firestore.collection("driver_locations").document(driverEmail)

        serviceScope.launch {
            val humanReadableAddress = getAddressFromLocation(location)

            val locationData = hashMapOf(
                "current_latitude" to location.latitude,
                "current_longitude" to location.longitude,
                "location_name" to humanReadableAddress,
                "current_speed" to smoothedSpeed,
                "current_heading" to location.bearing,
                "current_accuracy" to location.accuracy,
                "acceleration_g" to currentGForce,
                "wifi_ssid" to currentWifiSsid,
                "wifi_rssi" to currentWifiRssi,
                "is_background" to AppLifecycleObserver.isAppInBackground,
                "device_health" to mapOf(
                    "battery" to PresenceManager.getBatteryLevel(applicationContext),
                    "is_charging" to PresenceManager.isCharging(applicationContext),
                    "network" to PresenceManager.getNetworkType(applicationContext)
                ),
                "last_updated" to FieldValue.serverTimestamp()
            )

            // Ping presence with every location update to keep status active on dashboard
            PresenceManager.updateStatus(this@LocationService, true, AppLifecycleObserver.isAppInBackground)

            driverRef.set(locationData, SetOptions.merge())
                .addOnSuccessListener {
                    if (BuildConfig.DEBUG) {
                        Log.d("LocationService", "Pushed Enriched Telematics: G=$currentGForce Health Reported.")
                    }
                }
                .addOnFailureListener { e ->
                    Log.e("LocationService", "Error writing to driver_locations", e)
                }
                
            // Determine how to find the driver document (prefer UID, fallback to Email for migration)
            val driverColl = firestore.collection("drivers")
            val driverTask = if (driverUid.isNotEmpty()) {
                driverColl.document(driverUid).get().continueWithTask { task ->
                    val result = task.result
                    if (result != null && result.exists()) {
                        com.google.android.gms.tasks.Tasks.forResult(result)
                    } else {
                        // UID doc not found, check for legacy email doc
                        driverColl.whereEqualTo("driver_email", driverEmail).get().continueWith { 
                            it.result.documents.firstOrNull() 
                        }
                    }
                }
            } else {
                driverColl.whereEqualTo("driver_email", driverEmail).get().continueWith { it.result.documents.firstOrNull() }
            }

            driverTask.addOnSuccessListener { result ->
                val doc = if (result is DocumentSnapshot) result else result as? DocumentSnapshot
                if (doc != null && doc.exists()) {
                    // Auto-migrate if this is a legacy email-keyed document
                    if (doc.id == driverEmail && driverUid.isNotEmpty()) {
                        val legacyData = doc.data ?: hashMapOf()
                        driverColl.document(driverUid).set(legacyData).addOnSuccessListener {
                            doc.reference.delete()
                            Log.i("LocationService", "Migrated legacy driver doc [$driverEmail] -> UID [$driverUid]")
                        }
                    }

                    val updates = hashMapOf<String, Any>(
                        "current_location_name" to humanReadableAddress,
                        "location" to GeoPoint(location.latitude, location.longitude),
                        "status" to "online",
                        "lastSeen" to FieldValue.serverTimestamp(),
                        "last_updated" to FieldValue.serverTimestamp()
                    )
                    
                    // Increment continuous odometer if distance changed
                    lastLocation?.let { last ->
                        val distanceKm = last.distanceTo(location) / 1000.0
                        if (distanceKm > 0) {
                            updates["current_mileage"] = FieldValue.increment(distanceKm)
                        }
                    }
                    
                    doc.reference.update(updates)
                }
            }
        }
    }

    private fun shouldLogTelemetry(location: android.location.Location): Boolean {
        val now = System.currentTimeMillis()
        val timeSinceLast = now - lastLogTimestamp
        val distanceSinceLast = lastLoggedLocation?.distanceTo(location) ?: Float.MAX_VALUE
        return timeSinceLast >= LOG_INTERVAL_MS || distanceSinceLast >= LOG_MIN_DISTANCE_M
    }

    private fun pushToVehicleLogs(driverId: String, location: android.location.Location) {
        val firestore = FirebaseFirestore.getInstance()
        val logData = hashMapOf(
            "driver_id" to driverId,
            "latitude" to location.latitude,
            "longitude" to location.longitude,
            "raw_speed" to location.speed,
            "smoothed_speed" to smoothedSpeed,
            "speed_kmh" to (smoothedSpeed * 3.6),
            "heading" to location.bearing,
            "accuracy" to location.accuracy,
            "acceleration_g" to currentGForce,
            "wifi_ssid" to currentWifiSsid,
            "device_health" to mapOf(
                "battery" to PresenceManager.getBatteryLevel(applicationContext),
                "network" to PresenceManager.getNetworkType(applicationContext)
            ),
            "timestamp" to FieldValue.serverTimestamp()
        )

        firestore.collection("vehicle_logs")
            .add(logData)
            .addOnSuccessListener {
                if (BuildConfig.DEBUG) {
                    Log.d("LocationService", "Archived Telematics Log.")
                }
            }
            .addOnFailureListener { e ->
                Log.e("LocationService", "Error writing to vehicle_logs", e)
            }
    }

    private fun addGeofence(id: String, lat: Double, lng: Double, targetPhase: String) {
        val geofence = Geofence.Builder()
            .setRequestId(id)
            .setCircularRegion(lat, lng, 100f) // 100 meters
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
            .build()

        val request = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofence(geofence)
            .build()

        val intent = Intent(this, GeofenceBroadcastReceiver::class.java).apply {
            putExtra("targetPhase", targetPhase)
        }
        
        val pendingIntent = PendingIntent.getBroadcast(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )

        try {
            geofencingClient.addGeofences(request, pendingIntent).run {
                addOnSuccessListener {
                    Log.d("LocationService", "Geofence added for $id at $lat, $lng targeting $targetPhase")
                }
                addOnFailureListener { e ->
                    Log.e("LocationService", "Failed to add geofence", e)
                }
            }
        } catch (e: SecurityException) {
            Log.e("LocationService", "Background location permission missing", e)
        }
    }

    private fun clearGeofences() {
        val intent = Intent(this, GeofenceBroadcastReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
        geofencingClient.removeGeofences(pendingIntent)
        Log.d("LocationService", "All geofences cleared")
    }
}
