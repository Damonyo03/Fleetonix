package com.prototype.fleetonix

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.prototype.fleetonix.ui.theme.AccentTeal
import com.prototype.fleetonix.ui.theme.CardBlue
import com.prototype.fleetonix.ui.theme.DividerBlue
import com.prototype.fleetonix.ui.theme.Midnight
import com.prototype.fleetonix.ui.theme.TextPrimary
import com.prototype.fleetonix.ui.theme.TextSecondary
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import retrofit2.HttpException

@Composable
fun OTPVerifyScreen(
    userId: String,
    userEmail: String,
    onVerified: (DriverLoginData, String) -> Unit,
    onBack: () -> Unit
) {
    var otpCode by rememberSaveable { mutableStateOf("") }
    var isLoading by rememberSaveable { mutableStateOf(false) }
    var errorMessage by rememberSaveable { mutableStateOf<String?>(null) }
    var timeLeft by rememberSaveable { mutableStateOf(300) } // 5 minutes in seconds
    var isResending by rememberSaveable { mutableStateOf(false) }
    val scrollState = rememberScrollState()
    val scope = rememberCoroutineScope()
    val db = remember { com.google.firebase.firestore.FirebaseFirestore.getInstance() }

    // Countdown timer
    LaunchedEffect(timeLeft) {
        if (timeLeft > 0) {
            delay(1000)
            timeLeft--
        }
    }

    val minutes = timeLeft / 60
    val seconds = timeLeft % 60
    val timeString = String.format("%d:%02d", minutes, seconds)

    fun verifyOTP() {
        val trimmedOtp = otpCode.trim()
        if (trimmedOtp.length != 6 || !trimmedOtp.all { it.isDigit() }) {
            errorMessage = "Please enter a valid 6-digit OTP code"
            return
        }

        scope.launch {
            try {
                isLoading = true
                errorMessage = null

                if (BuildConfig.DEBUG) {
                    android.util.Log.d("OTPVerifyScreen", "Verifying OTP via Firestore for $userEmail")
                }

                var otpDoc = db.collection("otps").document(userId).get().await()
                var sourceCollection = "otps"
                
                // FALLBACK: Check registration_otps for new driver activation
                if (!otpDoc.exists()) {
                    otpDoc = db.collection("registration_otps").document(userEmail.lowercase().trim()).get().await()
                    sourceCollection = "registration_otps"
                }

                if (!otpDoc.exists()) {
                    errorMessage = "OTP not found. Please click resend to get a new code."
                    isLoading = false
                    return@launch
                }

                // Check for 'otp' field (otps col) or 'code' field (registration_otps col)
                val storedOtp = otpDoc.getString("otp") ?: otpDoc.getString("code")
                val expiresAt = otpDoc.getTimestamp("expires_at")
                
                if (storedOtp == trimmedOtp) {
                    if (expiresAt != null && expiresAt.toDate().after(java.util.Date())) {
                        // Success!
                        if (BuildConfig.DEBUG) {
                            android.util.Log.d("OTPVerifyScreen", "OTP verified successfully via $sourceCollection")
                        }
                        
                        // Delete OTP after success
                        db.collection(sourceCollection).document(otpDoc.id).delete()
                        
                        // Prepare DriverLoginData
                        val userDoc = db.collection("users").document(userId).get().await()
                        val userData = userDoc.data
                        
                        val driverSnap = db.collection("drivers")
                            .whereEqualTo("driver_email", userEmail)
                            .get()
                            .await()
                        val driverData = driverSnap.documents.firstOrNull()?.data

                        val loginData = DriverLoginData(
                            sessionToken = "firebase_$userId",
                            user = DriverUser(
                                id = userId,
                                userType = "driver",
                                name = userData?.get("full_name") as? String,
                                email = userEmail
                            ),
                            driver = DriverProfile(
                                id = driverSnap.documents.firstOrNull()?.id,
                                profileImageUrl = driverData?.get("profile_image_url") as? String,
                                carDetails = driverData?.get("car_details") as? String,
                                carColor = driverData?.get("car_color") as? String,
                                vehicleAssigned = driverData?.get("vehicle_assigned") as? String,
                                vehicleType = driverData?.get("vehicle_type") as? String,
                                plateNumber = driverData?.get("plate_number") as? String,
                                currentMileage = (driverData?.get("current_mileage") as? Number)?.toDouble(),
                                currentStatus = driverData?.get("current_status") as? String ?: "available"
                            )
                        )
                        onVerified(loginData, trimmedOtp)
                    } else {
                        errorMessage = "OTP has expired. Please login again."
                    }
                } else {
                    errorMessage = "Invalid OTP code. Please try again."
                }
            } catch (ex: Exception) {
                android.util.Log.e("OTPVerifyScreen", "Exception during OTP verification", ex)
                errorMessage = ex.message ?: "Verification failed"
            } finally {
                isLoading = false
            }
        }
    }

    fun resendOTP() {
        scope.launch {
            try {
                isResending = true
                errorMessage = null

                val response = FleetonixApi.driverService.forgotPassword(
                    ForgotPasswordRequest(email = userEmail.trim().lowercase())
                )

                if (response.success) {
                    timeLeft = 300 // Reset timer
                    errorMessage = null
                } else {
                    errorMessage = "Failed to resend OTP: ${response.message}"
                }
            } catch (ex: Exception) {
                errorMessage = "Failed to resend OTP: ${ex.message}"
            } finally {
                isResending = false
            }
        }
    }

    // Safe auto-trigger: Send OTP only if not already sent this session
    var hasSentInitialOTP by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (!hasSentInitialOTP) {
            hasSentInitialOTP = true
            // Small delay to allow Firestore/Email propagation from Admin Dashboard
            delay(2000)
            resendOTP()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Midnight)
            .verticalScroll(scrollState)
            .padding(24.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(48.dp))
            
            Text(
                text = "Verify Your Email",
                color = TextPrimary,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            
            Text(
                text = "We've sent a 6-digit OTP code to",
                color = TextSecondary,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center
            )
            
            Text(
                text = userEmail,
                color = TextPrimary,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(20.dp))

            OutlinedTextField(
                value = otpCode,
                onValueChange = { 
                    // Only allow 6 digits
                    if (it.length <= 6 && it.all { char -> char.isDigit() }) {
                        otpCode = it
                    }
                },
                label = { Text("Enter 6-digit OTP") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = CardBlue,
                    unfocusedContainerColor = CardBlue,
                    focusedIndicatorColor = AccentTeal,
                    unfocusedIndicatorColor = DividerBlue,
                    focusedLabelColor = AccentTeal,
                    unfocusedLabelColor = TextSecondary,
                    cursorColor = AccentTeal,
                    focusedTextColor = TextPrimary,
                    unfocusedTextColor = TextPrimary
                ),
                placeholder = { Text("000000", color = TextSecondary) }
            )

            if (timeLeft > 0) {
                Text(
                    text = "Code expires in: $timeString",
                    color = if (timeLeft < 60) Color(0xFFFF6B6B) else AccentTeal,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            } else {
                Text(
                    text = "OTP expired. Please request a new one.",
                    color = Color(0xFFFF6B6B),
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            if (!errorMessage.isNullOrBlank()) {
                Text(
                    text = errorMessage ?: "",
                    color = Color(0xFFFF6B6B),
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Button(
                onClick = { verifyOTP() },
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                enabled = !isLoading && otpCode.length == 6 && timeLeft > 0
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text("Verify OTP")
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Didn't receive the code? ",
                    color = TextSecondary,
                    style = MaterialTheme.typography.bodySmall
                )
                TextButton(
                    onClick = { resendOTP() },
                    enabled = !isResending && timeLeft <= 0
                ) {
                    if (isResending) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = AccentTeal,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text("Resend", color = AccentTeal)
                    }
                }
            }

            TextButton(
                onClick = onBack,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Back to Login", color = TextSecondary)
            }
        }
    }
}

