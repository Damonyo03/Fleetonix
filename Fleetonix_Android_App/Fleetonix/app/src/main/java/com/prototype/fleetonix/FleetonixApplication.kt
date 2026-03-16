package com.prototype.fleetonix

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import com.google.firebase.firestore.MemoryCacheSettings
import com.google.firebase.firestore.PersistentCacheSettings

class FleetonixApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        // Initialize Firebase
        FirebaseApp.initializeApp(this)

        // Configure Firestore with offline persistence
        val firestore = FirebaseFirestore.getInstance()
        
        val settings = FirebaseFirestoreSettings.Builder()
            // Configure persistent cache with a reasonable size (e.g., 100 MB)
            // Firebase will automatically queue writes when offline and sync when online
            .setLocalCacheSettings(
                PersistentCacheSettings.newBuilder()
                    .setSizeBytes(104857600L) // 100 MB cache size
                    .build()
            )
            .build()
            
        firestore.firestoreSettings = settings
    }
}
