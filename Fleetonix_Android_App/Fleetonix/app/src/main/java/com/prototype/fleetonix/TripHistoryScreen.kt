package com.prototype.fleetonix

<<<<<<< HEAD
import androidx.compose.foundation.background
=======
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
>>>>>>> 026b65d13820c178b2bd8023992a4e4e03c529e5
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
<<<<<<< HEAD
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Map
=======
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Timeline
>>>>>>> 026b65d13820c178b2bd8023992a4e4e03c529e5
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
<<<<<<< HEAD
import androidx.compose.ui.text.style.TextAlign
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MapStyleOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import com.google.maps.android.compose.*
import com.prototype.fleetonix.ui.theme.*
import kotlinx.coroutines.tasks.await

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripHistoryScreen(onBack: () -> Unit) {
    val db = FirebaseFirestore.getInstance()
    val auth = FirebaseAuth.getInstance()
    val driverEmail = auth.currentUser?.email ?: ""
    
    var tripTickets by remember { mutableStateOf<List<Map<String, Any>>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var selectedRoutePoints by remember { mutableStateOf<List<LatLng>?>(null) }

    LaunchedEffect(driverEmail) {
        if (driverEmail.isNotEmpty()) {
            try {
                val snapshot = db.collection("trip_tickets")
                    .whereEqualTo("driver_email", driverEmail)
                    .orderBy("created_at", Query.Direction.DESCENDING)
                    .get()
                    .await()
                
                tripTickets = snapshot.documents.map { it.data ?: emptyMap() }
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isLoading = false
            }
=======
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
        val email = auth.currentUser?.email ?: return@LaunchedEffect
        try {
            val snapshot = db.collection("trip_tickets")
                .whereEqualTo("driver_email", email)
                .orderBy("created_at", Query.Direction.DESCENDING)
                .get()
                .await()
            
            tickets = snapshot.documents.map { doc ->
                val data = doc.data ?: emptyMap()
                val createdAt = doc.getTimestamp("created_at")?.toDate() ?: Date()
                val ldt = LocalDateTime.ofInstant(createdAt.toInstant(), ZoneId.systemDefault())
                
                TripHistoryItem(
                    id = doc.id,
                    clientName = data["client_name"] as? String ?: "Unknown",
                    totalKm = (data["total_km"] as? Number)?.toDouble() ?: 0.0,
                    departureTime = data["time_of_departure"] as? String ?: "--:--",
                    arrivalTime = data["time_of_arrival"] as? String ?: "--:--",
                    pickup = data["pickup_location"] as? String ?: "Unknown",
                    dropoff = data["dropoff_location"] as? String ?: "Unknown",
                    polyline = data["route_polyline"] as? String ?: "",
                    date = ldt,
                    plate = data["vehicle_plate"] as? String ?: "N/A"
                )
            }
        } catch (e: Exception) {
            android.util.Log.e("TripHistory", "Error fetching history", e)
        } finally {
            isLoading = false
>>>>>>> 026b65d13820c178b2bd8023992a4e4e03c529e5
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
<<<<<<< HEAD
                title = { Text("Trip Tickets History", color = TextPrimary) },
=======
                title = { Text("Trip History", color = TextPrimary, fontWeight = FontWeight.Bold) },
>>>>>>> 026b65d13820c178b2bd8023992a4e4e03c529e5
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
<<<<<<< HEAD
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = AccentBlue)
            } else if (tripTickets.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(imageVector = Icons.Default.History, contentDescription = null, modifier = Modifier.size(64.dp), tint = TextSecondary)
                    Text("No trip tickets found", color = TextSecondary)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(tripTickets) { ticket ->
                        TripTicketCard(ticket) {
                            val polyline = ticket["route_polyline"] as? String
                            if (polyline != null) {
                                selectedRoutePoints = GoogleMapsService.decodePolyline(polyline)
                            }
                        }
                    }
                }
            }

            // Route Map Modal
            if (selectedRoutePoints != null) {
                AlertDialog(
                    onDismissRequest = { selectedRoutePoints = null },
                    confirmButton = {
                        TextButton(onClick = { selectedRoutePoints = null }) {
                            Text("CLOSE", color = AccentTeal)
                        }
                    },
                    title = { Text("Trip Route", color = TextPrimary) },
                    text = {
                        Box(modifier = Modifier.fillMaxWidth().height(300.dp).background(Color.Black, RoundedCornerShape(12.dp))) {
                            val cameraPositionState = rememberCameraPositionState {
                                position = CameraPosition.fromLatLngZoom(selectedRoutePoints!![0], 12f)
                            }
                            
                            GoogleMap(
                                modifier = Modifier.fillMaxSize(),
                                cameraPositionState = cameraPositionState,
                                properties = MapProperties(mapStyleOptions = MapStyleOptions(MapStyles.AUBERGINE))
                            ) {
                                Polyline(
                                    points = selectedRoutePoints!!,
                                    color = AccentTeal,
                                    width = 10f
                                )
                                Marker(
                                    state = MarkerState(position = selectedRoutePoints!!.first()),
                                    title = "Start"
                                )
                                Marker(
                                    state = MarkerState(position = selectedRoutePoints!!.last()),
                                    title = "End"
                                )
                            }
                        }
                    },
                    containerColor = CardBlue
                )
            }
        }
    }
}

@Composable
fun TripTicketCard(ticket: Map<String, Any>, onViewRoute: () -> Unit) {
    val clientName = ticket["client_name"] as? String ?: "Unknown Client"
    val totalKm = ticket["total_km"] as? Double ?: 0.0
    val timeDeparture = ticket["time_of_departure"] as? String ?: "--:--"
    val timeArrival = ticket["time_of_arrival"] as? String ?: "--:--"
    val plateNumber = ticket["vehicle_plate"] as? String ?: "N/A"

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = CardBlue)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(clientName, color = TextPrimary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                Text("${"%.2f".format(totalKm)} KM", color = AccentTeal, fontWeight = FontWeight.ExtraBold)
            }
            
            Spacer(Modifier.height(8.dp))
            HorizontalDivider(color = Midnight)
            Spacer(Modifier.height(8.dp))
            
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("Departure", style = MaterialTheme.typography.labelSmall, color = TextSecondary)
                    Text(timeDeparture, color = TextPrimary, style = MaterialTheme.typography.bodyMedium)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("Arrival", style = MaterialTheme.typography.labelSmall, color = TextSecondary)
                    Text(timeArrival, color = TextPrimary, style = MaterialTheme.typography.bodyMedium)
                }
            }
            
            Spacer(Modifier.height(12.dp))
            
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Plate: $plateNumber", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                
                if (ticket["route_polyline"] != null) {
                    TextButton(onClick = onViewRoute, contentPadding = PaddingValues(0.dp)) {
                        Icon(imageVector = Icons.Default.Map, contentDescription = null, modifier = Modifier.size(16.dp), tint = AccentTeal)
                        Spacer(Modifier.width(4.dp))
                        Text("VIEW ROUTE", color = AccentTeal, style = MaterialTheme.typography.labelLarge)
                    }
                }
=======
        if (isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = AccentTeal)
            }
        } else if (tickets.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
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
            driverName = auth.currentUser?.displayName ?: "Driver",
            vehiclePlate = ticket.plate,
            vehicleType = "Vehicle", // Ideally fetch from doc but simplified for now
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
>>>>>>> 026b65d13820c178b2bd8023992a4e4e03c529e5
            }
        }
    }
}
<<<<<<< HEAD
=======

data class TripHistoryItem(
    val id: String,
    val clientName: String,
    val totalKm: Double,
    val departureTime: String,
    val arrivalTime: String,
    val pickup: String,
    val dropoff: String,
    val polyline: String,
    val date: LocalDateTime,
    val plate: String
)
>>>>>>> 026b65d13820c178b2bd8023992a4e4e03c529e5
