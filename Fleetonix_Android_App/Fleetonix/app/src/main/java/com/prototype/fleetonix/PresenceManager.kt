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

    fun updateStatus(isOnline: Boolean) {
        val user = auth.currentUser ?: return
        val email = user.email ?: return
        val status = if (isOnline) "available" else "offline"
        val timestamp = FieldValue.serverTimestamp()

        // Update 'users' collection status
        db.collection("users").whereEqualTo("email", email)
            .get()
            .addOnSuccessListener { snapshot ->
                for (doc in snapshot.documents) {
                    doc.reference.update(
                        "status", if (isOnline) "active" else "inactive",
                        "last_active", timestamp
                    )
                }
            }

        // Update 'drivers' collection status
        db.collection("drivers").whereEqualTo("driver_email", email)
            .get()
            .addOnSuccessListener { snapshot ->
                for (doc in snapshot.documents) {
                    doc.reference.update(
                        "current_status", status,
                        "last_active", timestamp
                    )
                }
            }
    }
}
