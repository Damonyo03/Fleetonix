package com.prototype.fleetonix

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.util.Log
import kotlin.math.sqrt

class ShakeDetector(
    private val onShakeDetected: () -> Unit
) : SensorEventListener {
    
    private var lastUpdate: Long = 0
    private var lastX: Float = 0f
    private var lastY: Float = 0f
    private var lastZ: Float = 0f
    private var lastShakeTime: Long = 0
    private var shakeCount = 0 // Count consecutive strong shakes
    private var lastShakeWindow: Long = 0 // Track time window for multiple shakes
    
    // Shake detection threshold - significantly increased to reduce false positives
    private val SHAKE_THRESHOLD = 80.0f // Very high threshold - requires very strong shake
    private val TIME_THRESHOLD = 300 // Minimum time between sensor readings (ms)
    private val SHAKE_COOLDOWN = 10000 // Minimum time between shake detections (10 seconds)
    private val REQUIRED_SHAKES = 3 // Require 3 strong shakes within window
    private val SHAKE_WINDOW = 2000 // Time window to detect multiple shakes (2 seconds)
    
    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type == Sensor.TYPE_ACCELEROMETER) {
            val currentTime = System.currentTimeMillis()
            
            // Only process if enough time has passed since last reading
            if ((currentTime - lastUpdate) > TIME_THRESHOLD) {
                val diffTime = (currentTime - lastUpdate).toLong()
                lastUpdate = currentTime
                
                val x = event.values[0]
                val y = event.values[1]
                val z = event.values[2]
                
                // Calculate G-force
                val gX = x / SensorManager.GRAVITY_EARTH
                val gY = y / SensorManager.GRAVITY_EARTH
                val gZ = z / SensorManager.GRAVITY_EARTH
                
                // gForce will be near 1.0 when stationary
                val gForce = sqrt(gX * gX + gY * gY + gZ * gZ)
                
                // A strong shake is usually > 2.5G
                // An accident (impact) is definitely > 4G or 5G
                val ACCIDENT_G_THRESHOLD = 3.5f 
                
                if (gForce > ACCIDENT_G_THRESHOLD) {
                    // Reset count if too much time passed
                    if (currentTime - lastShakeWindow > SHAKE_WINDOW) {
                        shakeCount = 0
                    }
                    
                    if (shakeCount == 0) {
                        lastShakeWindow = currentTime
                    }
                    shakeCount++
                    
                    Log.d("ShakeDetector", "High G-Force detected: $gForce G, Count: $shakeCount/$REQUIRED_SHAKES")
                    
                    if (shakeCount >= REQUIRED_SHAKES && (currentTime - lastShakeTime) > SHAKE_COOLDOWN) {
                        Log.d("ShakeDetector", "Accident alert triggered!")
                        lastShakeTime = currentTime
                        shakeCount = 0
                        onShakeDetected()
                    }
                } else {
                    // Gradual decay of shake count if not moving strongly
                    if (currentTime - lastShakeWindow > SHAKE_WINDOW) {
                        shakeCount = 0
                    }
                }
                
                lastX = x
                lastY = y
                lastZ = z
            }
        }
    }
    
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not used
    }
}

