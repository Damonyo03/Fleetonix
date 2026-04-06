package com.prototype.fleetonix

import android.os.Build
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
        
        // Listen to BOTH UID and Email queries to ensure no records (like the 14.07km one) are missed
        val uidQuery = db.collection("trip_tickets")
            .whereEqualTo("driver_uid", uid)
            .whereEqualTo("isOfficial", true)
            .orderBy("created_at", Query.Direction.DESCENDING)

        val emailQuery = db.collection("trip_tickets")
            .whereEqualTo("driver_email", emailPruned)
            .whereEqualTo("isOfficial", true)
            .orderBy("created_at", Query.Direction.DESCENDING)

        val uidListener = uidQuery.addSnapshotListener { snapshot, _ ->
            if (snapshot != null) {
                val uidResults = snapshot.documents.mapNotNull { buildTripItem(it) }
                // Merge and update
                tickets = (tickets + uidResults).distinctBy { it.id }.sortedByDescending { it.date }
                isLoading = false
            }
        }

        val emailListener = emailQuery.addSnapshotListener { snapshot, _ ->
            if (snapshot != null) {
                // IMPORTANT: Filter out trips with this email that belong to a DIFFERENT UID
                // This prevents leakage from other accounts (like the April 03 trips which are "not his")
                val emailResults = snapshot.documents.mapNotNull { doc ->
                    val docUid = doc.getString("driver_uid")
                    if (docUid == null || docUid == "" || docUid == uid) {
                        buildTripItem(doc)
                    } else {
                        null
                    }
                }
                // Merge and update
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
            routePoints = routePoints,
            isSubmitting = false,
            onConfirm = { selectedTicket = null }
        )
    }
}

@Composable
fun HistoryCard(item: TripHistoryItem, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
        colors = CardDefaults.cardColors(containerColor = CardBlue),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Midnight.copy(alpha = 0.5f))
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    text = item.date.format(DateTimeFormatter.ofPattern("MMM dd, yyyy")),
                    color = TextSecondary,
                    fontSize = 12.sp
                )
                Text(
                    text = "${"%.2f".format(item.totalKm)} KM",
                    color = AccentTeal,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )
            }
            Spacer(Modifier.height(12.dp))
            Text(item.clientName, color = TextPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
            Spacer(Modifier.height(8.dp))
            
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.LocationOn, null, tint = AccentBlue, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text(item.pickup, color = TextSecondary, fontSize = 13.sp, maxLines = 1)
            }
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Timeline, null, tint = AccentOrange, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text(item.dropoff, color = TextSecondary, fontSize = 13.sp, maxLines = 1)
            }
        }
    }
}

data class TripHistoryItem(
    val id: String,
    val clientName: String,
    val driverName: String,
    val totalKm: Double,
    val departureTime: String,
    val arrivalTime: String,
    val pickup: String,
    val dropoff: String,
    val polyline: String,
    val date: LocalDateTime,
    val plate: String
)

@RequiresApi(Build.VERSION_CODES.O)
fun buildTripItem(doc: com.google.firebase.firestore.DocumentSnapshot): TripHistoryItem? {
    return try {
        val data = doc.data ?: return null
        val createdAt = doc.getTimestamp("created_at")?.toDate() ?: java.util.Date()
        val ldt = LocalDateTime.ofInstant(createdAt.toInstant(), java.time.ZoneId.systemDefault())
        TripHistoryItem(
            id = doc.id,
            clientName = data["client_name"] as? String ?: "Unknown",
            driverName = data["driver_name"] as? String ?: "Driver",
            totalKm = (data["total_km"] as? Number)?.toDouble() ?: 0.0,
            departureTime = data["time_of_departure"] as? String ?: "--:--",
            arrivalTime = data["time_of_arrival"] as? String ?: "--:--",
            pickup = data["pickup_location"] as? String ?: "Unknown",
            dropoff = data["dropoff_location"] as? String ?: "Unknown",
            polyline = data["route_polyline"] as? String ?: "",
            date = ldt,
            plate = data["vehicle_plate"] as? String ?: "N/A"
        )
    } catch (e: Exception) {
        null
    }
}
