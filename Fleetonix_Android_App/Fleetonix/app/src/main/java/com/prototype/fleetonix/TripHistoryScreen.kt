package com.prototype.fleetonix

import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.android.gms.maps.model.LatLng
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.prototype.fleetonix.ui.theme.*
import kotlinx.coroutines.tasks.await
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.*

@RequiresApi(Build.VERSION_CODES.O)
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripHistoryScreen(
    onBack: () -> Unit
) {
    val db = remember { FirebaseFirestore.getInstance() }
    val auth = remember { FirebaseAuth.getInstance() }
    var tickets by remember { mutableStateOf<List<TripHistoryItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var selectedTicket by remember { mutableStateOf<TripHistoryItem?>(null) }

    LaunchedEffect(Unit) {
        val uid = auth.currentUser?.uid ?: return@LaunchedEffect
        val email = auth.currentUser?.email ?: return@LaunchedEffect
        val emailPruned = email.lowercase().trim()

        isLoading = true
        
        // Fetch ALL tickets for this user and filter/sort in memory to avoid missing index errors
        val uidQuery = db.collection("trip_tickets")
            .whereEqualTo("driver_uid", uid)
            .limit(100)

        val emailQuery = db.collection("trip_tickets")
            .whereEqualTo("driver_email", emailPruned)
            .limit(100)

        Log.d("TripHistory", "Starting simplified queries for UID: $uid and Email: $emailPruned")

        val validStatuses = listOf("completed", "cancelled", "rejected")

        val uidListener = uidQuery.addSnapshotListener { snapshot, error ->
            if (error != null) {
                Log.e("TripHistoryScreen", "UID Query failed: ${error.message}")
                isLoading = false
                return@addSnapshotListener
            }
            if (snapshot != null) {
                val uidResults = snapshot.documents.mapNotNull { buildTripItem(it) }
                    .filter { it.status.lowercase() in validStatuses }
                
                tickets = (tickets + uidResults).distinctBy { it.id }.sortedByDescending { it.date }
                isLoading = false
            }
        }

        val emailListener = emailQuery.addSnapshotListener { snapshot, error ->
            if (error != null) {
                Log.e("TripHistoryScreen", "Email Query failed: ${error.message}")
                isLoading = false
                return@addSnapshotListener
            }
            if (snapshot != null) {
                val emailResults = snapshot.documents.mapNotNull { doc ->
                    val docUid = doc.getString("driver_uid")
                    if (docUid == null || docUid == "" || docUid == uid) {
                        buildTripItem(doc)
                    } else null
                }.filter { it.status.lowercase() in validStatuses }

                tickets = (tickets + emailResults).distinctBy { it.id }.sortedByDescending { it.date }
                isLoading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Trip History", color = TextPrimary, fontWeight = FontWeight.Bold) },
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
        if (isLoading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = AccentTeal)
            }
        } else if (tickets.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.DateRange, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(64.dp))
                    Spacer(Modifier.height(16.dp))
                    Text("No trips found yet.", color = TextSecondary)
                }
            }
        } else {
            val groupedByMonth = tickets.groupBy { 
                it.date.format(DateTimeFormatter.ofPattern("MMMM yyyy")) 
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                contentPadding = PaddingValues(bottom = 24.dp)
            ) {
                groupedByMonth.forEach { (month, monthTickets) ->
                    item {
                        Text(
                            text = month,
                            color = AccentTeal,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }
                    items(monthTickets) { ticket ->
                        HistoryCard(ticket) { selectedTicket = ticket }
                    }
                }
            }
        }
    }

    if (selectedTicket != null) {
        val ticket = selectedTicket!!
        val routePoints = GoogleMapsService.decodePolyline(ticket.polyline)
        
        TripTicketDialog(
            driverName = ticket.driverName,
            vehiclePlate = ticket.plate,
            vehicleType = "Vehicle",
            timeOfDeparture = ticket.departureTime,
            timeOfArrival = ticket.arrivalTime,
            totalKm = ticket.totalKm,
            pickupLocation = ticket.pickup,
            dropoffLocation = ticket.dropoff,
            routePoints = routePoints,
            segments = ticket.segments,
            isSubmitting = false,
            onConfirm = { selectedTicket = null }
        )
    }
}

@Composable
fun HistoryCard(item: TripHistoryItem, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { onClick() },
        colors = CardDefaults.cardColors(containerColor = CardBlue),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Midnight.copy(alpha = 0.5f))
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = item.date.format(DateTimeFormatter.ofPattern("MMM dd, yyyy · HH:mm")),
                    color = TextSecondary,
                    fontSize = 12.sp
                )
                
                // Status Badge
                val (statusColor, containerColor) = when (item.status.lowercase()) {
                    "completed" -> Color(0xFF10B981) to Color(0xFF10B981).copy(alpha = 0.1f)
                    "cancelled", "rejected" -> Color(0xFFEF4444) to Color(0xFFEF4444).copy(alpha = 0.1f)
                    "in_progress" -> Color(0xFFF59E0B) to Color(0xFFF59E0B).copy(alpha = 0.1f)
                    else -> TextSecondary to Color.Gray.copy(alpha = 0.1f)
                }
                
                Surface(
                    color = containerColor,
                    shape = RoundedCornerShape(8.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, statusColor.copy(alpha = 0.3f))
                ) {
                    Text(
                        text = item.status.uppercase(),
                        color = statusColor,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }
            }
            
            Spacer(Modifier.height(12.dp))
            Text(item.passengerName, color = TextPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
            Text("${"%.2f".format(item.totalKm)} KM travelled", color = AccentTeal, fontWeight = FontWeight.Medium, fontSize = 14.sp)
            
            Spacer(Modifier.height(16.dp))
            
            if (item.segments.isNotEmpty()) {
                // Multi-segment timeline view
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item.segments.forEachIndexed { index, segment ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Box(modifier = Modifier.size(8.dp).background(AccentBlue, androidx.compose.foundation.shape.CircleShape))
                                if (index < item.segments.size - 1 || !segment.dropoff.isNullOrBlank()) {
                                    Box(modifier = Modifier.width(2.dp).height(12.dp).background(Color.White.copy(alpha = 0.1f)))
                                }
                            }
                            Spacer(Modifier.width(12.dp))
                            Text("Pickup: ${segment.pickup}", color = TextSecondary, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        if (!segment.dropoff.isNullOrBlank()) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Box(modifier = Modifier.size(8.dp).background(AccentOrange, androidx.compose.foundation.shape.CircleShape))
                                }
                                Spacer(Modifier.width(12.dp))
                                Text("Drop-off: ${segment.dropoff}", color = TextSecondary, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            } else {
                // Legacy fallback
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.LocationOn, null, tint = AccentBlue, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(item.pickup, color = TextSecondary, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Timeline, null, tint = AccentOrange, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(item.dropoff, color = TextSecondary, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

data class TripHistoryItem(
    val id: String,
    val passengerName: String,
    val driverName: String,
    val totalKm: Double,
    val departureTime: String,
    val arrivalTime: String,
    val pickup: String,
    val dropoff: String,
    val status: String,
    val polyline: String,
    val date: LocalDateTime,
    val plate: String,
    val segments: List<DriverSegment> = emptyList()
)

@RequiresApi(Build.VERSION_CODES.O)
fun buildTripItem(doc: com.google.firebase.firestore.DocumentSnapshot): TripHistoryItem? {
    return try {
        val data = doc.data ?: return null
        val createdAt = doc.getTimestamp("created_at")?.toDate() ?: java.util.Date()
        val ldt = LocalDateTime.ofInstant(createdAt.toInstant(), java.time.ZoneId.systemDefault())

        // Robust parsing for segments
        @Suppress("UNCHECKED_CAST")
        val segmentsList = data["segments"] as? List<Map<String, Any?>>
        val segments = segmentsList?.mapNotNull { seg ->
            val pickup = seg["pickup"] as? String ?: return@mapNotNull null
            val dropoff = seg["dropoff"] as? String ?: return@mapNotNull null
            DriverSegment(pickup = pickup, dropoff = dropoff)
        } ?: emptyList()

        // Robust parsing for pickup location (handle String or Array)
        val rawPickup = data["pickup_location"]
        val pickupAddr = when (rawPickup) {
            is String -> rawPickup
            is List<*> -> {
                val map = rawPickup.firstOrNull() as? Map<*, *>
                map?.get("address") as? String ?: map?.get("text") as? String ?: "Multi-point"
            }
            else -> "Unknown"
        }

        // Robust parsing for dropoff location
        val rawDropoff = data["dropoff_location"]
        val dropoffAddr = when (rawDropoff) {
            is String -> rawDropoff
            is Map<*, *> -> rawDropoff["address"] as? String ?: rawDropoff["text"] as? String ?: "Unknown"
            else -> "Unknown"
        }

        TripHistoryItem(
            id = doc.id,
            passengerName = data["passenger_name"] as? String ?: data["client_name"] as? String ?: "Unknown",
            driverName = data["driver_name"] as? String ?: "Driver",
            totalKm = (data["total_km"] as? Number)?.toDouble() ?: (data["total_km_travelled"] as? Number)?.toDouble() ?: 0.0,
            departureTime = data["time_of_departure"] as? String ?: "--:--",
            arrivalTime = data["time_of_arrival"] as? String ?: "--:--",
            pickup = pickupAddr,
            dropoff = dropoffAddr,
            status = data["status"] as? String ?: "Completed",
            polyline = data["route_polyline"] as? String ?: "",
            date = ldt,
            plate = data["vehicle_plate"] as? String ?: data["plate_number"] as? String ?: "N/A",
            segments = segments
        )
    } catch (e: Exception) {
        null
    }
}
