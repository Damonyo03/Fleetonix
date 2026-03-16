package com.prototype.fleetonix

import android.util.Patterns
import androidx.compose.foundation.Image
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.Icons.Default
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.prototype.fleetonix.ui.theme.AccentTeal
import com.prototype.fleetonix.ui.theme.CardBlue
import com.prototype.fleetonix.ui.theme.DividerBlue
import com.prototype.fleetonix.ui.theme.Midnight
import com.prototype.fleetonix.ui.theme.TextPrimary
import com.prototype.fleetonix.ui.theme.TextSecondary
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onForgotPassword: () -> Unit = {}
) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var passwordVisible by rememberSaveable { mutableStateOf(false) }
    var isLoading by rememberSaveable { mutableStateOf(false) }
    var errorMessage by rememberSaveable { mutableStateOf<String?>(null) }
    val scrollState = rememberScrollState()
    val scope = rememberCoroutineScope()
    val auth = remember { FirebaseAuth.getInstance() }

    fun attemptLogin() {
        val trimmedEmail = email.trim()
        if (!Patterns.EMAIL_ADDRESS.matcher(trimmedEmail).matches()) {
            errorMessage = "Enter a valid email address"
            return
        }
        if (password.isBlank()) {
            errorMessage = "Password is required"
            return
        }
        scope.launch {
            try {
                isLoading = true
                errorMessage = null
                
                // Firebase direct login
                val authResult = auth.signInWithEmailAndPassword(trimmedEmail, password).await()
                val user = authResult.user
                
                if (user != null) {
                    // Check user role in Firestore
                    val db = FirebaseFirestore.getInstance()
                    val userDoc = db.collection("users").document(user.uid).get().await()
                    
                    if (userDoc.exists() && userDoc.getString("user_type") == "driver") {
                        // Generate and store 6-digit OTP for driver
                        val otp = (100000..999999).random().toString()
                        val otpData = hashMapOf(
                            "email" to user.email,
                            "otp" to otp,
                            "created_at" to com.google.firebase.Timestamp.now(),
                            "expires_at" to com.google.firebase.Timestamp(System.currentTimeMillis() / 1000 + 300, 0) // 5 mins
                        )
                        db.collection("otp_codes").document(user.uid).set(otpData).await()
                        
                        Log.d("LoginScreen", "Generated OTP for ${user.email}: $otp")
                        // In a real app, a Cloud Function would trigger an email send here
                    }
                }
                
                // Upon success, update presence and notify flow
                PresenceManager.updateStatus(true)
                onLoginSuccess()
                
            } catch (ex: Exception) {
                errorMessage = ex.message ?: "Authentication failed"
                ex.printStackTrace()
            } finally {
                isLoading = false
            }
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
            Image(
                painter = painterResource(id = R.drawable.logo),
                contentDescription = "Fleetonix logo",
                modifier = Modifier.size(160.dp)
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text("Welcome back, driver", color = TextSecondary)
            Text(
                "Sign in to start your assigned schedule",
                color = TextPrimary,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center
            )

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email") },
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

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                singleLine = true,
                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            imageVector = if (passwordVisible) Default.Visibility else Default.VisibilityOff,
                            contentDescription = if (passwordVisible) "Hide password" else "Show password",
                            tint = if (passwordVisible) AccentTeal else TextSecondary
                        )
                    }
                },
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

            if (!errorMessage.isNullOrBlank()) {
                Text(
                    text = errorMessage ?: "",
                    color = Color(0xFFFF6B6B),
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.bodySmall
                )
            }

            TextButton(onClick = onForgotPassword) {
                Text("Forgot password?", color = AccentTeal)
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Button(
                onClick = { attemptLogin() },
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                enabled = !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text("Login & Go Online")
                }
            }
            Text(
                text = "By logging in you agree to comply with Fleetonix driver policies.",
                color = TextSecondary,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}
