package com.prototype.fleetonix

import com.google.android.gms.maps.model.LatLng
import com.google.gson.annotations.SerializedName
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Query

interface GoogleMapsApi {
    @GET("maps/api/directions/json")
    suspend fun getDirections(
        @Query("origin") origin: String,
        @Query("destination") destination: String,
        @Query("key") apiKey: String
    ): DirectionsResponse
}

data class DirectionsResponse(
    @SerializedName("routes") val routes: List<DirectionsRoute>,
    @SerializedName("status") val status: String
)

data class DirectionsRoute(
    @SerializedName("overview_polyline") val overviewPolyline: OverviewPolyline,
    @SerializedName("legs") val legs: List<DirectionsLeg>
)

data class OverviewPolyline(
    @SerializedName("points") val points: String
)

data class DirectionsLeg(
    @SerializedName("distance") val distance: DirectionsTextValue,
    @SerializedName("duration") val duration: DirectionsTextValue
)

data class DirectionsTextValue(
    @SerializedName("text") val text: String,
    @SerializedName("value") val value: Int
)

object GoogleMapsService {
    private val retrofit = Retrofit.Builder()
        .baseUrl("https://maps.googleapis.com/")
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    val api: GoogleMapsApi = retrofit.create(GoogleMapsApi::class.java)

    /**
     * Decodes an encoded polyline string into a list of LatLng points.
     */
    fun decodePolyline(encoded: String): List<LatLng> {
        val poly = ArrayList<LatLng>()
        var index = 0
        val len = encoded.length
        var lat = 0
        var lng = 0

        while (index < len) {
            var b: Int
            var shift = 0
            var result = 0
            do {
                b = encoded[index++].toInt() - 63
                result = result or (b and 0x1f shl shift)
                shift += 5
            } while (b >= 0x20)
            val dlat = if (result and 1 != 0) (result shr 1).inv() else result shr 1
            lat += dlat

            shift = 0
            result = 0
            do {
                b = encoded[index++].toInt() - 63
                result = result or (b and 0x1f shl shift)
                shift += 5
            } while (b >= 0x20)
            val dlng = if (result and 1 != 0) (result shr 1).inv() else result shr 1
            lng += dlng

            val p = LatLng(lat.toDouble() / 1E5, lng.toDouble() / 1E5)
            poly.add(p)
        }
        return poly
    }

    /**
     * Calculates total distance of a polyline in meters
     */
    fun calculatePolylineDistance(polyline: List<LatLng>): Float {
        var distance = 0f
        if (polyline.size < 2) return 0f
        
        val results = FloatArray(1)
        for (i in 0 until polyline.size - 1) {
            val p1 = polyline[i]
            val p2 = polyline[i + 1]
            android.location.Location.distanceBetween(
                p1.latitude, p1.longitude,
                p2.latitude, p2.longitude,
                results
            )
            distance += results[0]
        }
        return distance
    }

    /**
     * Finds the minimum distance from a point to any point in a polyline.
     */
    fun findMinimumDistanceToPolyline(point: LatLng, polyline: List<LatLng>): Float {
        if (polyline.isEmpty()) return Float.MAX_VALUE
        var minDistance = Float.MAX_VALUE
        val results = FloatArray(1)
        for (p in polyline) {
            android.location.Location.distanceBetween(point.latitude, point.longitude, p.latitude, p.longitude, results)
            if (results[0] < minDistance) minDistance = results[0]
        }
        return minDistance
    }

    /**
     * Trims a polyline by finding the closest point to the driver's location
     * and dropping all points strictly before it.
     */
    fun trimPolyline(driverPos: LatLng, polyline: List<LatLng>): List<LatLng> {
        if (polyline.isEmpty()) return polyline
        var minDistance = Float.MAX_VALUE
        var closestIdx = 0
        val results = FloatArray(1)
        for (i in polyline.indices) {
            val p = polyline[i]
            android.location.Location.distanceBetween(driverPos.latitude, driverPos.longitude, p.latitude, p.longitude, results)
            if (results[0] < minDistance) {
                minDistance = results[0]
                closestIdx = i
            }
        }
        // If driver is far off route (e.g. > 500 meters), don't aggressively trim
        if (minDistance > 500f) return polyline
        return polyline.subList(closestIdx, polyline.size)
    }
    /**
     * Calculates distance between two points in meters.
     */
    fun calculateDistance(p1: LatLng, p2: LatLng): Float {
        val results = FloatArray(1)
        android.location.Location.distanceBetween(
            p1.latitude, p1.longitude,
            p2.latitude, p2.longitude,
            results
        )
        return results[0]
    }

    /**
     * Encodes a list of LatLng points into a polyline string.
     */
    fun encodePolyline(points: List<LatLng>): String {
        val encoded = StringBuilder()
        var lastLat = 0
        var lastLng = 0

        for (p in points) {
            val lat = (p.latitude * 1E5).toInt()
            val lng = (p.longitude * 1E5).toInt()

            encodeValue(lat - lastLat, encoded)
            encodeValue(lng - lastLng, encoded)

            lastLat = lat
            lastLng = lng
        }
        return encoded.toString()
    }

    private fun encodeValue(v: Int, encoded: StringBuilder) {
        var value = v
        value = if (value < 0) (value shl 1).inv() else value shl 1
        while (value >= 0x20) {
            encoded.append(((0x20 or (value and 0x1f)) + 63).toChar())
            value = value shr 5
        }
        encoded.append((value + 63).toChar())
    }
}
