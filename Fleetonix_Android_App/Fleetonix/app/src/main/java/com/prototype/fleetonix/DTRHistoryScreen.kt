package com.prototype.fleetonix

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.prototype.fleetonix.ui.theme.*
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DTRHistoryScreen(
    onBack: () -> Unit
) {
    val db = remember { FirebaseFirestore.getInstance() }
    val auth = remember { FirebaseAuth.getInstance() }
    val uid = auth.currentUser?.uid
    
    var logs by remember { mutableStateOf<List<Map<String, Any>>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(uid) {
        if (uid != null) {
            db.collection("dtr_logs")
                .whereEqualTo("driver_uid", uid)
                .orderBy("timestamp", Query.Direction.DESCENDING)
                .limit(50)
                .addSnapshotListener { snapshot, e ->
                    isLoading = false
                    if (e == null && snapshot != null) {
                        logs = snapshot.documents.map { it.data ?: emptyMap() }
                    }
                }
        } else {
            isLoading = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Time Record History", color = TextPrimary, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Midnight)
            )
        },
        containerColor = Midnight
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = AccentTeal
                )
            } else if (logs.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(Icons.Default.History, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(64.dp))
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("No time records found", color = TextSecondary)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(top = 16.dp, bottom = 32.dp)
                ) {
                    items(logs) { log ->
                        DTRLogCard(log)
                    }
                }
            }
        }
    }
}

@Composable
fun DTRLogCard(log: Map<String, Any>) {
    val action = log["action"] as? String ?: "Unknown"
    val timestamp = log["timestamp"] as? com.google.firebase.Timestamp
    val location = log["location_name"] as? String ?: "GPS Recorded"
    val totalHours = log["total_hours"] as? Double ?: 0.0
    val isOvertime = log["is_overtime"] as? Boolean ?: false
    
    val dateTime = timestamp?.toDate()?.toInstant()?.atZone(ZoneId.systemDefault())?.toLocalDateTime()
    val dateStr = dateTime?.format(DateTimeFormatter.ofPattern("MMM dd, yyyy")) ?: "N/A"
    val timeStr = dateTime?.format(DateTimeFormatter.ofPattern("hh:mm a")) ?: "N/A"

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = CardBlue),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .background(
                                if (action == "time_in") AccentTeal else AccentOrange,
                                RoundedCornerShape(2.dp)
                            )
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = action.replace("_", " ").uppercase(),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = if (action == "time_in") AccentTeal else AccentOrange
                    )
                }
                Text(
                    text = dateStr,
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom
            ) {
                Column {
                    Text(
                        text = timeStr,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    Text(
                        text = location,
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                        maxLines = 1
                    )
                }
                
                if (action == "time_out" && totalHours > 0) {
                    Column(horizontalAlignment = Alignment.End) {
                        if (isOvertime) {
                            Surface(
                                color = AccentOrange.copy(alpha = 0.2f),
                                shape = RoundedCornerShape(4.dp)
                            ) {
                                Text(
                                    text = "OVERTIME",
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = AccentOrange,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                        }
                        
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Timer, contentDescription = null, tint = AccentTeal, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            val h = totalHours.toInt()
                            val m = ((totalHours - h) * 60).toInt()
                            Text(
                                text = "${h}h ${m}m",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = AccentTeal
                            )
                        }
                    }
                }
            }
        }
    }
}
