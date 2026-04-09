package com.prototype.fleetonix

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import android.util.Log

/**
 * Observes the application lifecycle to track foreground/background state.
 */
class AppLifecycleObserver(private val context: android.content.Context) : DefaultLifecycleObserver {

    companion object {
        var isAppInBackground: Boolean = false
            private set
    }

    override fun onStart(owner: LifecycleOwner) {
        super.onStart(owner)
        isAppInBackground = false
        Log.d("AppLifecycleObserver", "App entered FOREGROUND")
        PresenceManager.updateBackgroundStatus(context, false)
    }

    override fun onStop(owner: LifecycleOwner) {
        super.onStop(owner)
        isAppInBackground = true
        Log.d("AppLifecycleObserver", "App entered BACKGROUND")
        PresenceManager.updateBackgroundStatus(context, true)
    }
}
