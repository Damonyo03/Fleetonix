package com.prototype.fleetonix

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson

class SessionManager(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "fleetonix_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    
    private val gson = Gson()

    fun saveSession(data: DriverLoginData) {
        prefs.edit().putString("session_data", gson.toJson(data)).apply()
    }

    fun loadSession(): DriverLoginData? {
        val json = prefs.getString("session_data", null) ?: return null
        return try {
            gson.fromJson(json, DriverLoginData::class.java)
        } catch (ex: Exception) {
            null
        }
    }

    fun clearSession() {
        prefs.edit().remove("session_data").apply()
    }
}

