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
}
