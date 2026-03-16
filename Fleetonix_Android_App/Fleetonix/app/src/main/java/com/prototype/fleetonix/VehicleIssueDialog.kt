package com.prototype.fleetonix

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.prototype.fleetonix.ui.theme.AccentOrange
import com.prototype.fleetonix.ui.theme.TextPrimary
import com.prototype.fleetonix.ui.theme.TextSecondary

// Predefined vehicle issue options
val VEHICLE_ISSUE_OPTIONS = listOf(
    "Engine Problem",
    "Brake Issue",
    "Tire Problem",
    "Battery Dead",
    "Overheating",
    "Electrical Problem",
    "Transmission Issue",
    "Fuel Problem",
    "AC Not Working",
    "Lights Not Working",
    "Other"
)

@Composable
fun VehicleIssueDialog(
    onDismiss: () -> Unit,
    onReport: (String, String?) -> Unit,
    isReporting: Boolean = false
) {
    var selectedIssue by remember { mutableStateOf<String?>(null) }
    var otherDescription by remember { mutableStateOf("") }
    var showOtherInput by remember { mutableStateOf(false) }
    
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = !isReporting,
            dismissOnClickOutside = !isReporting
        )
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp)
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Icon
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .background(
                            AccentOrange.copy(alpha = 0.2f),
                            shape = RoundedCornerShape(32.dp)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Build,
                        contentDescription = "Vehicle Issue",
                        tint = AccentOrange,
                        modifier = Modifier.size(32.dp)
                    )
                }
                
                // Title
                Text(
                    text = "Report Vehicle Issue",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary,
                    textAlign = TextAlign.Center
                )
                
                // Message
                Text(
                    text = "Select the type of vehicle issue you're experiencing:",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 8.dp)
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                // Issue options
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    VEHICLE_ISSUE_OPTIONS.forEach { issue ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !isReporting) {
                                    if (issue == "Other") {
                                        selectedIssue = issue
                                        showOtherInput = true
                                    } else {
                                        selectedIssue = issue
                                        showOtherInput = false
                                        otherDescription = ""
                                    }
                                },
                            colors = CardDefaults.cardColors(
                                containerColor = if (selectedIssue == issue) {
                                    AccentOrange.copy(alpha = 0.2f)
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant
                                }
                            ),
                            border = if (selectedIssue == issue) {
                                androidx.compose.foundation.BorderStroke(2.dp, AccentOrange)
                            } else null
                        ) {
                            Text(
                                text = issue,
                                modifier = Modifier.padding(16.dp),
                                color = TextPrimary,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                }
                
                // Other description input
                if (showOtherInput && selectedIssue == "Other") {
                    OutlinedTextField(
                        value = otherDescription,
                        onValueChange = { otherDescription = it },
                        label = { Text("Describe the issue") },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !isReporting,
                        maxLines = 3,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = AccentOrange,
                            unfocusedBorderColor = TextSecondary
                        )
                    )
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                
                // Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Cancel Button
                    TextButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        enabled = !isReporting
                    ) {
                        Text("Cancel")
                    }
                    
                    // Report Button
                    Button(
                        onClick = {
                            val description = if (selectedIssue == "Other") {
                                otherDescription.takeIf { it.isNotBlank() }
                            } else {
                                selectedIssue
                            }
                            onReport(selectedIssue ?: "", description)
                        },
                        modifier = Modifier.weight(1f),
                        enabled = !isReporting && selectedIssue != null && 
                                (selectedIssue != "Other" || otherDescription.isNotBlank()),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = AccentOrange
                        )
                    ) {
                        if (isReporting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text("Report Issue")
                        }
                    }
                }
            }
        }
    }
}

