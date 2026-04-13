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
    
    // Optimized threshold for intentional user shaking (reduced from 80.0f/3.5G)
    private val SHAKE_THRESHOLD = 2.2f 
    private val TIME_THRESHOLD = 100 // Reduced from 300ms to capture high-frequency movement
    private val SHAKE_COOLDOWN = 10000 // Minimum time between shake detections (10 seconds)
    private val REQUIRED_SHAKES = 3 // Require 3 firm shakes
    private val SHAKE_WINDOW = 3000 // Increased from 2000ms for more natural timing
    
    private val ACCIDENT_G_THRESHOLD = 2.2f // Threshold for intentional shaking
                
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

