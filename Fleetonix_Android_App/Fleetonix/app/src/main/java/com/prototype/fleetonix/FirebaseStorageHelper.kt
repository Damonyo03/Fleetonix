package com.prototype.fleetonix

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.net.Uri
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.tasks.await
import java.io.ByteArrayOutputStream
import java.util.*

object FirebaseStorageHelper {

    /**
     * Converts a list of PathState (Compose paths) to a Bitmap for saving/uploading.
     */
    fun createBitmapFromPaths(paths: List<PathState>, width: Int, height: Int): Bitmap {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint().apply {
            color = android.graphics.Color.BLACK
            style = Paint.Style.STROKE
            strokeWidth = 10f
            isAntiAlias = true
            strokeJoin = Paint.Join.ROUND
            strokeCap = Paint.Cap.ROUND
        }

        paths.forEach { pathState ->
            val androidPath = Path()
            pathState.points.forEachIndexed { index, offset ->
                if (index == 0) {
                    androidPath.moveTo(offset.x, offset.y)
                } else {
                    androidPath.lineTo(offset.x, offset.y)
                }
            }
            canvas.drawPath(androidPath, paint)
        }
        return bitmap
    }

    /**
     * Uploads the signature bitmap to Firebase Storage and returns the download URL.
     */
    suspend fun uploadSignature(bitmap: Bitmap, tripId: String): String {
        val storage = FirebaseStorage.getInstance()
        val id = if (tripId.isBlank()) "unknown_trip_${System.currentTimeMillis()}" else tripId
        val fileName = "signatures/${id}_${UUID.randomUUID()}.jpg"
        
        android.util.Log.d("FirebaseStorageHelper", "Attempting upload to: $fileName")
        
        val storageRef = storage.reference.child(fileName)

        val baos = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 90, baos)
        val data = baos.toByteArray()

        return try {
            // Task-based await with metadata check
            val uploadTask = storageRef.putBytes(data).await()
            if (uploadTask.metadata == null) {
                throw Exception("Upload succeeded but metadata is missing")
            }
            
            android.util.Log.d("FirebaseStorageHelper", "Upload successful: ${uploadTask.metadata?.path}")
            
            // Get the download URL
            val url = storageRef.downloadUrl.await().toString()
            android.util.Log.d("FirebaseStorageHelper", "Download URL generated: $url")
            url
        } catch (e: Exception) {
            android.util.Log.e("FirebaseStorageHelper", "Upload failed for $fileName", e)
            throw e
        }
    }

}
