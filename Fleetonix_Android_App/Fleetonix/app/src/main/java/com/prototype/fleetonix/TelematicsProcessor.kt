package com.prototype.fleetonix

import com.google.android.gms.maps.model.LatLng
import kotlin.math.sqrt

class TelematicsProcessor {

    // Speed Smoothing States
    private var lastSmoothedSpeed = 0.0
    private var speedVariance = 1.0
    private val speedProcessNoise = 0.1
    private val speedMeasurementNoise = 0.5

    // Position Smoothing States
    private var lastSmoothedLat = 0.0
    private var lastSmoothedLng = 0.0
    private var posVarianceLat = 0.0
    private var posVarianceLng = 0.0
    private val posProcessNoise = 0.000001 // Approx 0.1m drift per step
    private val posMeasurementNoiseBase = 0.00001 // Approx 1m base noise

    /**
     * Kalman Filter for 1D Speed Smoothing
     * @param rawSpeed The raw speed from GPS (m/s)
     * @return Smoothed speed value
     */
    fun getSmoothedSpeed(rawSpeed: Float): Double {
        speedVariance += speedProcessNoise
        val kalmanGain = speedVariance / (speedVariance + speedMeasurementNoise)
        lastSmoothedSpeed += kalmanGain * (rawSpeed.toDouble() - lastSmoothedSpeed)
        speedVariance *= (1.0 - kalmanGain)
        return lastSmoothedSpeed
    }

    /**
     * Kalman Filter for 2D Position Smoothing
     */
    fun getSmoothedLocation(rawLat: Double, rawLng: Double, accuracy: Float): LatLng {
        if (lastSmoothedLat == 0.0) {
            lastSmoothedLat = rawLat
            lastSmoothedLng = rawLng
            return LatLng(rawLat, rawLng)
        }

        // Adjust measurement noise based on GPS accuracy (converted roughly to degrees)
        // 1 meter is approx 0.000009 degrees
        val dynamicMeasurementNoise = (accuracy * 0.000009).coerceAtLeast(posMeasurementNoiseBase)

        // Latitude Step
        posVarianceLat += posProcessNoise
        val gainLat = posVarianceLat / (posVarianceLat + dynamicMeasurementNoise)
        lastSmoothedLat += gainLat * (rawLat - lastSmoothedLat)
        posVarianceLat *= (1.0 - gainLat)

        // Longitude Step
        posVarianceLng += posProcessNoise
        val gainLng = posVarianceLng / (posVarianceLng + dynamicMeasurementNoise)
        lastSmoothedLng += gainLng * (rawLng - lastSmoothedLng)
        posVarianceLng *= (1.0 - gainLng)

        return LatLng(lastSmoothedLat, lastSmoothedLng)
    }

    /**
     * G-Force Calculation from raw Accelerometer data
     */
    fun calculateGForce(x: Float, y: Float, z: Float): Double {
        val gValue = 9.80665f
        val resultant = sqrt((x * x + y * y + z * z).toDouble())
        return resultant / gValue
    }
}
