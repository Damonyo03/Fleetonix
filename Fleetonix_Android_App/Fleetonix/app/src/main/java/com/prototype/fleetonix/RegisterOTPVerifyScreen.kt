package com.prototype.fleetonix

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.prototype.fleetonix.ui.theme.AccentTeal
import com.prototype.fleetonix.ui.theme.CardBlue
import com.prototype.fleetonix.ui.theme.DividerBlue
import com.prototype.fleetonix.ui.theme.Midnight
import com.prototype.fleetonix.ui.theme.TextPrimary
import com.prototype.fleetonix.ui.theme.TextSecondary
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import androidx.compose.runtime.LaunchedEffect
@Composable
fun RegisterOTPVerifyScreen(
    userData: UserRegistrationData,
    email: String,
    onRegistrationComplete: () -> Unit,
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

    fun attemptVerifyOTP() {
        if (otpCode.length < 6) {
            errorMessage = "Please enter the 6-digit OTP"
            return
        }

        scope.launch {
            try {
                isLoading = true
                errorMessage = null
                
                val request = CompleteRegistrationRequest(
                    email = email,
                    otp = otpCode,
                    userData = userData
                )
                val response = FleetonixApi.driverService.completeRegistration(request)
                
                if (response.success) {
                    onRegistrationComplete()
                } else {
                    errorMessage = response.message ?: "Invalid OTP or registration failed"
                }
            } catch (ex: Exception) {
                errorMessage = ex.message ?: "Network error. Please try again."
                ex.printStackTrace()
            } finally {
                isLoading = false
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
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Column(
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth()
            ) {
                Spacer(modifier = Modifier.height(32.dp))
            Image(
                painter = painterResource(id = R.drawable.logo),
                contentDescription = "Fleetonix logo",
                modifier = Modifier.size(100.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text("Verify Email", color = TextPrimary, style = MaterialTheme.typography.titleLarge)
            Text(
                "We sent a 6-digit verification code to $email",
                color = TextSecondary,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = otpCode,
                onValueChange = { if (it.length <= 6) otpCode = it },
                label = { Text("6-Digit OTP") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
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
                )
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

            Column(
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 24.dp)
            ) {
                Button(
                    onClick = { attemptVerifyOTP() },
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
                        Text("Complete Registration")
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
                        onClick = {
                            scope.launch {
                                try {
                                    isResending = true
                                    errorMessage = null
                                    val response = FleetonixApi.driverService.sendRegistrationOTP(
                                        RegistrationOTPRequest(email = email)
                                    )
                                    if (response.success) {
                                        timeLeft = 300 // Reset timer
                                        errorMessage = null
                                    } else {
                                        errorMessage = "Failed to resend OTP: ${response.message}"
                                    }
                                } catch (ex: Exception) {
                                    errorMessage = "Network error. Please try again."
                                } finally {
                                    isResending = false
                                }
                            }
                        },
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
                    Text("Back", color = AccentTeal)
                }
            }
        }
    }
}
