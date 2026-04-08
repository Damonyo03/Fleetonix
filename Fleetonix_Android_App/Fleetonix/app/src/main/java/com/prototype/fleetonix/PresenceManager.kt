package com.prototype.fleetonix

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FieldValue
import android.util.Log

/**
 * PresenceManager handles real-time status updates for the driver.
 * It updates both the 'users' and 'drivers' collections in Firestore.
 */
object PresenceManager {
    private val db = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()

    fun updateStatus(isOnline: Boolean, isBackground: Boolean? = null) {
        val user = auth.currentUser ?: return
        val email = user.email ?: return
        val status = if (isOnline) "available" else "offline"
        val timestamp = FieldValue.serverTimestamp()

        val updateData = mutableMapOf<String, Any>(
            "status" to (if (isOnline) "active" else "inactive"),
            "last_active" to timestamp
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
            "lastSeen" to timestamp
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

    fun updateBackgroundStatus(isBackground: Boolean) {
        val user = auth.currentUser ?: return
        val email = user.email ?: return
        
        val updateData = mapOf("is_background" to isBackground, "last_active" to FieldValue.serverTimestamp())

        db.collection("drivers").whereEqualTo("driver_email", email).get()
            .addOnSuccessListener { snapshot ->
                for (doc in snapshot.documents) {
                    doc.reference.update(updateData)
                }
            }
        
        Log.d("PresenceManager", "Background status updated to $isBackground for $email")
    }
}
