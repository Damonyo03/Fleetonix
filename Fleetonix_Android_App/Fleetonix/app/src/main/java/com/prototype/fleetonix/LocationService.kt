package com.prototype.fleetonix

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.app.PendingIntent
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
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.location.Geocoder
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import android.hardware.SensorManager
import android.net.wifi.WifiManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo

class LocationService : Service() {

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var geofencingClient: GeofencingClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var sensorManager: SensorManager
    private lateinit var wifiManager: WifiManager
    private val telematicsProcessor = TelematicsProcessor()

    private var totalDistanceMetres = 0f
    private var lastLocation: android.location.Location? = null
    private var driverDocId: String? = null
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
        const val EXTRA_DRIVER_ID = "extra_driver_id"
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
                    lastLocation = location

                    // 3. Push to Firestore for Admin Dashboard (Real-time tracking)
                    driverDocId?.let { id ->
                        updateLocationInFirestore(id, location)
                        pushToVehicleLogs(id, location)
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
                Log.e("LocationService", "ShakeDetector triggered! Setting incident_active to true.")
                driverDocId?.let { email ->
                    CoroutineScope(Dispatchers.IO).launch {
                        try {
                            val db = FirebaseFirestore.getInstance()
                            db.collection("drivers")
                                .whereEqualTo("driver_email", email)
                                .get()
                                .addOnSuccessListener { snapshot ->
                                    for (doc in snapshot.documents) {
                                        doc.reference.update("incident_active", true)
                                    }
                                }
                        } catch (e: Exception) {
                            Log.e("LocationService", "Failed to update incident_active", e)
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
        val extraDriverId = intent?.getStringExtra(EXTRA_DRIVER_ID)
        if (extraDriverId != null) {
            driverDocId = extraDriverId.lowercase().trim()
            Log.d("LocationService", "Started tracking for driver email: $driverDocId")
        }

        when (intent?.action) {
            ACTION_START -> {
                PresenceManager.updateStatus(true)
                Log.d("LocationService", "Service started: Driver $driverDocId is now ONLINE")
            }
            ACTION_STOP -> {
                isTripActive = false
                actualRoutePoints.clear()
                PresenceManager.updateStatus(false)
                stopForeground(true)
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

        startLocationUpdates()

        return START_STICKY
    }

    private fun startLocationUpdates() {
        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000)
            .setMinUpdateIntervalMillis(2500)
            .build()

        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            )
        } catch (e: SecurityException) {
            Log.e("LocationService", "Location permission missing", e)
        }
    }

    override fun onDestroy() {
        PresenceManager.updateStatus(false)
        super.onDestroy()
        fusedLocationClient.removeLocationUpdates(locationCallback)
        sensorManager.unregisterListener(sensorListener)
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
        val email = driverDocId ?: return
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
     * @param driverDocId The document ID (or email depending on your structure) for the driver.
     * @param location The Location object received from FusedLocationProviderClient.
     */
    private fun updateLocationInFirestore(driverDocId: String, location: android.location.Location) {
        val firestore = FirebaseFirestore.getInstance()
        val driverRef = firestore.collection("driver_locations").document(driverDocId)

        CoroutineScope(Dispatchers.IO).launch {
            var humanReadableAddress = "Lat: ${String.format(Locale.US, "%.4f", location.latitude)}, Lng: ${String.format(Locale.US, "%.4f", location.longitude)}"
            try {
                val geocoder = Geocoder(applicationContext, Locale.getDefault())
                val addresses = geocoder.getFromLocation(location.latitude, location.longitude, 1)
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
            } catch (e: Exception) {
                Log.e("LocationService", "Geocoder failed", e)
            }

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
                "last_updated" to FieldValue.serverTimestamp()
            )

            // Also ping presence every few updates to keep status from going stale
            if (System.currentTimeMillis() % 10 == 0L) { // Periodic ping
                PresenceManager.updateStatus(true)
            }

            driverRef.set(locationData, SetOptions.merge())
                .addOnSuccessListener {
                    if (BuildConfig.DEBUG) {
                        Log.d("LocationService", "Pushed Enriched Telematics: G=$currentGForce SSID=$currentWifiSsid")
                    }
                }
                .addOnFailureListener { e ->
                    Log.e("LocationService", "Error writing to driver_locations", e)
                }
                
            firestore.collection("drivers").whereEqualTo("driver_email", driverDocId).get().addOnSuccessListener { snapshot ->
                for (doc in snapshot.documents) {
                    doc.reference.update("current_location_name", humanReadableAddress)
                }
            }
        }
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
