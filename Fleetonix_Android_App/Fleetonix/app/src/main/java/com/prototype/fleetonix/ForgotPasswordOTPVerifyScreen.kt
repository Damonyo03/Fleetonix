package com.prototype.fleetonix

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
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
import retrofit2.HttpException
import org.json.JSONObject
import android.util.Log

@Composable
fun ForgotPasswordOTPVerifyScreen(
    userId: String,
    userEmail: String,
    onVerified: (String) -> Unit,
    onResent: (ForgotPasswordData) -> Unit,
    onBack: () -> Unit
) {
    var otpCode by rememberSaveable { mutableStateOf("") }
    var isLoading by rememberSaveable { mutableStateOf(false) }
    var errorMessage by rememberSaveable { mutableStateOf<String?>(null) }
    var timeLeft by rememberSaveable { mutableStateOf(300) } // 5 minutes in seconds
    var isResending by rememberSaveable { mutableStateOf(false) }
    val scrollState = rememberScrollState()
    val scope = rememberCoroutineScope()

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

                val response = FleetonixApi.driverService.verifyForgotPasswordOTP(
                    DriverOTPVerifyRequest(
                        userId = userId,
                        otpCode = trimmedOtp
                    )
                )

                if (response.success) {
                    errorMessage = null // Clear error immediately
                    onVerified(trimmedOtp.trim()) // Ensure absolutely clean string
                } else {
                    errorMessage = response.message.ifBlank { "Invalid OTP code" }
                }
            } catch (ex: HttpException) {
                val errorBody = ex.response()?.errorBody()?.string()
                Log.e("ForgotPasswordOTPVerify", "HTTP Error $errorBody")
                errorMessage = try {
                    val json = JSONObject(errorBody ?: "")
                    json.getString("message")
                } catch (e: Exception) {
                    "OTP error (HTTP ${ex.code()}). Please request a new one."
                }
            } catch (ex: Exception) {
                Log.e("ForgotPasswordOTPVerifyScreen", "Exception during OTP verification", ex)
                errorMessage = "Network error occurred. Please try again.\n(${ex.localizedMessage})"
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

                if (response.success && response.data != null) {
                    timeLeft = 300 // Reset timer
                    errorMessage = null
                    onResent(response.data) // Update global state
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

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Midnight)
            .statusBarsPadding()
            .navigationBarsPadding(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 500.dp)
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(24.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Spacer(modifier = Modifier.height(24.dp))
                
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
                        Text("Verify OTP", color = Color.White)
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
                        enabled = !isResending && (timeLeft <= 240) // ENABLE AFTER 60 SECONDS
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
}

