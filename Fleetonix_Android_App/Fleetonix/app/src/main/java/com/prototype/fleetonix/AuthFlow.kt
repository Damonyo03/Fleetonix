package com.prototype.fleetonix

import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

@RequiresApi(Build.VERSION_CODES.O)
@Composable
fun AuthFlow() {
    val context = LocalContext.current
    val auth = remember { FirebaseAuth.getInstance() }
    val db = remember { FirebaseFirestore.getInstance() }
    
    var currentUser by remember { mutableStateOf<FirebaseUser?>(auth.currentUser) }
    var isDriverVerified by rememberSaveable { mutableStateOf(false) }
    var userData by remember { mutableStateOf<Map<String, Any>?>(null) }
    var userRole by rememberSaveable { mutableStateOf<String?>(null) }
    var showSplash by remember { mutableStateOf(true) }
    
    var feedData by remember { mutableStateOf<List<DriverSchedule>>(emptyList()) }
    var feedLoading by remember { mutableStateOf(false) }
    var feedError by remember { mutableStateOf<String?>(null) }
    
    var showForgotPassword by remember { mutableStateOf(false) }
    var showResetPassword by remember { mutableStateOf(false) }
    var otpData by remember { mutableStateOf<ForgotPasswordData?>(null) }
    
    val scope = rememberCoroutineScope()

    // Listen to Auth State
    LaunchedEffect(Unit) {
        auth.addAuthStateListener { firebaseAuth ->
            currentUser = firebaseAuth.currentUser
            if (firebaseAuth.currentUser != null) {
                PresenceManager.updateStatus(true)
                // Fetch user role
                // Fetch user role - Fallback to email search if UID doc doesn't exist
                scope.launch {
                    try {
                        val uid = firebaseAuth.currentUser!!.uid
                        val email = firebaseAuth.currentUser!!.email
                        
                        var doc = db.collection("users").document(uid).get().await()
                        if (!doc.exists() && email != null) {
                            Log.d("AuthFlow", "UID doc missing, searching by email: $email")
                            val query = db.collection("users")
                                .whereEqualTo("email", email.lowercase().trim())
                                .get()
                                .await()
                            if (!query.isEmpty) {
                                doc = query.documents[0]
                                Log.d("AuthFlow", "User found by email: ${doc.id}")
                            }
                        }
                        
                        if (doc.exists()) {
                            userData = doc.data
                            userRole = doc.getString("user_type")
                            Log.d("AuthFlow", "User role identified: $userRole")
                            // Auto-verify drivers - OTP step skipped (email delivery not yet configured)
                            if (userRole == "driver") {
                                isDriverVerified = true
                            }
                        } else {
                            Log.w("AuthFlow", "User record not found in Firestore for $email")
                        }
                    } catch (e: Exception) {
                        Log.e("AuthFlow", "Error fetching user role", e)
                    }
                }
            } else {
                isDriverVerified = false
                userRole = null
                userData = null
            }
        }
    }

    var refreshTrigger by remember { mutableStateOf(0) }
    
    // Real-time listener for Firestore feed
    DisposableEffect(currentUser, userRole, refreshTrigger) {
        val user = currentUser
        if (user == null || userRole != "driver") {
            feedData = emptyList()
            return@DisposableEffect onDispose {}
        }
        
        feedLoading = true
        feedError = null

        val email = user.email?.lowercase()?.trim()
        Log.d("AuthFlow", "Subscribing to schedules for: $email (refresh: $refreshTrigger)")

        val listener = db.collection("schedules")
            .whereEqualTo("driver_email", email)
            .addSnapshotListener { snapshot, error ->
                feedLoading = false
                if (error != null) {
                    Log.e("AuthFlow", "Firestore sync failed", error)
                    feedError = "Sync error: ${error.message}"
                    return@addSnapshotListener
                }

                if (snapshot != null) {
                    val schedules = snapshot.documents.mapNotNull { doc ->
                        val data = doc.data ?: return@mapNotNull null
                        // Safely parse schedule_id from numeric field or fallback to doc hash
                        val sId = (data["schedule_id"] as? Number)?.toInt() 
                                  ?: (data["numeric_booking_id"] as? Number)?.toInt()
                                  ?: doc.id.hashCode()

                        DriverSchedule(
                            docId = doc.id,
                            scheduleId = sId,
                            bookingId = (data["numeric_booking_id"] as? Number)?.toInt(),
                            scheduleStatus = data["status"] as? String,
                            tripPhase = data["trip_phase"] as? String ?: "pending",
                            scheduledDate = data["schedule_date"] as? String,
                            scheduledTime = data["schedule_time"] as? String,
                            startedAt = data["started_at"]?.toString(),
                            completedAt = data["completed_at"]?.toString(),
                            pickup = DriverScheduleLocation(
                                address = data["pickup_location"] as? String,
                                latitude = data["pickup_latitude"] as? Double,
                                longitude = data["pickup_longitude"] as? Double
                            ),
                            dropoff = DriverScheduleLocation(
                                address = data["dropoff_location"] as? String,
                                latitude = data["dropoff_latitude"] as? Double,
                                longitude = data["dropoff_longitude"] as? Double
                            ),
                            client = DriverClientInfo(
                                company = data["company_name"] as? String,
                                name = data["client_name"] as? String,
                                phone = data["client_phone"] as? String,
                                email = data["client_email"] as? String
                            ),
                            returnToPickup = data["return_to_pickup"] as? Boolean ?: false,
                            specialInstructions = data["special_instructions"] as? String
                        )
                    }.sortedByDescending { it.docId }

                    Log.d("AuthFlow", "Sync successful: Found ${schedules.size} schedules")
                    feedData = schedules
                }
            }

        onDispose {
            listener.remove()
        }
    }

    val currentState = when {
        showSplash -> "splash"
        currentUser == null -> {
            if (showResetPassword) "reset_password"
            else if (showForgotPassword) "forgot_password"
            else "login"
        }
        userRole == null -> "loading_role"
        userRole != "driver" -> "unauthorized"
        userRole == "driver" && !isDriverVerified -> "verify_otp"
        else -> "dashboard"
    }
    
    Crossfade(targetState = currentState) { state ->
        when (state) {
            "splash" -> SplashScreen(onFinished = { showSplash = false })
            "loading_role" -> {
                Box(modifier = Modifier.fillMaxSize().background(com.prototype.fleetonix.ui.theme.Midnight), contentAlignment = Alignment.Center) {
                    androidx.compose.material3.CircularProgressIndicator(color = com.prototype.fleetonix.ui.theme.AccentTeal)
                }
            }
            "unauthorized" -> {
                Box(modifier = Modifier.fillMaxSize().background(com.prototype.fleetonix.ui.theme.Midnight), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
                        androidx.compose.material3.Icon(
                            imageVector = androidx.compose.material.icons.Icons.Default.Warning,
                            contentDescription = "Unauthorized",
                            tint = Color(0xFFFF6B6B),
                            modifier = Modifier.size(64.dp)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Access Denied",
                            color = com.prototype.fleetonix.ui.theme.TextPrimary,
                            style = MaterialTheme.typography.headlineSmall
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "This app is exclusively for drivers. Your account is registered as a Client or Admin. Please use the Web Dashboard instead.",
                            color = com.prototype.fleetonix.ui.theme.TextSecondary,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(24.dp))
                        Button(
                            onClick = { 
                                auth.signOut()
                                currentUser = null
                                userRole = null
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF6B6B))
                        ) {
                            Text("Sign Out")
                        }
                    }
                }
            }
            "login" -> LoginScreen(
                onLoginSuccess = { 
                    currentUser = auth.currentUser
                },
                onForgotPassword = {
                    showForgotPassword = true
                }
            )
            "forgot_password" -> ForgotPasswordScreen(
                onOTPSent = { data ->
                    otpData = data
                    showResetPassword = true
                    showForgotPassword = false
                },
                onBack = {
                    showForgotPassword = false
                }
            )
            "reset_password" -> {
                val data = otpData
                if (data != null) {
                    ResetPasswordScreen(
                        userId = data.userId ?: "",
                        otpCode = data.otp ?: "",
                        userEmail = data.email ?: "",
                        onPasswordReset = {
                            showResetPassword = false
                            showForgotPassword = false
                        },
                        onBack = {
                            showResetPassword = false
                            showForgotPassword = true
                        }
                    )
                }
            }
            "verify_otp" -> {
                OTPVerifyScreen(
                    userId = currentUser?.uid ?: "",
                    userEmail = currentUser?.email ?: "",
                    onVerified = {
                        isDriverVerified = true
                    },
                    onBack = {
                        auth.signOut()
                        currentUser = null
                    }
                )
            }
            "dashboard" -> {
                val user = currentUser
                if (user != null) {
                    DriverDashboard(
                        session = DriverLoginData(
                            sessionToken = "firebase_${user.uid}",
                            user = DriverUser(
                                id = user.uid,
                                userType = "driver",
                                name = userData?.get("full_name") as? String ?: user.displayName,
                                email = user.email
                            ),
                            driver = DriverProfile(null, null, null, null, "available")
                        ),
                        feed = DriverFeedData(feedData.size, feedData),
                        isFeedLoading = feedLoading,
                        feedError = feedError,
                        onRefresh = { 
                            refreshTrigger++
                        },
                        onLogout = {
                            PresenceManager.updateStatus(false)
                            auth.signOut()
                            currentUser = null
                            isDriverVerified = false
                        }
                    )
                }
            }
        }
    }
}
