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

class LocationService : Service() {

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var geofencingClient: GeofencingClient
    private lateinit var locationCallback: LocationCallback

    companion object {
        const val ACTION_LOCATION_UPDATE = "com.prototype.fleetonix.ACTION_LOCATION_UPDATE"
        const val EXTRA_LATITUDE = "extra_latitude"
        const val EXTRA_LONGITUDE = "extra_longitude"
        const val EXTRA_SPEED = "extra_speed"
        const val EXTRA_ACCURACY = "extra_accuracy"
        const val EXTRA_BEARING = "extra_bearing"
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        
        const val ACTION_SET_GEOFENCE = "ACTION_SET_GEOFENCE"
        const val ACTION_CLEAR_GEOFENCES = "ACTION_CLEAR_GEOFENCES"
        const val EXTRA_GEOFENCE_ID = "extra_geofence_id"
        const val EXTRA_TARGET_PHASE = "extra_target_phase"
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        geofencingClient = LocationServices.getGeofencingClient(this)
        
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                locationResult.lastLocation?.let { location ->
                    val intent = Intent(ACTION_LOCATION_UPDATE).apply {
                        putExtra(EXTRA_LATITUDE, location.latitude)
                        putExtra(EXTRA_LONGITUDE, location.longitude)
                        putExtra(EXTRA_SPEED, location.speed)
                        putExtra(EXTRA_ACCURACY, location.accuracy)
                        putExtra(EXTRA_BEARING, location.bearing)
                    }
                    sendBroadcast(intent)
                    Log.d("LocationService", "Broadcasted location update")
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
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
        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10000)
            .setMinUpdateIntervalMillis(5000)
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
        super.onDestroy()
        fusedLocationClient.removeLocationUpdates(locationCallback)
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
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
        val driverRef = firestore.collection("drivers").document(driverDocId)

        val locationData = hashMapOf(
            "current_latitude" to location.latitude,
            "current_longitude" to location.longitude,
            "current_speed" to location.speed,
            "current_heading" to location.bearing,
            "current_accuracy" to location.accuracy,
            "last_updated" to FieldValue.serverTimestamp()
        )

        // Using set(SetOptions.merge()) ensures that we only update these specific location fields
        // without overwriting the entire driver document. In the case of network failure,
        // Firestore caches this operation locally and retries it automatically when online.
        driverRef.set(locationData, SetOptions.merge())
            .addOnSuccessListener {
                Log.d("LocationService", "Successfully queued/wrote location to Firestore.")
            }
            .addOnFailureListener { e ->
                Log.e("LocationService", "Error writing location to Firestore", e)
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
