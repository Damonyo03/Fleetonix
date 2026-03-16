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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.prototype.fleetonix.ui.theme.CardBlue
import com.prototype.fleetonix.ui.theme.Midnight
import com.prototype.fleetonix.ui.theme.TextPrimary
import com.prototype.fleetonix.ui.theme.TextSecondary

@Composable
fun DriverProfile(
    session: DriverLoginData,
    onBack: () -> Unit
) {
    val driver = session.driver
    val user = session.user
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Midnight)
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Header with back button
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Driver's Profile",
                color = TextPrimary,
                style = MaterialTheme.typography.headlineSmall
            )
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.Default.ArrowBack,
                    contentDescription = "Back",
                    tint = TextPrimary
                )
            }
        }
        
        // Driver Information
        Text("Driver Information", color = TextSecondary)
        Card(
            colors = CardDefaults.cardColors(containerColor = CardBlue),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                ProfileRow(label = "Full Name: ", value = user?.name ?: "N/A")
                ProfileRow(label = "Email: ", value = user?.email ?: "N/A")
                ProfileRow(label = "User ID: ", value = user?.id?.toString() ?: "N/A")
            }
        }
        
        // Vehicle Information
        Text("Vehicle Information", color = TextSecondary)
        Card(
            colors = CardDefaults.cardColors(containerColor = CardBlue),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                ProfileRow(label = "License Number: ", value = driver?.licenseNumber ?: "N/A")
                ProfileRow(label = "Vehicle Assigned: ", value = driver?.vehicleAssigned ?: "N/A")
                ProfileRow(label = "Plate Number: ", value = driver?.plateNumber ?: "N/A")
                ProfileRow(label = "Current Status: ", value = driver?.currentStatus?.replace("_", " ")?.capitalize() ?: "N/A")
            }
        }
    }
}

@Composable
private fun ProfileRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            color = TextSecondary,
            style = MaterialTheme.typography.bodyMedium
        )
        Text(
            text = value,
            color = TextPrimary,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f)
        )
    }
}

