package com.prototype.fleetonix

import kotlin.math.sqrt

class TelematicsProcessor {

    private var lastSmoothedSpeed = 0.0
    private var variance = 1.0 // P: Error covariance
    private val processNoise = 0.1 // Q: Process noise
    private val measurementNoise = 0.5 // R: Measurement noise

    /**
     * Kalman Filter for 1D Speed Smoothing
     * @param rawSpeed The raw speed from GPS (m/s)
     * @return Smoothed speed value
     */
    fun getSmoothedSpeed(rawSpeed: Float): Double {
        // Linear 1D Kalman Filter step: 
        // 1. Prediction: lastSmoothedSpeed remains same, add process noise to variance
        variance += processNoise
        
        // 2. Kalman Gain: K = P / (P + R)
        val kalmanGain = variance / (variance + measurementNoise)
        
        // 3. Update: X = X + K * (Z - X)
        lastSmoothedSpeed += kalmanGain * (rawSpeed - lastSmoothedSpeed)
        
        // 4. Update Covariance: P = (1 - K) * P
        variance *= (1.0 - kalmanGain)
        
        return lastSmoothedSpeed
    }

    /**
     * G-Force Calculation from raw Accelerometer data
     * @param x Accelerometer X-axis
     * @param y Accelerometer Y-axis
     * @param z Accelerometer Z-axis
     * @return Max G-force (resultant)
     */
    fun calculateGForce(x: Float, y: Float, z: Float): Double {
        // Standard Earth Gravity (m/s^2)
        val gValue = 9.80665f
        
        // Resultant Vector: sqrt(x^2 + y^2 + z^2)
        val resultant = sqrt((x * x + y * y + z * z).toDouble())
        
        // Convert to Gs
        return resultant / gValue
    }
}
