package com.prototype.fleetonix

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Map
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
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
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Trip Tickets History", color = TextPrimary) },
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
            }
        }
    }
}
