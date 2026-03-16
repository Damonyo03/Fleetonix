package com.prototype.fleetonix

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore

class GeofenceBroadcastReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val geofencingEvent = GeofencingEvent.fromIntent(intent) ?: return

        if (geofencingEvent.hasError()) {
            Log.e("GeofenceReceiver", "GeofencingEvent error: ${geofencingEvent.errorCode}")
            return
        }

        val geofenceTransition = geofencingEvent.geofenceTransition

        if (geofenceTransition == Geofence.GEOFENCE_TRANSITION_ENTER) {
            val triggeringGeofences = geofencingEvent.triggeringGeofences ?: return
            
            for (geofence in triggeringGeofences) {
                // geofenceId should be the scheduleDocId
                val scheduleDocId = geofence.requestId
                val targetPhase = intent.getStringExtra("targetPhase") ?: "unknown"
                
                updateTripPhaseInFirestore(scheduleDocId, targetPhase)
            }
        }
    }

    private fun updateTripPhaseInFirestore(docId: String, targetPhase: String) {
        val db = FirebaseFirestore.getInstance()
        val updateData = mutableMapOf<String, Any>(
            "trip_phase" to targetPhase
        )

        // Add timestamps based on phase
        when (targetPhase) {
            "dropoff" -> updateData["picked_up_at"] = FieldValue.serverTimestamp()
            "ready_to_complete" -> updateData["dropped_off_at"] = FieldValue.serverTimestamp()
            "return_pickup" -> updateData["dropped_off_at"] = FieldValue.serverTimestamp()
        }

        db.collection("schedules").document(docId)
            .update(updateData)
            .addOnSuccessListener {
                Log.d("GeofenceReceiver", "Successfully updated trip phase to $targetPhase for $docId")
            }
            .addOnFailureListener { e ->
                Log.e("GeofenceReceiver", "Error updating trip phase", e)
            }
    }
}
