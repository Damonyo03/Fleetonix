package com.prototype.fleetonix

import android.util.Patterns
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.clickable
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MenuAnchorType
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import com.google.firebase.firestore.FirebaseFirestore
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.prototype.fleetonix.ui.theme.AccentTeal
import com.prototype.fleetonix.ui.theme.CardBlue
import com.prototype.fleetonix.ui.theme.DividerBlue
import com.prototype.fleetonix.ui.theme.Midnight
import com.prototype.fleetonix.ui.theme.TextPrimary
import com.prototype.fleetonix.ui.theme.TextSecondary
import androidx.compose.material3.ExperimentalMaterial3Api
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegisterScreen(
    onOTPSent: (UserRegistrationData, String) -> Unit,
    onBackToLogin: () -> Unit
) {
    var fullName by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var selectedRole by rememberSaveable { mutableStateOf("driver") }
    
    var passwordVisible by rememberSaveable { mutableStateOf(false) }
    var isLoading by rememberSaveable { mutableStateOf(false) }
    var errorMessage by rememberSaveable { mutableStateOf<String?>(null) }
    
    // Company Selection State
    var companies by remember { mutableStateOf<List<AccreditedCompany>>(emptyList()) }
    var selectedCompany by remember { mutableStateOf<AccreditedCompany?>(null) }
    var isCompanyExpanded by remember { mutableStateOf(false) }
    
    val scrollState = rememberScrollState()
    val scope = rememberCoroutineScope()

    // Fetch companies on launch
    LaunchedEffect(Unit) {
        val db = FirebaseFirestore.getInstance()
        db.collection("accredited_companies")
            .whereEqualTo("status", "active")
            .get()
            .addOnSuccessListener { result ->
                val list = result.documents.mapNotNull { doc ->
                    val name = doc.getString("name") ?: ""
                    AccreditedCompany(id = doc.id, name = name)
                }
                companies = list
            }
            .addOnFailureListener {
                errorMessage = "Failed to load companies. Please check your connection."
            }
    }

    fun attemptSendOTP() {
        val trimmedFullName = fullName.trim()
        val trimmedEmail = email.trim()
        val trimmedPhone = phone.trim()
        
        if (trimmedFullName.isBlank()) {
            errorMessage = "Full Name is required"
            return
        }
        if (!Patterns.EMAIL_ADDRESS.matcher(trimmedEmail).matches()) {
            errorMessage = "Enter a valid email address"
            return
        }
        if (password.length < 6) {
            errorMessage = "Password must be at least 6 characters"
            return
        }
        if (selectedCompany == null) {
            errorMessage = "Please select your company"
            return
        }

        scope.launch {
            try {
                isLoading = true
                errorMessage = null
                
                val request = RegistrationOTPRequest(email = trimmedEmail)
                val response = FleetonixApi.driverService.sendRegistrationOTP(request)
                
                if (response.success) {
                    val userData = UserRegistrationData(
                        full_name = trimmedFullName,
                        password = password,
                        phone = trimmedPhone.ifBlank { null },
                        accredited_company_id = selectedCompany?.id,
                        role = selectedRole
                    )
                    onOTPSent(userData, trimmedEmail)
                } else {
                    errorMessage = response.message ?: "Failed to send OTP. Try again."
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
            verticalArrangement = Arrangement.SpaceBetween,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth()
            ) {
                Spacer(modifier = Modifier.height(24.dp))
                Image(
                    painter = painterResource(id = R.drawable.logo),
                    contentDescription = "Fleetonix logo",
                    modifier = Modifier.size(100.dp)
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text("Create an Account", color = TextPrimary, style = MaterialTheme.typography.titleLarge)
                Text(
                    "Register to start driving with Fleetonix",
                    color = TextSecondary,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = fullName,
                onValueChange = { fullName = it },
                label = { Text("Full Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = textFieldColors()
            )

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = textFieldColors()
            )

            OutlinedTextField(
                value = phone,
                onValueChange = { phone = it },
                label = { Text("Phone Number (Optional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = textFieldColors()
            )

            // Accredited Company Selection
            Text(
                text = "Accredited Company",
                color = TextSecondary,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Start
            )
            ExposedDropdownMenuBox(
                expanded = isCompanyExpanded,
                onExpandedChange = { isCompanyExpanded = !isCompanyExpanded },
                modifier = Modifier.fillMaxWidth()
            ) {
                OutlinedTextField(
                    value = selectedCompany?.name ?: "",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Select Company") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isCompanyExpanded) },
                    colors = textFieldColors(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable, true)
                )

                ExposedDropdownMenu(
                    expanded = isCompanyExpanded,
                    onDismissRequest = { isCompanyExpanded = false },
                    modifier = Modifier.background(CardBlue)
                ) {
                    companies.forEach { company ->
                        DropdownMenuItem(
                            text = { Text(company.name, color = TextPrimary) },
                            onClick = {
                                selectedCompany = company
                                isCompanyExpanded = false
                            }
                        )
                    }
                }
            }

            Text(
                text = "I am registering as a:",
                color = TextSecondary,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Start
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { selectedRole = "driver" }
                ) {
                    RadioButton(
                        selected = selectedRole == "driver",
                        onClick = { selectedRole = "driver" },
                        colors = RadioButtonDefaults.colors(
                            selectedColor = AccentTeal,
                            unselectedColor = TextSecondary
                        )
                    )
                    Text("Driver", color = TextPrimary)
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { selectedRole = "client" }
                ) {
                    RadioButton(
                        selected = selectedRole == "client",
                        onClick = { selectedRole = "client" },
                        colors = RadioButtonDefaults.colors(
                            selectedColor = AccentTeal,
                            unselectedColor = TextSecondary
                        )
                    )
                    Text("Client", color = TextPrimary)
                }
            }

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                singleLine = true,
                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            imageVector = if (passwordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                            contentDescription = if (passwordVisible) "Hide password" else "Show password",
                            tint = if (passwordVisible) AccentTeal else TextSecondary
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = textFieldColors()
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
        }

            Column(
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 24.dp)
            ) {
                Button(
                    onClick = { attemptSendOTP() },
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
                        Text("Next: Verify Email")
                    }
                }
                TextButton(
                    onClick = onBackToLogin,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Already have an account? Log in", color = AccentTeal)
                }
            }
        }
    }
}

@Composable
private fun textFieldColors() = TextFieldDefaults.colors(
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
