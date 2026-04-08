package com.prototype.fleetonix

import android.os.Build
import android.util.Log
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.platform.LocalLifecycleOwner
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
    
    // First Login Security State
    var isFirstLoginMode by rememberSaveable { mutableStateOf(false) }
    var needsPasswordReset by rememberSaveable { mutableStateOf(false) }
    
    var feedData by remember { mutableStateOf<List<DriverSchedule>>(emptyList()) }
    var feedLoading by remember { mutableStateOf(false) }
    var feedError by remember { mutableStateOf<String?>(null) }

    
    var showForgotPassword by rememberSaveable { mutableStateOf(false) }
    var showForgotPasswordOTP by rememberSaveable { mutableStateOf(false) }
    var showResetPassword by rememberSaveable { mutableStateOf(false) }
    
    var resetUserId by rememberSaveable { mutableStateOf("") }
    var resetEmail by rememberSaveable { mutableStateOf("") }
    var verifiedOtpCode by rememberSaveable { mutableStateOf("") }
    
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current

    var showHistory by remember { mutableStateOf(false) }
    var showAssignments by remember { mutableStateOf(false) }

    // Lifecycle-aware Presence Management
    // Ensures status is ONLY 'active' when app is in foreground
    DisposableEffect(lifecycleOwner, currentUser) {
        val observer = LifecycleEventObserver { _, event ->
            if (currentUser != null) {
                when (event) {
                    Lifecycle.Event.ON_START -> {
                        PresenceManager.updateStatus(true)
                    }
                    else -> {}
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

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
                            
                            val isFirstTime = (doc.getBoolean("isFirstLogin") ?: false)
                            
                            if (userRole == "driver") {
                                if (isFirstTime) {
                                    isFirstLoginMode = true
                                    isDriverVerified = false
                                    Log.d("AuthFlow", "First login detected for driver. Enforcing security flow.")
                                } else {
                                    isFirstLoginMode = false
                                    isDriverVerified = true 
                                }
                            }
                        } else {
                            Log.w("AuthFlow", "User record not found in Firestore for $email. Signing out.")
                            auth.signOut()
                            currentUser = null
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
        if (BuildConfig.DEBUG) {
            Log.d("AuthFlow", "Subscribing to schedules for: $email (refresh: $refreshTrigger)")
        }

        val listener = db.collection("schedules")
            .whereEqualTo("driver_email", email)
            .whereEqualTo("isOfficial", true)
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

                        // Parse segments
                        @Suppress("UNCHECKED_CAST")
                        val segmentsList = data["segments"] as? List<Map<String, Any?>>
                        val segments = segmentsList?.mapNotNull { seg ->
                            val p = seg["pickup"] as? String ?: return@mapNotNull null
                            val d = seg["dropoff"] as? String ?: return@mapNotNull null
                            DriverSegment(pickup = p, dropoff = d)
                        } ?: emptyList()

                        DriverSchedule(
                            docId = doc.id,
                            scheduleId = sId,
                            trip_phase = data["trip_phase"] as? String ?: "pending",
                            status = data["status"] as? String,
                            schedule_date = data["schedule_date"] as? String,
                            scheduled_time = data["schedule_time"] as? String,
                            pickup_location = listOf(DriverScheduleLocation(
                                address = data["pickup_location"] as? String,
                                latitude = (data["pickup_latitude"] as? Number)?.toDouble(),
                                longitude = (data["pickup_longitude"] as? Number)?.toDouble()
                            )),
                            dropoff_location = DriverScheduleLocation(
                                address = data["dropoff_location"] as? String,
                                latitude = (data["dropoff_latitude"] as? Number)?.toDouble(),
                                longitude = (data["dropoff_longitude"] as? Number)?.toDouble()
                            ),
                            client = DriverClientInfo(
                                company = data["company_name"] as? String,
                                name = data["client_name"] as? String
                            ),
                            client_name = data["client_name"] as? String,
                            passenger_name = data["passenger_name"] as? String,
                            passenger_email = data["passenger_email"] as? String,
                            passenger_phone = data["passenger_phone"] as? String,
                            special_instructions = data["special_instructions"] as? String,
                            return_to_pickup = data["return_to_pickup"] as? Boolean ?: false,
                            return_pickup_time = data["return_pickup_time"] as? String,
                            segments = segments,
                            isOfficial = data["isOfficial"] as? Boolean ?: false
                        )

                    }.sortedWith(compareByDescending<DriverSchedule> { 
                        when (it.trip_phase) {
                            "pending" -> 3
                            "accepted", "pickup", "dropoff", "return_pickup", "ready_to_complete" -> 2
                            "completed" -> 0
                            else -> 1
                        }
                    }.thenByDescending { it.docId })

                    Log.d("AuthFlow", "Sync successful: Found ${schedules.size} schedules")
                    feedData = schedules
                }
            }

        onDispose {
            listener.remove()
        }
    }

    // Real-time listener for NOTIFICATIONS collection
    DisposableEffect(currentUser, userRole) {
        val user = currentUser
        if (user == null || userRole != "driver") return@DisposableEffect onDispose {}

        val uid = user.uid
        val listener = db.collection("notifications")
            .whereEqualTo("user_id", uid)
            .whereEqualTo("is_read", false)
            .orderBy("timestamp", Query.Direction.DESCENDING)
            .limit(1)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    Log.e("AuthFlow", "Notification listener failed", error)
                    return@addSnapshotListener
                }

                if (snapshot != null && !snapshot.isEmpty) {
                    val doc = snapshot.documents.first()
                    val title = doc.getString("title") ?: "New Notification"
                    val message = doc.getString("message") ?: ""
                    
                    // Show System Notification
                    showSystemNotification(context, title, message)
                    
                    // Mark as read immediately to prevent loop/duplicate triggers
                    doc.reference.update("is_read", true)
                }
            }

        onDispose { listener.remove() }
    }

    val currentState = when {
        showSplash -> "splash"
        currentUser == null -> {
            if (showResetPassword) "reset_password"
            else if (showForgotPasswordOTP) "forgot_password_otp"
            else if (showForgotPassword) "forgot_password"
            else "login"
        }
        userRole == null -> "loading_role"
        userRole != "driver" -> "unauthorized"
        userRole == "driver" && !isDriverVerified -> "verify_otp"
        isFirstLoginMode && needsPasswordReset -> "force_reset"
        showHistory -> "history"
        showAssignments -> "assignments"
        else -> "dashboard"
    }
    
    Crossfade(targetState = currentState) { state ->
        when (state) {
            "splash" -> SplashScreen(onFinished = { showSplash = false })
            "loading_role" -> {
                Box(modifier = Modifier.fillMaxSize().background(com.prototype.fleetonix.ui.theme.Midnight), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = com.prototype.fleetonix.ui.theme.AccentTeal)
                }
            }
            "unauthorized" -> {
                Box(modifier = Modifier.fillMaxSize().background(com.prototype.fleetonix.ui.theme.Midnight), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
                        Icon(
                            imageVector = Icons.Default.Warning,
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
                    resetUserId = data.userId ?: ""
                    resetEmail = data.email ?: ""
                    showForgotPasswordOTP = true
                    showForgotPassword = false
                },
                onBack = {
                    showForgotPassword = false
                }
            )
            "forgot_password_otp" -> {
                if (resetUserId.isNotEmpty()) {
                    ForgotPasswordOTPVerifyScreen(
                        userId = resetUserId,
                        userEmail = resetEmail,
                        onVerified = { otp ->
                            verifiedOtpCode = otp
                            showResetPassword = true
                            showForgotPasswordOTP = false
                        },
                        onResent = { data ->
                            resetUserId = data.userId ?: resetUserId
                            resetEmail = data.email ?: resetEmail
                        },
                        onBack = {
                            showForgotPasswordOTP = false
                            showForgotPassword = true
                        }
                    )
                }
            }
            "reset_password" -> {
                if (resetUserId.isNotEmpty()) {
                    ResetPasswordScreen(
                        userId = resetUserId,
                        otpCode = verifiedOtpCode,
                        userEmail = resetEmail,
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
                        if (isFirstLoginMode) {
                            needsPasswordReset = true
                        }
                    },
                    onBack = {
                        auth.signOut()
                        currentUser = null
                    }
                )
            }
            "force_reset" -> {
                ResetPasswordScreen(
                    userId = currentUser?.uid ?: "",
                    otpCode = "FIRST_LOGIN", // Flag to indicate forced reset
                    userEmail = currentUser?.email ?: "",
                    onPasswordReset = {
                        scope.launch {
                            try {
                                // Update Firestore - First login completed
                                val uid = currentUser?.uid
                                if (uid != null) {
                                    db.collection("users").document(uid).update("isFirstLogin", false).await()
                                    isFirstLoginMode = false
                                    needsPasswordReset = false
                                    Log.d("AuthFlow", "First login onboarding complete. Transitioning to dashboard.")
                                }
                            } catch (e: Exception) {
                                Log.e("AuthFlow", "Failed to update isFirstLogin status", e)
                            }
                        }
                    },
                    onBack = {
                        // Can't go back once in forced reset unless logging out
                        auth.signOut()
                        currentUser = null
                        isFirstLoginMode = false
                        needsPasswordReset = false
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
                            driver = DriverProfile(currentStatus = "available")
                        ),
                        feed = DriverFeedData(feedData.size, feedData),
                        isFeedLoading = feedLoading,
                        feedError = feedError,
                        onRefresh = { 
                            refreshTrigger++
                        },
                        onViewHistory = {
                            showHistory = true
                        },
                        onViewAssignments = {
                            showAssignments = true
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
            "history" -> {
                TripHistoryScreen(onBack = { showHistory = false })
            }
            "assignments" -> {
                AssignmentsScreen(onBack = { showAssignments = false })
            }
        }
    }
}

private fun showSystemNotification(context: Context, title: String, message: String) {
    val channelId = "ASSIGNMENT_NOTIFICATIONS"
    val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(
            channelId,
            "Assignments",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifications for new trip assignments"
        }
        notificationManager.createNotificationChannel(channel)
    }

    val intent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
    }
    
    val pendingIntent = PendingIntent.getActivity(
        context, 0, intent, 
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification = NotificationCompat.Builder(context, channelId)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(title)
        .setContentText(message)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setAutoCancel(true)
        .setContentIntent(pendingIntent)
        .build()

    notificationManager.notify(System.currentTimeMillis().toInt(), notification)
}
