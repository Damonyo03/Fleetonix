package com.prototype.fleetonix

import android.content.Context
import com.google.gson.Gson

class SessionManager(context: Context) {
    private val prefs = context.getSharedPreferences("fleetonix_prefs", Context.MODE_PRIVATE)
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

