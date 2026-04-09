package com.prototype.fleetonix

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.util.Base64
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.io.ByteArrayOutputStream

@Composable
fun SignatureCaptureDialog(
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit // Returns Base64 string of signature
) {
    val paths = remember { mutableStateListOf<PathState>() }
    
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .padding(16.dp),
            colors = CardDefaults.cardColors(containerColor = com.prototype.fleetonix.ui.theme.Midnight),
            shape = MaterialTheme.shapes.large,
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Driver Signature",
                    style = MaterialTheme.typography.headlineSmall,
                    color = com.prototype.fleetonix.ui.theme.TextPrimary
                )
                Text(
                    text = "Please sign inside the box to complete the trip.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = com.prototype.fleetonix.ui.theme.TextSecondary,
                    modifier = Modifier.padding(top = 8.dp, bottom = 24.dp)
                )

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(250.dp)
                        .background(Color.White, shape = MaterialTheme.shapes.medium)
                        .border(1.dp, Color(0xFF2d3447), shape = MaterialTheme.shapes.medium)
                ) {
                    SignaturePad(
                        modifier = Modifier.fillMaxSize(),
                        paths = paths
                    )
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 24.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Button(
                        onClick = { paths.clear() },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF333333)),
                        shape = MaterialTheme.shapes.medium
                    ) {
                        Text("Reset")
                    }

                    Button(
                        onClick = {
                            if (paths.isNotEmpty()) {
                                // In a real production app, we would use a more sophisticated 
                                // Canvas-to-Bitmap approach. For now, we simulate the Base64 generation.
                                // Real implementation would involve drawing the paths onto an Android Bitmap.
                                onConfirm("data:image/png;base64,SIMULATED_SIGNATURE_DATA")
                            }
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = com.prototype.fleetonix.ui.theme.AccentTeal),
                        shape = MaterialTheme.shapes.medium,
                        enabled = paths.isNotEmpty()
                    ) {
                        Text("Confirm")
                    }
                }

                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.padding(top = 8.dp)
                ) {
                    Text("Cancel", color = com.prototype.fleetonix.ui.theme.TextSecondary)
                }
            }
        }
    }
}
