package com.prototype.fleetonix

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.location.LocationManager
import android.net.Uri
import android.util.Log
import androidx.core.content.ContextCompat
import java.util.Locale

fun hasLocationPermission(context: Context): Boolean {
    val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
    val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
    return fine || coarse
}

fun Context.isGpsEnabled(): Boolean {
    val manager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager
    return manager?.isProviderEnabled(LocationManager.GPS_PROVIDER) == true
}

fun Context.findActivity(): Activity? {
    var current = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        current = current.baseContext
    }
    return null
}

fun openExternalMaps(context: Context, latitude: Double, longitude: Double, address: String) {
    try {
        // Create a generic navigation intent
        val navigationUri = Uri.parse("google.navigation:q=$latitude,$longitude")
        val navigationIntent = Intent(Intent.ACTION_VIEW, navigationUri)
        
        // Create a chooser intent to let user pick from available navigation apps
        val chooserIntent = Intent.createChooser(navigationIntent, "Open with navigation app")
        
        // Add alternative intents for other navigation apps
        val intents = mutableListOf<Intent>()
        
        // Google Maps
        val googleMapsIntent = Intent(Intent.ACTION_VIEW, navigationUri)
        googleMapsIntent.setPackage("com.google.android.apps.maps")
        if (googleMapsIntent.resolveActivity(context.packageManager) != null) {
            intents.add(googleMapsIntent)
        }
        
        // Waze
        val wazeUri = Uri.parse("waze://?ll=$latitude,$longitude&navigate=yes")
        val wazeIntent = Intent(Intent.ACTION_VIEW, wazeUri)
        if (wazeIntent.resolveActivity(context.packageManager) != null) {
            intents.add(wazeIntent)
        }
        
        // Add alternatives to chooser
        if (intents.isNotEmpty()) {
            chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, intents.toTypedArray())
        }
        
        // Start the chooser
        context.startActivity(chooserIntent)
    } catch (e: Exception) {
        Log.e("Maps", "Error opening external maps: ${e.message}")
        // Fallback to web browser
        try {
            val webUri = Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$latitude,$longitude")
            val webIntent = Intent(Intent.ACTION_VIEW, webUri)
            context.startActivity(webIntent)
        } catch (webException: Exception) {
            Log.e("Maps", "Error opening web maps: ${webException.message}")
        }
    }
}

fun formatScheduleTime(value: String?): String {
    if (value.isNullOrBlank()) return "--"
    return try {
        val parts = value.split(":")
        val hour = parts.getOrNull(0)?.toInt() ?: return value
        val minute = parts.getOrNull(1)?.toInt() ?: 0
        val amPm = if (hour >= 12) "PM" else "AM"
        val hour12 = when {
            hour == 0 -> 12
            hour > 12 -> hour - 12
            else -> hour
        }
        String.format(Locale.getDefault(), "%02d:%02d %s", hour12, minute, amPm)
    } catch (ex: Exception) {
        value
    }
}

