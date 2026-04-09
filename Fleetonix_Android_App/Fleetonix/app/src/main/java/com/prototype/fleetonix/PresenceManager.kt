package com.prototype.fleetonix

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FieldValue
import android.util.Log
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager

/**
 * PresenceManager handles real-time status updates for the driver.
 * It updates both the 'users' and 'drivers' collections in Firestore.
 */
object PresenceManager {
    private val db = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()

    // --- Telemetry Helpers ---
    
    fun getBatteryLevel(context: Context): Int {
        val batteryStatus: Intent? = IntentFilter(Intent.ACTION_BATTERY_CHANGED).let { filter ->
            context.registerReceiver(null, filter)
        }
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        
        return if (level >= 0 && scale > 0) {
            (level * 100 / scale)
        } else {
            level
        }
    }

    fun isCharging(context: Context): Boolean {
        val batteryStatus: Intent? = IntentFilter(Intent.ACTION_BATTERY_CHANGED).let { filter ->
            context.registerReceiver(null, filter)
        }
        val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        return status == BatteryManager.BATTERY_STATUS_CHARGING ||
               status == BatteryManager.BATTERY_STATUS_FULL
    }

    fun getNetworkType(context: Context): String {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val nc = cm.getNetworkCapabilities(cm.activeNetwork) ?: return "OFFLINE"
        
        return when {
            nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            nc.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "MOBILE"
            else -> "OTHER"
        }
    }

    fun updateStatus(context: Context, isOnline: Boolean, isBackground: Boolean? = null) {
        val user = auth.currentUser ?: return
        val email = user.email ?: return
        val status = if (isOnline) "available" else "offline"
        val timestamp = FieldValue.serverTimestamp()

        // Gather Telemetry
        val battery = getBatteryLevel(context)
        val charging = isCharging(context)
        val network = getNetworkType(context)

        val updateData = mutableMapOf<String, Any>(
            "status" to (if (isOnline) "active" else "inactive"),
            "last_active" to timestamp,
            "device_health" to mapOf(
                "battery" to battery,
                "is_charging" to charging,
                "network" to network,
                "timestamp" to timestamp
            )
        )
        isBackground?.let { updateData["is_background"] = it }

        // 1. Update 'users' collection
        db.collection("users").whereEqualTo("email", email).get()
            .addOnSuccessListener { snapshot ->
                for (doc in snapshot.documents) {
                    doc.reference.update(updateData)
                }
            }

        val driverUpdateData = mutableMapOf<String, Any>(
            "current_status" to status,
            "status" to (if (isOnline) "online" else "offline"),
            "last_active" to timestamp,
            "lastSeen" to timestamp,
            "device_health" to mapOf(
                "battery" to battery,
                "is_charging" to charging,
                "network" to network,
                "timestamp" to timestamp
            )
        )
        isBackground?.let { driverUpdateData["is_background"] = it }

        // 2. Update 'drivers' collection
        db.collection("drivers").whereEqualTo("driver_email", email).get()
            .addOnSuccessListener { snapshot ->
                for (doc in snapshot.documents) {
                    doc.reference.update(driverUpdateData)
                }
            }
            
        Log.d("PresenceManager", "Status updated: $status [Real-time: ${if(isOnline) "online" else "offline"}] for $email")
    }

    fun updateBackgroundStatus(context: Context, isBackground: Boolean) {
        val user = auth.currentUser ?: return
        val email = user.email ?: return
        
        // Gather Telemetry
        val battery = getBatteryLevel(context)
        val charging = isCharging(context)
        val network = getNetworkType(context)

        val updateData = mapOf(
            "is_background" to isBackground,
            "status" to "online",
            "lastSeen" to FieldValue.serverTimestamp(),
            "last_active" to FieldValue.serverTimestamp(),
            "device_health" to mapOf(
                "battery" to battery,
                "is_charging" to charging,
                "network" to network,
                "timestamp" to FieldValue.serverTimestamp()
            )
        )

        db.collection("drivers").whereEqualTo("driver_email", email).get()
            .addOnSuccessListener { snapshot ->
                for (doc in snapshot.documents) {
                    doc.reference.update(updateData)
                }
            }
        
        Log.d("PresenceManager", "Background status updated to $isBackground for $email")
    }
}
