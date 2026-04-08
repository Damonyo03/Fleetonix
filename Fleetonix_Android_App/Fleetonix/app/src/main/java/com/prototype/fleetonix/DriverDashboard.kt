package com.prototype.fleetonix

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import android.os.Looper
import android.provider.Settings
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.activity.compose.BackHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.android.gms.location.*
import com.google.android.gms.tasks.CancellationTokenSource
import com.prototype.fleetonix.ui.theme.*
import kotlinx.coroutines.*
import kotlinx.coroutines.tasks.await
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.*
import com.google.firebase.Timestamp
import com.google.android.gms.maps.*
import com.google.android.gms.maps.model.*
import com.google.maps.android.compose.*
import java.time.*
import java.time.format.*
import com.google.firebase.storage.FirebaseStorage

@Composable
fun StatCard(title: String, value: String, accentColor: Color, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = CardBlue)
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, color = TextSecondary, style = MaterialTheme.typography.bodySmall)
            Text(value, color = TextPrimary, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Box(
                modifier = Modifier
                    .height(4.dp)
                    .fillMaxWidth()
                    .background(accentColor.copy(alpha = 0.4f))
            )
        }
    }
}

@Composable
fun TripTicketDialog(
    driverName: String,
    vehiclePlate: String,
    vehicleType: String,
    timeOfDeparture: String,
    timeOfArrival: String,
    totalKm: Double,
    routePoints: List<LatLng>,
    segments: List<DriverSegment>? = null,
    isSubmitting: Boolean,
    onConfirm: () -> Unit
) {
    androidx.compose.ui.window.Dialog(onDismissRequest = { }) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            shape = RoundedCornerShape(24.dp),
            color = CardBlue,
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier
                    .padding(24.dp)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Header with Checkmark
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .background(AccentTeal.copy(alpha = 0.2f), androidx.compose.foundation.shape.CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = AccentTeal,
                        modifier = Modifier.size(40.dp)
                    )
                }
                
                Text(
                    "TRAVEL TRIP TICKET",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                
                Divider(color = DividerBlue, thickness = 1.dp)

                // Ticket Details
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    TicketRow("Driver", driverName)
                    TicketRow("Vehicle", "$vehicleType ($vehiclePlate)")
                    TicketRow("Departure", timeOfDeparture)
                    TicketRow("Arrival", timeOfArrival)
                }

                    Text(
                        "TRIP ROUTE (TOTAL ${"%.2f".format(totalKm)} KM)",
                        style = MaterialTheme.typography.labelSmall,
                        color = TextSecondary,
                        fontWeight = FontWeight.Bold
                    )
                }

                if (!segments.isNullOrEmpty()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Midnight, RoundedCornerShape(16.dp))
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        segments.forEachIndexed { index, segment ->
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(modifier = Modifier.size(6.dp).background(AccentTeal, androidx.compose.foundation.shape.CircleShape))
                                    Spacer(Modifier.width(8.dp))
                                    Text("P${index + 1}: ${segment.pickup}", color = Color.White, style = MaterialTheme.typography.bodySmall)
                                }
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(modifier = Modifier.size(6.dp).background(AccentOrange, androidx.compose.foundation.shape.CircleShape))
                                    Spacer(Modifier.width(8.dp))
                                    Text("D${index + 1}: ${segment.dropoff}", color = Color.White, style = MaterialTheme.typography.bodySmall)
                                }
                                if (index < segments.size - 1) {
                                    Divider(color = Color.White.copy(alpha = 0.05f), modifier = Modifier.padding(vertical = 4.dp))
                                }
                            }
                        }
                    }
                } else {

                // Map Route Visualization
                if (routePoints.isNotEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp)
                            .clip(RoundedCornerShape(16.dp))
                    ) {
                        val cameraPositionState = rememberCameraPositionState {
                            val center = if (routePoints.isNotEmpty()) routePoints[routePoints.size / 2] else LatLng(0.0, 0.0)
                            position = CameraPosition.fromLatLngZoom(center, 13f)
                        }
                        
                        LaunchedEffect(routePoints) {
                            if (routePoints.size >= 2) {
                                try {
                                    val boundsBuilder = LatLngBounds.builder()
                                    routePoints.forEach { boundsBuilder.include(it) }
                                    cameraPositionState.animate(CameraUpdateFactory.newLatLngBounds(boundsBuilder.build(), 50))
                                } catch (e: Exception) {
                                    android.util.Log.e("TripTicketDialog", "Failed to build bounds", e)
                                }
                            }
                        }

                        GoogleMap(
                            modifier = Modifier.fillMaxSize(),
                            cameraPositionState = cameraPositionState,
                            uiSettings = MapUiSettings(zoomControlsEnabled = false, rotationGesturesEnabled = false),
                            properties = MapProperties(mapStyleOptions = MapStyleOptions(MapStyles.AUBERGINE))
                        ) {
                            Polyline(
                                points = routePoints,
                                color = AccentTeal,
                                width = 10f,
                                jointType = JointType.ROUND
                            )
                            
                            // Green Start Pin
                            Marker(
                                state = MarkerState(position = routePoints.first()),
                                icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_GREEN),
                                title = "Start"
                            )
                            // Red End Pin
                            Marker(
                                state = MarkerState(position = routePoints.last()),
                                icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_RED),
                                title = "End"
                            )
                        }
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp)
                            .background(Midnight, RoundedCornerShape(16.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Route visualization unavailable", color = TextSecondary)
                    }
                }

                }

                // Confirm Button
                Button(
                    onClick = onConfirm,
                    enabled = !isSubmitting,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = AccentTeal),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    if (isSubmitting) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                    else Text("CONFIRM & CLOSE", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Midnight)
                }
            }
        }
    }
}

@Composable
fun TicketRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = TextSecondary, style = MaterialTheme.typography.bodyMedium)
        Text(value, color = TextPrimary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
    }
}

@RequiresApi(Build.VERSION_CODES.O)
@Composable
fun DriverDashboard(
    session: DriverLoginData,
    feed: DriverFeedData?,
    isFeedLoading: Boolean,
    feedError: String?,
    onRefresh: () -> Unit,
    onViewHistory: () -> Unit,
    onViewAssignments: () -> Unit,
    onLogout: () -> Unit
) {
    Log.d("DriverDashboard", "Dashboard recomposed. Schedules count: ${feed?.schedules?.size ?: 0} (Loading: $isFeedLoading)")
    val context = LocalContext.current
    val db = remember { FirebaseFirestore.getInstance() }
    val auth = remember { FirebaseAuth.getInstance() }
    val activity = context.findActivity()
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    var showProfile by remember { mutableStateOf(false) }
    var showTripHistory by remember { mutableStateOf(false) }
    var showDtrHistory by remember { mutableStateOf(false) }

    // Live Metadata States
    var liveDriverName by remember { mutableStateOf(session.user?.name ?: "Driver") }
    var accreditedCompanyId = "jettsan"

    // Accident report states
    var showAccidentDialog by remember { mutableStateOf(false) }
    var isReportingAccident by remember { mutableStateOf(false) }

    var isReportingVehicleIssue by remember { mutableStateOf(false) }
    var showVehicleIssueDialog by remember { mutableStateOf(false) }

    // NSCRP States
    var monthlyOTHours by remember { mutableStateOf(0.0) }
    var startOdometer by remember { mutableStateOf("") }
    var endOdometer by remember { mutableStateOf("") }
    var lastVehicleMileage by remember { mutableStateOf(0.0) }
    var showOdometerDialog by remember { mutableStateOf(false) }
    var showSignatureDialog by remember { mutableStateOf(false) }
    var signatureBase64 by remember { mutableStateOf<String?>(null) }
    var refusalReason by remember { mutableStateOf("") }
    
    fun getAddressFromLocation(lat: Double, lng: Double): String {
        return try {
            val geocoder = android.location.Geocoder(context, java.util.Locale.getDefault())
            val addresses = geocoder.getFromLocation(lat, lng, 1)
            if (!addresses.isNullOrEmpty()) {
                val addr = addresses[0]
                val city = addr.locality ?: addr.subAdminArea ?: ""
                val thoroughfare = addr.thoroughfare ?: ""
                if (city.isNotEmpty() && thoroughfare.isNotEmpty()) "$thoroughfare, $city"
                else city.ifEmpty { thoroughfare }.ifEmpty { "Lat: ${"%.4f".format(lat)}, Lng: ${"%.4f".format(lng)}" }
            } else {
                "Unknown Location"
            }
        } catch (e: Exception) {
            "Lat: ${"%.4f".format(lat)}, Lng: ${"%.4f".format(lng)}"
        }
    }

    // DTR (Daily Time Record) states
    var isTimedIn by remember { mutableStateOf(false) }
    var lastTimeInStr by remember { mutableStateOf<String?>(null) }
    var lastTimeInObj by remember { mutableStateOf<LocalDateTime?>(null) }
    var lastAddress by remember { mutableStateOf<String?>(null) }
    var lastTotalHours by remember { mutableStateOf<Double?>(null) }
    var lastIsOvertime by remember { mutableStateOf(false) }
    var isDtrLoading by remember { mutableStateOf(false) }
    var dtrCooldown by remember { mutableStateOf(false) }
    var latestAckMessage by remember { mutableStateOf<String?>(null) }
    var showReRoutePrompt by remember { mutableStateOf(false) }
    var isReRouting by remember { mutableStateOf(false) }

    // 3. Automated Metadata Fetching (OT & Odometer)
    LaunchedEffect(session.user?.id) {
        val uid = session.user?.id ?: return@LaunchedEffect
        
        // Calculate Monthly OT Balance (NSCRP 26h Limit)
        val startOfMonth = LocalDateTime.now().withDayOfMonth(1).withHour(0).withMinute(0)
        val startTimestamp = Timestamp(java.util.Date.from(startOfMonth.atZone(ZoneId.systemDefault()).toInstant()))
        
        db.collection("dtr_logs")
            .whereEqualTo("driver_uid", uid)
            .whereEqualTo("is_overtime", true)
            .whereGreaterThanOrEqualTo("timestamp", startTimestamp)
            .get()
            .addOnSuccessListener { logs ->
                var total = 0.0
                for (doc in logs.documents) {
                    total += doc.getDouble("total_hours") ?: 0.0
                }
                monthlyOTHours = total
                Log.d("DriverDashboard", "Monthly OT Hours: $monthlyOTHours / 26.0")
            }
            
        // 4. Fetch Last Vehicle Mileage and DTR status
        db.collection("drivers").document(uid).get().addOnSuccessListener { doc ->
            lastVehicleMileage = doc.getDouble("current_mileage") ?: 0.0
            isTimedIn = doc.getBoolean("is_currently_timed_in") ?: false
            
            // If timed in, try to reconstruct lastTimeInObj from last_time_in field
            val lastTimeInTS = doc.getTimestamp("last_time_in")
            if (lastTimeInTS != null) {
                lastTimeInObj = LocalDateTime.ofInstant(lastTimeInTS.toDate().toInstant(), ZoneId.systemDefault())
                Log.d("DriverDashboard", "Recovered last time-in: $lastTimeInObj")
            }
        }
    }

    fun parseScheduleDateTime(dateString: String?, timeString: String?): LocalDateTime? {
        if (dateString.isNullOrBlank() || timeString.isNullOrBlank()) return null
        return try {
            val date = LocalDate.parse(dateString.trim())
            val trimmedTime = timeString.trim()
            val time = try {
                LocalTime.parse(trimmedTime)
            } catch (primary: DateTimeParseException) {
                try {
                    LocalTime.parse(trimmedTime, DateTimeFormatter.ofPattern("HH:mm"))
                } catch (secondary: DateTimeParseException) {
                    LocalTime.parse(trimmedTime, DateTimeFormatter.ofPattern("hh:mm a"))
                }
            }
            LocalDateTime.of(date, time)
        } catch (ex: Exception) {
            null
        }
    }

    // GPS monitoring - continuously check if GPS is enabled
    var gpsEnabled by remember { mutableStateOf(context.isGpsEnabled()) }
    var hasLocationPermission by remember { mutableStateOf(hasLocationPermission(context)) }
    var showGpsBlockingOverlay by remember { mutableStateOf(false) }

    val permissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        contract = androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        hasLocationPermission =
            permissions[android.Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                    permissions[android.Manifest.permission.ACCESS_COARSE_LOCATION] == true
    }

    // Monitor GPS status continuously
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000) // Check every second
            val currentGpsEnabled = context.isGpsEnabled()
            val currentHasPermission = hasLocationPermission(context)

            if (!currentGpsEnabled || !currentHasPermission) {
                showGpsBlockingOverlay = true
                gpsEnabled = false
                hasLocationPermission = false
            } else if (showGpsBlockingOverlay && currentGpsEnabled && currentHasPermission) {
                showGpsBlockingOverlay = false
                gpsEnabled = true
                hasLocationPermission = true
            }
        }
    }

    // Also check on lifecycle events
    DisposableEffect(lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
                val currentGpsEnabled = context.isGpsEnabled()
                val currentHasPermission = hasLocationPermission(context)

                if (!currentGpsEnabled || !currentHasPermission) {
                    showGpsBlockingOverlay = true
                    gpsEnabled = false
                    hasLocationPermission = false
                } else {
                    showGpsBlockingOverlay = false
                    gpsEnabled = true
                    hasLocationPermission = true
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val nextSchedule = feed?.schedules?.firstOrNull { it.isOfficial == true }
    val tripPhase = nextSchedule?.trip_phase ?: "pending"
    val returnRequired = nextSchedule?.return_to_pickup == true

    // Determine which time to show in "Next Pickup" stat
    val nextPickupTime = when {
        returnRequired && (tripPhase == "return_pickup" || tripPhase == "ready_to_complete") -> {
            nextSchedule?.return_pickup_time?.let { formatScheduleTime(it) } ?: "--"
        }

        else -> {
            nextSchedule?.scheduled_time?.let { formatScheduleTime(it) } ?: "--"
        }
    }
    val stopsCount = (feed?.schedules?.size ?: 0)
    val scheduledDateTime = remember(nextSchedule?.schedule_date, nextSchedule?.scheduled_time) {
        parseScheduleDateTime(nextSchedule?.schedule_date, nextSchedule?.scheduled_time)
    }
    val isStartWindowOpen = scheduledDateTime?.let { target ->
        val diffMinutes = Duration.between(LocalDateTime.now(), target).toMinutes()
        diffMinutes <= 60
    } ?: true

    // Trip action states
    var isStartingTrip by remember { mutableStateOf(false) }
    var isMarkingPickup by remember { mutableStateOf(false) }
    var isMarkingDropoff by remember { mutableStateOf(false) }
    var endOdometerValue by remember { mutableStateOf(0.0) }
    var isMarkingReturnPickup by remember { mutableStateOf(false) }
    var isCompletingTrip by remember { mutableStateOf(false) }
    
    // Traveled Route accumulation
    val actualRoutePoints = remember { mutableStateListOf<LatLng>() }

    // Trip Ticket states
    var totalDistanceMetres by remember { mutableStateOf(0f) }
    var acceptedAt by remember { mutableStateOf<String?>(null) }
    var pickedUpAt by remember { mutableStateOf<String?>(null) }
    var completedAt by remember { mutableStateOf<String?>(null) }
    var showTripTicket by remember { mutableStateOf(false) }
    var targetTripId by remember { mutableStateOf<String?>(null) }
    var activeTicketId by remember { mutableStateOf<String?>(null) }

    // New Task Popup states
    var lastKnownScheduleId by remember { mutableStateOf<Int?>(null) }
    var showNewTaskOverlay by remember { mutableStateOf(false) }

    // Trigger reactive overlay when a new assignment arrives
    LaunchedEffect(nextSchedule?.scheduleId) {
        // Trigger if we have a new schedule and it is in the pending phase
        if (nextSchedule?.scheduleId != null && nextSchedule?.scheduleId != lastKnownScheduleId && tripPhase == "pending") {
            Log.d("DriverDashboard", "New task detected: id=${nextSchedule?.scheduleId}")
            showNewTaskOverlay = true
            lastKnownScheduleId = nextSchedule?.scheduleId
        } else if (nextSchedule?.scheduleId == null) {
            lastKnownScheduleId = null
        }
    }
    var tripActionError by remember { mutableStateOf<String?>(null) }
    var tripActionSuccess by remember { mutableStateOf<String?>(null) }

    val returnToPickup = nextSchedule?.return_to_pickup == true

    // Button visibility logic
    val isTripCompleted = tripPhase == "completed"
    val canAcceptBooking = tripPhase == "pending" && !isTripCompleted
    val canStartTrip = tripPhase == "accepted" && !isTripCompleted && isStartWindowOpen
    val canMarkPickup = tripPhase == "pickup" && !isTripCompleted
    val canMarkDropoff = tripPhase == "dropoff" && !isTripCompleted
    val canMarkReturnPickup = tripPhase == "return_pickup" && returnToPickup && !isTripCompleted
    val canCompleteTrip = tripPhase == "ready_to_complete" && !isTripCompleted

    val isAnyActionLoading =
        isStartingTrip || isMarkingPickup || isMarkingDropoff || isMarkingReturnPickup || isCompletingTrip

    // Track if location tracking should continue
    var isTrackingActive by remember { mutableStateOf(false) }
    
    // Track current location for stats card and built-in map
    var currentLatitude by remember { mutableStateOf(0.0) }
    var currentLongitude by remember { mutableStateOf(0.0) }
    var currentSpeed by remember { mutableStateOf(0f) }
    var currentAccuracy by remember { mutableStateOf(0f) }
    var currentHeading by remember { mutableStateOf(0f) }

    // INITIAL LOCATION LOGIC: Get last known location immediately
    LaunchedEffect(Unit) {
        PresenceManager.updateStatus(true)
        if (hasLocationPermission(context)) {
            try {
                val locationClient = LocationServices.getFusedLocationProviderClient(context)
                locationClient.lastLocation.addOnSuccessListener { location ->
                    if (location != null && currentLatitude == 0.0) {
                        Log.d("LocationTracking", "Found last known location: ${location.latitude}, ${location.longitude}")
                        currentLatitude = location.latitude
                        currentLongitude = location.longitude
                        currentSpeed = location.speed
                        currentAccuracy = location.accuracy
                        currentHeading = location.bearing
                    }
                }
            } catch (e: SecurityException) {
                Log.e("LocationTracking", "Permission denied for last location")
            }
        }
    }

    // Track current schedule ID - update when feed changes
    var currentScheduleId by remember { mutableStateOf<Int?>(null) }
    var lastCompletedScheduleId by remember { mutableStateOf<Int?>(null) }
    var lastCompletedTime by remember { mutableStateOf<Long?>(null) }

    // Logic: 1-hour window for advanced booking acceptance (Global state for UI consumption)
    val isJobAcceptable = remember(feed?.schedules?.firstOrNull()?.schedule_date, feed?.schedules?.firstOrNull()?.scheduled_time) {
        try {
            val sched = feed?.schedules?.firstOrNull() ?: return@remember true
            val sDate = sched.schedule_date ?: return@remember true
            val sTime = sched.scheduled_time ?: return@remember true
            
            val now = LocalDateTime.now()
            val today = now.toLocalDate()
            val schedDateArr = sDate.split("-")
            val targetDate = LocalDate.of(schedDateArr[0].toInt(), schedDateArr[1].toInt(), schedDateArr[2].toInt())
            
            if (!targetDate.isEqual(today)) return@remember false
            
            val timeParts = sTime.split(":")
            val schedTime = LocalTime.of(timeParts[0].toInt(), timeParts[1].toInt())
            val schedDateTime = LocalDateTime.of(today, schedTime)
            
            val diffInMinutes = Math.abs(java.time.Duration.between(now, schedDateTime).toMinutes())
            diffInMinutes <= 60
        } catch (e: Exception) {
            Log.e("DriverDashboard", "Error calculating window", e)
            true // Default to true if parsing fails to avoid locking valid jobs
        }
    }

    // Routing states
    var activePolylineEncoded by remember { mutableStateOf<String?>(null) }
    var polylinePoints by remember { mutableStateOf<List<LatLng>>(emptyList()) }
    var tripETA by remember { mutableStateOf("") }
    var tripDistance by remember { mutableStateOf("") }
    val googleMapsApiKey = "AIzaSyCsGVZkjrGObGZFT5hH3604Q9nePA60CUI"

    // Map state variables moved out of Box for better persistence
    val driverPos = remember(currentLatitude, currentLongitude) { LatLng(currentLatitude, currentLongitude) }
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(driverPos, 15f)
    }

    // Automated Routing logic - Only fires when phase or schedule changes to save API calls
    LaunchedEffect(tripPhase, nextSchedule?.scheduleId) {
        val schedule = nextSchedule ?: return@LaunchedEffect
        
        // Log the triggers
        Log.d("Routing", "Triggered: phase=$tripPhase, scheduleId=${schedule.scheduleId}")

        if (currentLatitude == 0.0 || currentLongitude == 0.0) {
            Log.w("Routing", "Waiting for valid GPS coordinates...")
            var attempts = 0
            while ((currentLatitude == 0.0 || currentLongitude == 0.0) && attempts < 15) {
                kotlinx.coroutines.delay(1000)
                attempts++
            }
        }

        if (currentLatitude == 0.0 || currentLongitude == 0.0) return@LaunchedEffect

        val origin = "$currentLatitude,$currentLongitude"
        val destination = when (tripPhase) {
            "pending", "assigned", "accepted", "moving_to_pickup", "return_pickup" -> 
                if (schedule.pickup_location?.firstOrNull()?.latitude != null) "${schedule.pickup_location.firstOrNull()!!.latitude},${schedule.pickup_location.firstOrNull()!!.longitude}" else null
            "picked_up", "moving_to_dropoff", "dropoff" -> 
                if (schedule.dropoff_location?.latitude != null) "${schedule.dropoff_location.latitude},${schedule.dropoff_location.longitude}" else null
            else -> null
        }

        Log.d("Routing", "Origin: $origin, Destination: $destination")

        if (destination != null) {
            try {
                val response = GoogleMapsService.api.getDirections(origin, destination, googleMapsApiKey)
                Log.d("Routing", "API Status: ${response.status} for origin=$origin dest=$destination")
                if (response.status == "OK" && response.routes.isNotEmpty()) {
                    val route = response.routes[0]
                    activePolylineEncoded = route.overviewPolyline.points
                    polylinePoints = GoogleMapsService.decodePolyline(activePolylineEncoded!!)
                    tripETA = route.legs.firstOrNull()?.duration?.text ?: ""
                    tripDistance = route.legs.firstOrNull()?.distance?.text ?: ""
                    Log.d("Routing", "Route SUCCESS: $tripDistance, $tripETA, points=${polylinePoints.size}")
                } else {
                    Log.e("Routing", "API Error or No Routes: ${response.status}")
                }
            } catch (e: Exception) {
                Log.e("Routing", "Error fetching directions: ${e.message}", e)
            }
        } else {
            Log.d("Routing", "No valid destination for phase: $tripPhase")
            polylinePoints = emptyList()
            activePolylineEncoded = null
            tripETA = ""
            tripDistance = ""
        }
    }

    // Update currentScheduleId when feed changes
    LaunchedEffect(feed?.schedules?.firstOrNull()?.scheduleId, feed?.schedules?.firstOrNull()?.trip_phase) {
        val activeSchedule = feed?.schedules?.firstOrNull()
        if (activeSchedule != null) {
            // Keep schedule_id active for all trip phases (pending, pickup, dropoff, return_pickup, ready_to_complete)
            // Only mark as completed when trip_phase is "completed"
            if (activeSchedule.trip_phase != "completed") {
                currentScheduleId = activeSchedule.scheduleId
                Log.d("LocationTracking", "Schedule ID updated: $currentScheduleId (phase: ${activeSchedule.trip_phase})")
            } else {
                // Trip completed - store for GPS tracking continuation (5 minutes)
                if (currentScheduleId != activeSchedule.scheduleId) {
                    // Only update if this is a new completion
                    lastCompletedScheduleId = activeSchedule.scheduleId
                    lastCompletedTime = System.currentTimeMillis()
                    Log.d("LocationTracking", "Schedule completed, storing for GPS tracking: $lastCompletedScheduleId")
                }
                // Keep currentScheduleId set until we're sure GPS tracking is done
                // This ensures schedule_id is NOT NULL during the entire trip lifecycle
                currentScheduleId = activeSchedule.scheduleId
            }
        } else {
            // No schedule in feed - check if we have a recently completed one
            if (lastCompletedScheduleId != null && lastCompletedTime != null) {
                val timeSinceCompletion = System.currentTimeMillis() - lastCompletedTime!!
                if (timeSinceCompletion < 5 * 60 * 1000) {
                    // Still within 5 minutes, keep using completed schedule ID
                    currentScheduleId = lastCompletedScheduleId
                    Log.d("LocationTracking", "Using completed schedule ID for GPS tracking: $lastCompletedScheduleId")
                } else {
                    // Too old, clear it
                    currentScheduleId = null
                    lastCompletedScheduleId = null
                    lastCompletedTime = null
                    Log.d("LocationTracking", "Completed schedule ID expired, cleared")
                }
            } else {
                currentScheduleId = null
            }
        }
    }

    val stopTracking: () -> Unit = {
        isTrackingActive = false
        val stopIntent = Intent(context, LocationService::class.java).apply { action = LocationService.ACTION_STOP }
        context.startService(stopIntent)
        Log.d("LocationTracking", "Location tracking stopped due to logout")
    }

    // Shake detection for accident reporting
    DisposableEffect(Unit) {
        val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        val shakeDetector = ShakeDetector {
            // Only show dialog if it's not already showing
            if (!showAccidentDialog && !isReportingAccident) {
                Log.d("ShakeDetector", "Accident dialog triggered by shake")
                showAccidentDialog = true
            } else {
                Log.d("ShakeDetector", "Shake detected but dialog already showing or reporting in progress")
            }
        }

        if (accelerometer != null) {
            sensorManager.registerListener(
                shakeDetector,
                accelerometer,
                SensorManager.SENSOR_DELAY_UI
            )
            Log.d("ShakeDetector", "Shake detection enabled")
        } else {
            Log.w("ShakeDetector", "Accelerometer not available")
        }

        onDispose {
            sensorManager?.unregisterListener(shakeDetector)
            Log.d("ShakeDetector", "Shake detection disabled")
        }
    }

    // Handle accident report
    val handleAccidentReport: () -> Unit = {
        scope.launch {
            isReportingAccident = true
            try {
                // Check permission before accessing location
                if (!hasLocationPermission(context)) {
                    tripActionError = "Location permission is required to report accidents"
                    isReportingAccident = false
                    return@launch
                }

                val locationClient = LocationServices.getFusedLocationProviderClient(context)
                val locationRequest =
                    LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10000)
                        .setWaitForAccurateLocation(false)
                        .build()

                val cancellationTokenSource = CancellationTokenSource()
                val location = try {
                    val locationTask = locationClient.getCurrentLocation(
                        locationRequest.priority,
                        cancellationTokenSource.token
                    )
                    locationTask.await()
                } catch (securityException: SecurityException) {
                    Log.e("AccidentReport", "Location permission denied: ${securityException.message}")
                    tripActionError = "Location permission denied. Please grant location access."
                    isReportingAccident = false
                    return@launch
                }

                val lat = location?.latitude ?: 0.0
                val lng = location?.longitude ?: 0.0

                val user = auth.currentUser
                val schedule = nextSchedule

                val accidentData = hashMapOf(
                    "driver_email" to user?.email?.lowercase()?.trim(),
                    "schedule_id" to (schedule?.scheduleId ?: 0),
                    "firebase_schedule_id" to schedule?.docId,
                    "latitude" to lat,
                    "longitude" to lng,
                    "description" to "Accident reported via shake detection",
                    "reported_at" to FieldValue.serverTimestamp()
                )

                db.collection("accidents").add(accidentData).await()
                
                tripActionSuccess = "Accident reported successfully. Emergency services have been notified."
                showAccidentDialog = false
            } catch (e: Exception) {
                Log.e("AccidentReport", "Error reporting accident: ${e.message}", e)
                tripActionError = "Failed to report accident: ${e.message}"
            } finally {
                isReportingAccident = false
            }
        }
    }

    DisposableEffect(auth.currentUser?.email) {
        val email = auth.currentUser?.email
        if (email == null) return@DisposableEffect onDispose {}
        
        // Listen to accidents
        val accidentSub = db.collection("accidents")
            .whereEqualTo("driver_email", email)
            .whereEqualTo("status", "acknowledged")
            .orderBy("acknowledged_at", Query.Direction.DESCENDING)
            .limit(1)
            .addSnapshotListener { snapshot, _ ->
                val doc = snapshot?.documents?.firstOrNull()
                if (doc != null) {
                    val msg = "Admin acknowledged your accident report."
                    if (latestAckMessage != msg) {
                        latestAckMessage = msg
                        tripActionSuccess = msg
                    }
                }
            }
            
        // Listen to vehicle issues
        val issueSub = db.collection("vehicle_issues")
            .whereEqualTo("driver_email", email)
            .whereEqualTo("status", "acknowledged")
            .orderBy("acknowledged_at", Query.Direction.DESCENDING)
            .limit(1)
            .addSnapshotListener { snapshot, _ ->
                val doc = snapshot?.documents?.firstOrNull()
                if (doc != null) {
                    val msg = "Admin acknowledged your vehicle issue report."
                    if (latestAckMessage != msg) {
                        latestAckMessage = msg
                        tripActionSuccess = msg
                    }
                }
            }

        onDispose {
            accidentSub.remove()
            issueSub.remove()
        }
    }

    // Start location tracking
    var driverDocRef by remember { mutableStateOf<com.google.firebase.firestore.DocumentReference?>(null) }
    
    LaunchedEffect(auth.currentUser?.email) {
        try {
            val email = auth.currentUser?.email?.lowercase()?.trim() ?: return@LaunchedEffect
            // We use the driver_locations collection for frequent GPS updates
            val ref = db.collection("driver_locations").document(email)
            driverDocRef = ref
            // Immediately create/update the presence doc so admin can see the driver is online
            // even before GPS coordinates arrive. Coordinates will fill in via the BroadcastReceiver.
            ref.set(
                mapOf(
                    "driver_email" to email,
                    "online" to true,
                    "last_seen" to com.google.firebase.firestore.FieldValue.serverTimestamp()
                ),
                com.google.firebase.firestore.SetOptions.merge()
            )
            Log.d("LocationTracking", "Presence doc created for $email")
        } catch (e: Exception) {
            Log.e("LocationTracking", "Error setting driver_locations ref", e)
        }
    }

    val locationClient = remember { LocationServices.getFusedLocationProviderClient(context) }
    
    Log.d("DriverDashboard", "Composing Dashboard: phase=$tripPhase, schedules=${feed?.schedules?.size ?: 0}")

    // Listen to LocationService updates via BroadcastReceiver
    DisposableEffect(Unit) {
        val appContext = context.applicationContext
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == LocationService.ACTION_LOCATION_UPDATE) {
                    val lat = intent.getDoubleExtra(LocationService.EXTRA_LATITUDE, 0.0)
                    val lng = intent.getDoubleExtra(LocationService.EXTRA_LONGITUDE, 0.0)
                    val speed = intent.getFloatExtra(LocationService.EXTRA_SPEED, 0f)
                    val accuracy = intent.getFloatExtra(LocationService.EXTRA_ACCURACY, 0f)
                    val bearing = intent.getFloatExtra(LocationService.EXTRA_BEARING, 0f)
                    val totalDist = intent.getFloatExtra(LocationService.EXTRA_TOTAL_DISTANCE, 0f)

                    Log.d("LocationTracking", "Received: $lat, $lng (Acc: $accuracy, Dist: $totalDist)")

                        currentLatitude = lat
                        currentLongitude = lng
                        currentSpeed = speed
                        currentAccuracy = accuracy
                        currentHeading = bearing
                        totalDistanceMetres = totalDist
                        
                        val routePolyline = intent.getStringExtra(LocationService.EXTRA_ROUTE_POLYLINE)
                        if (!routePolyline.isNullOrEmpty()) {
                            val remotePoints = GoogleMapsService.decodePolyline(routePolyline)
                            if (remotePoints.size > actualRoutePoints.size) {
                                actualRoutePoints.clear()
                                actualRoutePoints.addAll(remotePoints)
                                
                                // Sync live telemetry to Firestore Trip Ticket
                                scope.launch {
                                    activeTicketId?.let { ticketId ->
                                        try {
                                            db.collection("trip_tickets").document(ticketId).update(
                                                "total_km", totalDistanceMetres / 1000.0,
                                                "route_polyline", routePolyline
                                            )
                                        } catch (e: Exception) {
                                            Log.e("DriverDashboard", "Live sync failed", e)
                                        }
                                    }
                                }
                            }
                        }

                        // TNVS Dynamic Route Trimming & ETA Calculation
                        if (polylinePoints.isNotEmpty()) {
                            val driverPosVec = LatLng(lat, lng)
                            
                            // Detect if off-route (> 50m)
                            val distToPoly = GoogleMapsService.findMinimumDistanceToPolyline(driverPosVec, polylinePoints)
                            if (distToPoly > 50f && !showReRoutePrompt && (tripPhase == "pickup" || tripPhase == "dropoff")) {
                                showReRoutePrompt = true
                            }
                            
                            val trimmedPoly = GoogleMapsService.trimPolyline(driverPosVec, polylinePoints)
                            // Only force a compose recomp object change if size shrunk
                            if (trimmedPoly.size < polylinePoints.size) {
                                polylinePoints = trimmedPoly
                            }
                            
                            val remainDistMeters = GoogleMapsService.calculatePolylineDistance(polylinePoints)
                            tripDistance = if (remainDistMeters > 1000f) {
                                "%.1f km".format(remainDistMeters / 1000f)
                            } else {
                                "%.0f m".format(remainDistMeters)
                            }

                            // Calculate ETA (speed is in m/s)
                            val calcSpeed = if (speed > 1f) speed else 8.33f // fallback 30km/h
                            val etaSecs = (remainDistMeters / calcSpeed).toLong()

                            val hours = etaSecs / 3600
                            val mins = (etaSecs % 3600) / 60
                            tripETA = if (hours > 0) "${hours} hr ${mins} min" else "${mins} min"
                        }

                        // Sync to Firestore if docRef is ready
                        scope.launch {
                            val locData = hashMapOf(
                                "current_latitude" to lat,
                                "current_longitude" to lng,
                                "current_speed" to speed,
                                "current_heading" to bearing,
                                "current_accuracy" to accuracy,
                                "current_route_polyline" to (activePolylineEncoded ?: ""),
                                "trip_eta" to tripETA,
                                "trip_distance" to tripDistance,
                                "current_trip_id" to (nextSchedule?.docId ?: ""),
                                "current_trip_phase" to tripPhase,
                                "driver_email" to (auth.currentUser?.email?.lowercase()?.trim() ?: ""),
                                "last_updated" to FieldValue.serverTimestamp()
                            )
                            // Use set(merge) so the document is created if it doesn't exist yet
                            driverDocRef?.set(locData, com.google.firebase.firestore.SetOptions.merge())

                            // ALSO: Update the actual trip schedule with the current accumulated distance
                            val scheduleDocId = nextSchedule?.docId
                            if (scheduleDocId != null && (tripPhase == "pickup" || tripPhase == "dropoff" || tripPhase == "return_pickup")) {
                                val distanceKm = totalDist / 1000.0
                                db.collection("schedules").document(scheduleDocId).update(
                                    "total_km_travelled", distanceKm,
                                    "updated_at", FieldValue.serverTimestamp()
                                )
                            }
                        }
                    }
                }
            }

        val filter = android.content.IntentFilter(LocationService.ACTION_LOCATION_UPDATE)
        Log.d("LocationTracking", "Registering Dashboard Receiver")
        
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                appContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                appContext.registerReceiver(receiver, filter)
            }
        } catch (e: Exception) {
            Log.e("LocationTracking", "Reg failed: ${e.message}")
        }

        onDispose {
            try {
                appContext.unregisterReceiver(receiver)
                Log.d("LocationTracking", "Unregistered Dashboard Receiver")
            } catch (e: Exception) {
                Log.e("LocationTracking", "Unreg failed", e)
            }
        }
    }

    LaunchedEffect(session.sessionToken) {
        isTrackingActive = true
        if (hasLocationPermission(context)) {
            val startIntent = Intent(context, LocationService::class.java).apply {
                action = LocationService.ACTION_START
                putExtra(LocationService.EXTRA_DRIVER_ID, auth.currentUser?.uid)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(startIntent)
            } else {
                context.startService(startIntent)
            }
            // Also push the last known location immediately so admin map updates right away
            try {
                val loc = LocationServices.getFusedLocationProviderClient(context).lastLocation.await()
                if (loc != null && loc.latitude != 0.0 && loc.longitude != 0.0) {
                    val uid = auth.currentUser?.uid ?: ""
                    val email = auth.currentUser?.email?.lowercase()?.trim() ?: ""
                    if (uid.isNotEmpty()) {
                        db.collection("driver_locations").document(email).set(
                            mapOf(
                                "driver_email" to email,
                                "current_latitude" to loc.latitude,
                                "current_longitude" to loc.longitude,
                                "current_speed" to loc.speed,
                                "current_heading" to loc.bearing,
                                "current_accuracy" to loc.accuracy,
                                "online" to true,
                                "last_updated" to com.google.firebase.firestore.FieldValue.serverTimestamp()
                            ),
                            com.google.firebase.firestore.SetOptions.merge()
                        ).await()
                        Log.d("LocationTracking", "Wrote initial last-known location: ${loc.latitude}, ${loc.longitude}")
                    }
                }
            } catch (e: Exception) {
                Log.w("LocationTracking", "Could not fetch last location: ${e.message}")
            }
        }
    }

    // Geofencing automation: Adjust geofences based on trip phase
    LaunchedEffect(tripPhase, nextSchedule) {
        val schedule = nextSchedule
        if (schedule != null) {
            val docId = schedule.docId ?: return@LaunchedEffect
            val intent = Intent(context, LocationService::class.java)

            when (tripPhase) {
                "pickup", "return_pickup" -> {
                    val lat = schedule.pickup_location?.firstOrNull()?.latitude
                    val lng = schedule.pickup_location?.firstOrNull()?.longitude
                    if (lat != null && lng != null && lat != 0.0 && lng != 0.0) {
                        intent.action = LocationService.ACTION_SET_GEOFENCE
                        intent.putExtra(LocationService.EXTRA_GEOFENCE_ID, docId)
                        intent.putExtra(LocationService.EXTRA_LATITUDE, lat)
                        intent.putExtra(LocationService.EXTRA_LONGITUDE, lng)
                        intent.putExtra(LocationService.EXTRA_TARGET_PHASE, "dropoff")
                        context.startService(intent)
                    }
                }
                "dropoff" -> {
                    val lat = schedule.dropoff_location?.latitude
                    val lng = schedule.dropoff_location?.longitude
                    if (lat != null && lng != null && lat != 0.0 && lng != 0.0) {
                        intent.action = LocationService.ACTION_SET_GEOFENCE
                        intent.putExtra(LocationService.EXTRA_GEOFENCE_ID, docId)
                        intent.putExtra(LocationService.EXTRA_LATITUDE, lat)
                        intent.putExtra(LocationService.EXTRA_LONGITUDE, lng)
                        
                        val returnReq = schedule.return_to_pickup ?: false
                        val nextPhase = if (returnReq) "return_pickup" else "ready_to_complete"
                        
                        intent.putExtra(LocationService.EXTRA_TARGET_PHASE, nextPhase)
                        context.startService(intent)
                    }
                }
                else -> {
                    // Clear geofences for other phases
                    intent.action = LocationService.ACTION_CLEAR_GEOFENCES
                    context.startService(intent)
                }
            }
        }
    }


    // GPS blocking overlay - shows when GPS is disabled
    if (showGpsBlockingOverlay) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.9f))
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = if (!hasLocationPermission) "Location Access Required" else "GPS Required",
                    style = MaterialTheme.typography.headlineSmall,
                    color = TextPrimary,
                    textAlign = TextAlign.Center
                )
                Text(
                    text = if (!hasLocationPermission)
                        "Location access is required for Fleetonix to function. Please grant location permission."
                    else
                        "GPS must be enabled to use Fleetonix. Please turn on your device GPS.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary,
                    textAlign = TextAlign.Center
                )
                Button(
                    onClick = {
                        if (!hasLocationPermission) {
                            // Request location permission
                            permissionLauncher.launch(
                                arrayOf(
                                    android.Manifest.permission.ACCESS_FINE_LOCATION,
                                    android.Manifest.permission.ACCESS_COARSE_LOCATION
                                )
                            )
                        } else {
                            // Open GPS settings
                            activity?.startActivity(android.content.Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                        }
                    }
                ) {
                    Text(if (!hasLocationPermission) "Grant Location Permission" else "Open GPS Settings")
                }
            }
        }
        return // Don't render dashboard if GPS is blocked
    }

    // Handle vehicle issue report
    val handleVehicleIssueReport: (String, String?) -> Unit = { issueType, description ->
        scope.launch {
            isReportingVehicleIssue = true
            try {
                // Check permission before accessing location
                if (!hasLocationPermission(context)) {
                    tripActionError = "Location permission is required to report vehicle issues"
                    isReportingVehicleIssue = false
                    return@launch
                }

                val locationClient = LocationServices.getFusedLocationProviderClient(context)
                val locationRequest =
                    LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10000)
                        .setWaitForAccurateLocation(false)
                        .build()

                val cancellationTokenSource = CancellationTokenSource()
                val location = try {
                    val locationTask = locationClient.getCurrentLocation(
                        locationRequest.priority,
                        cancellationTokenSource.token
                    )
                    locationTask.await()
                } catch (securityException: SecurityException) {
                    Log.e("VehicleIssue", "Location permission denied: ${securityException.message}")
                    tripActionError = "Location permission denied. Please grant location access."
                    isReportingVehicleIssue = false
                    return@launch
                }

                val lat = location?.latitude ?: 0.0
                val lng = location?.longitude ?: 0.0

                val user = auth.currentUser
                val schedule = nextSchedule

                val issueData = hashMapOf(
                    "driver_email" to user?.email?.lowercase()?.trim(),
                    "schedule_id" to (schedule?.scheduleId ?: 0),
                    "firebase_schedule_id" to schedule?.docId,
                    "issue_type" to issueType,
                    "description" to (description ?: issueType),
                    "latitude" to lat,
                    "longitude" to lng,
                    "reported_at" to FieldValue.serverTimestamp()
                )

                db.collection("vehicle_issues").add(issueData).await()
                
                tripActionSuccess = "Vehicle issue reported successfully. Support team has been notified."
                showVehicleIssueDialog = false
            } catch (e: Exception) {
                Log.e("VehicleIssue", "Error reporting vehicle issue: ${e.message}", e)
                tripActionError = "Failed to report vehicle issue: ${e.message}"
            } finally {
                isReportingVehicleIssue = false
            }
        }
    }

    // Wrap everything in a Box to allow emergency lights overlay on top
    Box(modifier = Modifier.fillMaxSize()) {
        ModalNavigationDrawer(
            drawerState = drawerState,
            drawerContent = {
                ModalDrawerSheet(
                    modifier = Modifier.fillMaxWidth(0.75f),
                    drawerContainerColor = CardBlue
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Spacer(modifier = Modifier.height(16.dp))

                        // MENU title - centered, all caps
                        Text(
                            text = "MENU",
                            color = TextPrimary,
                            style = MaterialTheme.typography.headlineSmall,
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.Center
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        // Hi, [driver name] - left aligned, normal font
                        Text(
                            text = "Hi, $liveDriverName",
                            color = TextPrimary,
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.Start
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        // Driver's Profile option with icon - left aligned
                        TextButton(
                            onClick = {
                                scope.launch { drawerState.close() }
                                showProfile = true
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.Start,
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Person,
                                    contentDescription = "Profile",
                                    tint = TextPrimary,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.padding(horizontal = 8.dp))
                                Text(
                                    text = "Driver's Profile",
                                    color = TextPrimary,
                                    style = MaterialTheme.typography.bodyLarge
                                )
                            }
                        }

                        // Time Record History (DTR)
                        TextButton(
                            onClick = {
                                scope.launch { drawerState.close() }
                                showDtrHistory = true
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.Start,
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Timer,
                                    contentDescription = "Time History",
                                    tint = TextPrimary,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.padding(horizontal = 8.dp))
                                Text(
                                    text = "Time Record History",
                                    color = TextPrimary,
                                    style = MaterialTheme.typography.bodyLarge
                                )
                            }
                        }

                        // My Assignments option
                        TextButton(
                            onClick = {
                                scope.launch { drawerState.close() }
                                onViewAssignments()
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.Start,
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Assignment,
                                    contentDescription = "Assignments",
                                    tint = TextPrimary,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.padding(horizontal = 8.dp))
                                Text(
                                    text = "My Assignments",
                                    color = TextPrimary,
                                    style = MaterialTheme.typography.bodyLarge
                                )
                            }
                        }

                        // Trip History option
                        // Trip Tickets History option
                        TextButton(
                            onClick = {
                                scope.launch { drawerState.close() }
                                showTripHistory = true
                            },







                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.Start,
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(
                                    imageVector = Icons.Default.History,
                                    contentDescription = "Trip History",
                                    tint = TextPrimary,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.padding(horizontal = 8.dp))
                                Text(
                                    text = "Trip History",
                                    color = TextPrimary,
                                    style = MaterialTheme.typography.bodyLarge
                                )
                            }
                        }

                        // Report menu section
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = "Report",
                                color = TextSecondary,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(vertical = 8.dp)
                            )

                            // Accident Report
                            TextButton(
                                onClick = {
                                    scope.launch { drawerState.close() }
                                    showAccidentDialog = true
                                },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    horizontalArrangement = Arrangement.Start,
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Warning,
                                        contentDescription = "Accident",
                                        tint = AccentOrange,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(modifier = Modifier.padding(horizontal = 8.dp))
                                    Text(
                                        text = "Accident",
                                        color = TextPrimary,
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                }
                            }

                            // Vehicle Issue
                            TextButton(
                                onClick = {
                                    scope.launch { drawerState.close() }
                                    showVehicleIssueDialog = true
                                },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    horizontalArrangement = Arrangement.Start,
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Warning,
                                        contentDescription = "Vehicle Issue",
                                        tint = AccentOrange,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(modifier = Modifier.padding(horizontal = 8.dp))
                                    Text(
                                        text = "Vehicle Issue",
                                        color = TextPrimary,
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.weight(1f))

                        // Logout option
                        TextButton(
                            onClick = {
                                scope.launch { drawerState.close() }
                                stopTracking()
                                onLogout()
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = "Logout",
                                color = Color(0xFFFF6B6B),
                                style = MaterialTheme.typography.bodyLarge
                            )
                        }
                    }
                }
            }
        ) {
            Box(Modifier.fillMaxSize()) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Midnight)
                        .navigationBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 24.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                // Header with hamburger menu
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Active Duty", color = TextSecondary)
                    IconButton(
                        onClick = { scope.launch { drawerState.open() } }
                    ) {
                        Icon(
                            imageVector = Icons.Default.Menu,
                            contentDescription = "Menu",
                            tint = TextPrimary
                        )
                    }
                }

                Text(
                    "Today's Overview",
                    color = TextPrimary,
                    style = MaterialTheme.typography.headlineSmall
                )

                // Daily Time Record (DTR) Card - Manual Control
                Card(
                    colors = CardDefaults.cardColors(containerColor = CardBlue),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = "Daily Time Record",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = TextPrimary
                                )
                                Text(
                                    text = if (isTimedIn) "Status: TIMED-IN" else "Status: TIMED-OUT",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (isTimedIn) AccentTeal else TextSecondary
                                )
                            }
                            Icon(
                                imageVector = if (isTimedIn) Icons.Default.CheckCircle else Icons.Default.Info,
                                contentDescription = null,
                                tint = if (isTimedIn) AccentTeal else TextSecondary,
                                modifier = Modifier.size(24.dp)
                            )
                        }

                        // Business Logic: 15-minute window or Standby check
                        val now = LocalDateTime.now()
                        val hasStandby = feed?.schedules?.any { it.status?.lowercase() == "standby" || it.passenger_name?.lowercase()?.contains("standby") == true } ?: false
                        val firstSchedToday = feed?.schedules?.filter { 
                            it.schedule_date == now.toLocalDate().toString()
                        }?.minByOrNull { it.scheduled_time ?: "23:59" }
                        
                        val startWindowOpen = firstSchedToday?.let { 
                            val schedTime = parseScheduleDateTime(it.schedule_date, it.scheduled_time)
                            schedTime?.let { target ->
                                val diffMinutes = java.time.Duration.between(now, target).toMinutes()
                                diffMinutes <= 15 // Restricted to 15 mins before
                            } ?: true
                        } ?: hasStandby

                        val hasActiveTrips = feed?.schedules?.any { 
                            it.trip_phase != "pending" && it.trip_phase != "completed" && it.trip_phase != "assigned" 
                        } ?: false

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            // TIME IN Button
                            Button(
                                onClick = {
                                    scope.launch {
                                        try {
                                            isDtrLoading = true
                                            val uid = auth.currentUser?.uid ?: return@launch
                                            val email = auth.currentUser?.email ?: ""
                                            val nowVal = LocalDateTime.now()
                                            
                                            val logData = hashMapOf(
                                                "driver_uid" to uid,
                                                "driver_email" to email,
                                                "driver_name" to liveDriverName,
                                                "accredited_company_id" to accreditedCompanyId,
                                                "action" to "time_in",
                                                "timestamp" to FieldValue.serverTimestamp(),
                                                "latitude" to currentLatitude,
                                                "longitude" to currentLongitude,
                                                "device_time" to nowVal.toString()
                                            )
                                            db.collection("dtr_logs").add(logData).await()
                                            db.collection("drivers").document(uid).update(
                                                "is_currently_timed_in", true,
                                                "last_time_in", FieldValue.serverTimestamp()
                                            ).await()
                                            
                                            isTimedIn = true
                                            lastTimeInObj = nowVal
                                            tripActionSuccess = "Successfully Timed-In!"
                                        } catch (e: Exception) {
                                            tripActionError = "Time-In Error: ${e.message}"
                                        } finally {
                                            isDtrLoading = false
                                        }
                                    }
                                },
                                modifier = Modifier.weight(1f),
                                enabled = !isTimedIn && !isDtrLoading && (startWindowOpen || hasStandby),
                                colors = ButtonDefaults.buttonColors(containerColor = AccentTeal)
                            ) {
                                Text("TIME IN", color = Midnight, fontWeight = FontWeight.Bold)
                            }

                            // TIME OUT Button
                            Button(
                                onClick = {
                                    scope.launch {
                                        try {
                                            isDtrLoading = true
                                            val uid = auth.currentUser?.uid ?: return@launch
                                            val email = auth.currentUser?.email ?: ""
                                            val nowVal = LocalDateTime.now()
                                            
                                            // OT calculation logic
                                            val thresholdTime = nowVal.withHour(17).withMinute(0)
                                            val isThresholdMet = nowVal.isAfter(thresholdTime)
                                            
                                            var totalHours = 0.0
                                            lastTimeInObj?.let { start ->
                                                totalHours = java.time.Duration.between(start, nowVal).toMinutes() / 60.0
                                            }
                                            
                                            // OT condition: Past 5PM and at least 30 minutes of workday
                                            val durationInMinutes = java.time.Duration.between(lastTimeInObj ?: nowVal, nowVal).toMinutes()
                                            val qualifiedForOT = isThresholdMet && durationInMinutes >= 30
                                            
                                            val addr = getAddressFromLocation(currentLatitude, currentLongitude)
                                            val logData = hashMapOf(
                                                "driver_uid" to uid,
                                                "driver_email" to email,
                                                "driver_name" to liveDriverName,
                                                "accredited_company_id" to accreditedCompanyId,
                                                "action" to "time_out",
                                                "timestamp" to FieldValue.serverTimestamp(),
                                                "latitude" to currentLatitude,
                                                "longitude" to currentLongitude,
                                                "location_name" to addr,
                                                "total_hours" to totalHours,
                                                "is_overtime" to qualifiedForOT,
                                                "device_time" to nowVal.toString()
                                            )
                                            db.collection("dtr_logs").add(logData).await()
                                            db.collection("drivers").document(uid).update(
                                                "is_currently_timed_in", false,
                                                "last_time_out", FieldValue.serverTimestamp()
                                            ).await()
                                            
                                            isTimedIn = false
                                            tripActionSuccess = if (qualifiedForOT) "Timed-Out with Overtime!" else "Timed-Out Successfully"
                                        } catch (e: Exception) {
                                            tripActionError = "Time-Out Error: ${e.message}"
                                        } finally {
                                            isDtrLoading = false
                                        }
                                    }
                                },
                                modifier = Modifier.weight(1f),
                                enabled = isTimedIn && !isDtrLoading && !hasActiveTrips,
                                colors = ButtonDefaults.buttonColors(containerColor = AccentOrange)
                            ) {
                                Text("TIME OUT", color = Midnight, fontWeight = FontWeight.Bold)
                            }
                        }

                        if (!startWindowOpen && !isTimedIn && !hasStandby) {
                            Text(
                                text = "Access restricted until 15 mins before schedule.",
                                color = AccentOrange,
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                        if (hasActiveTrips && isTimedIn) {
                            Text(
                                text = "Cannot time-out with pending/active trips.",
                                color = AccentOrange,
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                    }
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    StatCard(
                        title = "Next Pickup",
                        value = nextPickupTime,
                        accentColor = AccentTeal,
                        modifier = Modifier.weight(1f)
                    )
                    StatCard(
                        title = "Distance",
                        value = String.format("%.2f KM", totalDistanceMetres / 1000.0),
                        accentColor = AccentBlue,
                        modifier = Modifier.weight(1f)
                    )
                }

                // Integrated GPS & Build-in Map section
                Text("Real-time GPS & Built-in Map", color = TextSecondary)
                Card(
                    colors = CardDefaults.cardColors(containerColor = CardBlue),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column {
                        // GPS Stats & Speedometer Row
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            SpeedometerWidget(speedKmH = currentSpeed * 3.6f)
                            
                            Column(modifier = Modifier.weight(1f).padding(start = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (tripETA.isNotEmpty()) {
                                    Text("ETA: $tripETA", color = AccentTeal, fontWeight = FontWeight.Bold)
                                    Text("Remaining: $tripDistance", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                                } else {
                                    Text("ETA: --", color = AccentTeal, fontWeight = FontWeight.Bold)
                                }
                                Text("Acc: ${"%.1f".format(currentAccuracy)}m", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                                Text("Pos: ${"%.4f".format(currentLatitude)}, ${"%.4f".format(currentLongitude)}", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                            }
                        }

                        // Built-in Map View
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(300.dp)
                                .background(Color.DarkGray)
                        ) {
                            // Update camera when position changes significantly
                            LaunchedEffect(currentLatitude, currentLongitude) {
                                if (currentLatitude != 0.0 && currentLongitude != 0.0) {
                                    // Auto-follow driver at a closer zoom
                                    cameraPositionState.animate(
                                        CameraUpdateFactory.newLatLngZoom(driverPos, 16f),
                                        500
                                    )
                                }
                            }
                            
                            // Auto-fit route when it's first loaded or changed
                            LaunchedEffect(polylinePoints) {
                                if (polylinePoints.isNotEmpty()) {
                                    val bounds = com.google.android.gms.maps.model.LatLngBounds.builder().apply {
                                        polylinePoints.forEach { include(it) }
                                        include(driverPos)
                                    }.build()
                                    
                                    cameraPositionState.animate(
                                        CameraUpdateFactory.newLatLngBounds(bounds, 100),
                                        1000
                                    )
                                }
                            }

                            val mapProperties = remember(currentLatitude) {
                                MapProperties(
                                    isMyLocationEnabled = currentLatitude != 0.0,
                                    isTrafficEnabled = true
                                )
                            }
                            val mapUiSettings = remember {
                                MapUiSettings(
                                    myLocationButtonEnabled = true,
                                    zoomControlsEnabled = true,
                                    compassEnabled = true,
                                    mapToolbarEnabled = true
                                )
                            }

                            GoogleMap(
                                modifier = Modifier.fillMaxSize(),
                                cameraPositionState = cameraPositionState,
                                properties = mapProperties.copy(mapStyleOptions = MapStyleOptions(MapStyles.AUBERGINE)),
                                uiSettings = mapUiSettings
                            ) {
                                Marker(
                                    state = com.google.maps.android.compose.rememberMarkerState(position = driverPos),
                                    title = "You are here"
                                )
                                
                                // Render direction polyline
                                if (polylinePoints.isNotEmpty()) {
                                    Polyline(
                                        points = polylinePoints,
                                        color = Color(0xFF3B82F6),
                                        width = 12f
                                    )
                                    
                                    // Destination marker
                                    val dest = polylinePoints.last()
                                    val isPickup = tripPhase == "pickup" || tripPhase == "pending"
                                    Marker(
                                        state = com.google.maps.android.compose.rememberMarkerState(position = dest),
                                        title = if (isPickup) "Pickup Location" else "Dropoff Location",
                                        snippet = if (isPickup) "Destination for Pickup" else "Customer Destination"
                                    )
                                }
                            }

                            // Quick Navigation Overlay Button
                            if (polylinePoints.isNotEmpty()) {
                                androidx.compose.ui.window.Popup(
                                    alignment = Alignment.TopEnd,
                                    offset = androidx.compose.ui.unit.IntOffset(-16, 16)
                                ) {
                                    IconButton(
                                        onClick = {
                                            val dest = polylinePoints.last()
                                            val address = if (tripPhase == "pickup" || tripPhase == "pending") 
                                                nextSchedule?.pickup_location?.firstOrNull()?.address ?: "" 
                                            else 
                                                nextSchedule?.dropoff_location?.address ?: ""
                                            openExternalMaps(context, dest.latitude, dest.longitude, address)
                                        },
                                        modifier = Modifier
                                            .background(Color.White.copy(alpha = 0.9f), MaterialTheme.shapes.small)
                                            .padding(4.dp)
                                    ) {
                                        Icon(
                                            imageVector = androidx.compose.material.icons.Icons.Filled.LocationOn,
                                            contentDescription = "Navigate",
                                            tint = Color(0xFF3B82F6)
                                        )
                                    }
                                }
                            }
                        }
                        
                        // Optional Action Buttons for External Navigation
                        Row(
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Fast Navigate (Optional):", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                            
                            androidx.compose.material3.TextButton(
                                onClick = { 
                                    try {
                                        val url = "waze://?ll=$currentLatitude,$currentLongitude&navigate=yes"
                                        val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
                                        context.startActivity(intent)
                                    } catch (e: Exception) {
                                        val gmmIntentUri = android.net.Uri.parse("google.navigation:q=$currentLatitude,$currentLongitude")
                                        val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
                                        mapIntent.setPackage("com.google.android.apps.maps")
                                        context.startActivity(mapIntent)
                                    }
                                }
                            ) {
                                Text("Waze", color = AccentOrange, style = MaterialTheme.typography.bodySmall)
                            }
                            
                            androidx.compose.material3.TextButton(
                                onClick = {
                                    val gmmIntentUri = android.net.Uri.parse("google.navigation:q=$currentLatitude,$currentLongitude")
                                    val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
                                    mapIntent.setPackage("com.google.android.apps.maps")
                                    context.startActivity(mapIntent)
                                }
                            ) {
                                Text("Google Maps", color = AccentBlue, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }

                StatCard(
                    title = "Return Required",
                    value = if (returnRequired) "Yes, back to pickup" else "No",
                    accentColor = AccentOrange,
                    modifier = Modifier.fillMaxWidth()
                )

                // Multi-point Segments List (Full Visibility)
                if (!nextSchedule?.segments.isNullOrEmpty()) {
                    Text("Trip Route Details", color = TextSecondary, modifier = Modifier.padding(top = 8.dp))
                    Card(
                        colors = CardDefaults.cardColors(containerColor = CardBlue),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            nextSchedule?.segments?.forEachIndexed { index, segment ->
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Box(modifier = Modifier.size(8.dp).background(AccentBlue, androidx.compose.foundation.shape.CircleShape))
                                        Spacer(Modifier.width(12.dp))
                                        Text("Stop ${index + 1} Pickup:", color = TextSecondary, style = MaterialTheme.typography.labelSmall)
                                    }
                                    Text(segment.pickup ?: "Included Stop", color = Color.White, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 20.dp))
                                    
                                    Spacer(Modifier.height(4.dp))
                                    
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Box(modifier = Modifier.size(8.dp).background(AccentOrange, androidx.compose.foundation.shape.CircleShape))
                                        Spacer(Modifier.width(12.dp))
                                        Text("Stop ${index + 1} Drop-off:", color = TextSecondary, style = MaterialTheme.typography.labelSmall)
                                    }
                                    Text(segment.dropoff ?: "Destination", color = Color.White, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 20.dp))
                                }
                                if (index < (nextSchedule?.segments?.size ?: 0) - 1) {
                                    Divider(color = DividerBlue, thickness = 0.5.dp, modifier = Modifier.padding(vertical = 4.dp))
                                }
                            }
                        }
                    }
                } else if (!nextSchedule?.pickup_points.isNullOrEmpty()) {
                    // Fallback to legacy pickup_points if segments is missing
                    Text("Pickup Points", color = TextSecondary, modifier = Modifier.padding(top = 8.dp))
                    Card(
                        colors = CardDefaults.cardColors(containerColor = CardBlue),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            nextSchedule?.pickup_points?.sortedBy { it.order }?.forEach { point ->
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Box(
                                        modifier = Modifier.size(8.dp).background(if (point.arrived_at != null) AccentTeal else Color.Gray, androidx.compose.foundation.shape.CircleShape)
                                    )
                                    Column {
                                        Text(point.name ?: "Unknown Stop", color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
                                        if (point.arrived_at != null) {
                                            Text("Arrived", color = AccentTeal, style = MaterialTheme.typography.labelSmall)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (feedError != null) {
                    Text(
                        text = feedError,
                        color = Color(0xFFFF6B6B),
                        style = MaterialTheme.typography.bodySmall
                    )
                }



                Text("Quick Actions", color = TextSecondary)
                Card(
                    colors = CardDefaults.cardColors(containerColor = CardBlue),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Button(
                            onClick = {
                                tripActionSuccess = "Leave/Reliever request feature coming soon. Please contact Admin."
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = AccentOrange.copy(alpha = 0.2f), contentColor = AccentOrange),
                            border = BorderStroke(1.dp, AccentOrange),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.DateRange, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Request Leave / Reliever")
                        }

                        // Return to Route Prompt
                        if (showReRoutePrompt && !isReRouting) {
                            Card(
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                                colors = CardDefaults.cardColors(containerColor = AccentOrange.copy(alpha = 0.9f)),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Row(
                                    modifier = Modifier.padding(16.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Icon(imageVector = Icons.Default.Info, contentDescription = null, tint = Midnight)
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("Off Route Detected", color = Midnight, fontWeight = FontWeight.Bold)
                                        Text("Would you like to recalculate your route?", color = Midnight.copy(alpha = 0.8f), style = MaterialTheme.typography.bodySmall)
                                    }
                                    TextButton(onClick = { showReRoutePrompt = false }) {
                                        Text("DISMISS", color = Midnight)
                                    }
                                    Button(
                                        onClick = {
                                            scope.launch {
                                                isReRouting = true
                                                try {
                                                    val dest = if (tripPhase == "pickup") nextSchedule?.pickup_location?.firstOrNull() else nextSchedule?.dropoff_location
                                                    if (dest != null) {
                                                        val originStr = "${currentLatitude},${currentLongitude}"
                                                        val destStr = "${dest.latitude},${dest.longitude}"
                                                        val MapsKey = context.getString(R.string.google_maps_key).ifEmpty { "YOUR_KEY_HERE" }
                                                        val resp = GoogleMapsService.api.getDirections(originStr, destStr, MapsKey)
                                                        if (resp.status == "OK" && resp.routes.isNotEmpty()) {
                                                            val encoded = resp.routes[0].overviewPolyline.points
                                                            activePolylineEncoded = encoded
                                                            polylinePoints = GoogleMapsService.decodePolyline(encoded)
                                                            showReRoutePrompt = false
                                                            tripActionSuccess = "Route recalculated successfully!"
                                                        }
                                                    }
                                                } catch (e: Exception) {
                                                    tripActionError = "Re-route failed: ${e.message}"
                                                } finally {
                                                    isReRouting = false
                                                }
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Midnight),
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        if (isReRouting) CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White)
                                        else Text("RE-ROUTE", color = Color.White)
                                    }
                                }
                            }
                        }

                        // Manage Trip Card
                        if (nextSchedule != null && isTripCompleted) {
                            Text(
                                text = "Trip completed! Refresh to see new assignments.",
                                color = AccentTeal,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }

                        OutlinedButton(
                            onClick = onRefresh,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !isFeedLoading,
                            border = BorderStroke(1.dp, AccentBlue.copy(alpha = 0.5f)),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = AccentBlue)
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(vertical = 4.dp)
                            ) {
                                if (isFeedLoading) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        color = AccentBlue,
                                        strokeWidth = 2.dp
                                    )
                                } else {
                                    Icon(
                                        imageVector = androidx.compose.material.icons.Icons.Default.Notifications,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(modifier = Modifier.padding(horizontal = 4.dp))
                                    Text(
                                        "Sync Assignments",
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                        }

                        if (tripActionError != null) {
                            Text(
                                text = tripActionError ?: "",
                                color = Color(0xFFFF6B6B),
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                        if (tripActionSuccess != null) {
                            Text(
                                text = tripActionSuccess ?: "",
                                color = AccentTeal,
                                style = MaterialTheme.typography.bodySmall
                            )
                        }

                        // Quick Actions simplified: Only sync remains here.
                        // Trip buttons have been moved to the Road-Optimized footer.
                        if (nextSchedule != null && tripPhase == "pending") {
                            Button(
                                onClick = {
                                    val scheduleId = nextSchedule?.scheduleId ?: return@Button
                                    val token = session.sessionToken ?: return@Button

                                    scope.launch {
                                        try {
                                            isStartingTrip = true
                                            tripActionError = null
                                            tripActionSuccess = null
                                            
                                            // Reset tracking for new job
                                            actualRoutePoints.clear()
                                            totalDistanceMetres = 0f
                                            
                                            // Notify service to start accumulating NEW route
                                            val startTripIntent = Intent(context, LocationService::class.java).apply {
                                                action = LocationService.ACTION_START_TRIP
                                                putExtra(LocationService.EXTRA_DRIVER_ID, auth.currentUser?.email?.lowercase()?.trim() ?: "")
                                            }
                                            context.startService(startTripIntent)

                                            val docId = nextSchedule?.docId ?: throw Exception("Schedule ID missing")
                                            db.collection("schedules").document(docId).update(
                                                "status", "accepted",
                                                "trip_phase", "accepted",
                                                "accepted_at", FieldValue.serverTimestamp()
                                            ).await()

                                            acceptedAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
                                            
                                            // Create initial real-time Trip Ticket
                                            val initialTicketData = hashMapOf(
                                                "schedule_id" to docId,
                                                "driver_uid" to (auth.currentUser?.uid ?: ""),
                                                "driver_email" to (auth.currentUser?.email?.lowercase()?.trim() ?: ""),
                                                "driver_name" to liveDriverName,
                                                "passenger_name" to (nextSchedule?.passenger_name ?: nextSchedule?.client_name ?: "Unknown"),
                                                "client_name" to (nextSchedule?.client_name ?: "Jettsan"),
                                                "vehicle_plate" to (session.driver?.plateNumber ?: ""),
                                                "pickup_location" to (nextSchedule?.pickup_location?.firstOrNull()?.address ?: "Unknown"),
                                                "dropoff_location" to (nextSchedule?.dropoff_location?.address ?: "Unknown"),
                                                "time_of_departure" to "", 
                                                "time_of_arrival" to "",
                                                "total_km" to 0.0,
                                                "route_polyline" to "",
                                                "status" to "in_progress",
                                                "created_at" to FieldValue.serverTimestamp()
                                            )
                                            val ticketRef = db.collection("trip_tickets").add(initialTicketData).await()
                                            activeTicketId = ticketRef.id
                                            
                                            // Sync to drivers collection for Admin visibility
                                            val driverEmail = auth.currentUser?.email
                                            if (driverEmail != null) {
                                                val dSnap = db.collection("drivers")
                                                    .whereEqualTo("driver_email", driverEmail.lowercase().trim())
                                                    .get().await()
                                                dSnap.documents.firstOrNull()?.reference?.update(
                                                    "current_status", "on_schedule",
                                                    "current_trip_id", docId,
                                                    "current_trip_phase", "accepted",
                                                    "active_ticket_id", activeTicketId
                                                )
                                            }

                                            // Manual DTR transition: Automated Time-In removed.
                                            // Handled by explicit buttons now.

                                            tripActionSuccess = "Booking accepted! Use the Start Trip button when ready to move."
                                        } catch (e: Exception) {
                                            tripActionError = "Failed to accept: ${e.message}"
                                        } finally {
                                            isStartingTrip = false
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !isAnyActionLoading && nextSchedule != null
                            ) {
                                if (isStartingTrip) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        color = Color.White,
                                        strokeWidth = 2.dp
                                    )
                                } else {
                                    Text("Accept Booking")
                                }
                            }
                        }
                    }
                }
                    
                    // Spacer at the bottom to allow scrolling past the sticky footer
                    Spacer(modifier = Modifier.height(120.dp))
                }

                // Sticky Road-Optimized Footer for trip actions
                if (nextSchedule != null && !isTripCompleted) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .navigationBarsPadding(),
                        color = CardBlue,
                        tonalElevation = 8.dp,
                        shadowElevation = 16.dp,
                        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(24.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                // Passenger info only
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = nextSchedule?.passenger_name ?: nextSchedule?.client_name ?: "Passenger Assignment",
                                        color = TextPrimary,
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = "Current Phase: ${tripPhase.replace("_", " ").uppercase()}",
                                        color = TextSecondary,
                                        style = MaterialTheme.typography.bodySmall
                                    )
                                }
                            }

                            if (tripActionError != null) {
                                Text(
                                    text = tripActionError ?: "",
                                    color = Color(0xFFFF6B6B),
                                    style = MaterialTheme.typography.bodySmall,
                                    modifier = Modifier.padding(bottom = 4.dp)
                                )
                            }
                            
                            val isAnyLoading = isStartingTrip || isMarkingPickup || isMarkingDropoff || isMarkingReturnPickup || isCompletingTrip
                            val phase = tripPhase ?: "pending"

                            when {
                                // Step 1: ACCEPT
                                phase == "pending" || phase == "assigned" -> {
                                    Button(
                                        onClick = {
                                            val docId = nextSchedule?.docId ?: return@Button
                                            scope.launch {
                                                try {
                                                    isStartingTrip = true
                                                    db.collection("schedules").document(docId).update(
                                                        "status", "accepted",
                                                        "trip_phase", "accepted",
                                                        "accepted_at", FieldValue.serverTimestamp()
                                                    ).await()

                                                    acceptedAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
                                                    
                                                     // Update driver status
                                                     val email = auth.currentUser?.email
                                                     if (email != null) {
                                                         val driverSnap = db.collection("drivers")
                                                             .whereEqualTo("driver_email", email)
                                                             .get().await()
                                                         driverSnap.documents.firstOrNull()?.reference?.update(
                                                             "current_status", "on_schedule",
                                                             "current_trip_id", docId,
                                                             "current_trip_phase", "accepted",
                                                             "accepted_at", acceptedAt
                                                         )
                                                     }

                                                    // Manual DTR transition: Automated Time-In removed.
                                                    // Handled by explicit buttons now.

                                                    tripActionSuccess = "Booking accepted! Tap below to start pickup."
                                                    actualRoutePoints.clear() // Ready for new trip
                                                } catch (e: Exception) {
                                                    tripActionError = "Failed: ${e.message}"
                                                } finally {
                                                    isStartingTrip = false
                                                }
                                            }
                                        },
                                        modifier = Modifier.fillMaxWidth().height(64.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = AccentTeal),
                                        shape = RoundedCornerShape(16.dp),
                                        enabled = !isAnyLoading
                                    ) {
                                        if (isStartingTrip) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                        else Text("ACCEPT JOB", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                    }
                                }

                                // Step 2: START PICKUP ROUTE
                                phase == "accepted" -> {
                                    Button(
                                        onClick = {
                                            val docId = nextSchedule?.docId ?: return@Button
                                            scope.launch {
                                                try {
                                                    isStartingTrip = true
                                                    db.collection("schedules").document(docId).update(
                                                        "trip_phase", "moving_to_pickup",
                                                        "started_at", FieldValue.serverTimestamp()
                                                    ).await()

                                                    // Start high-accuracy tracking
                                                    val startTripIntent = Intent(context, LocationService::class.java).apply {
                                                        action = LocationService.ACTION_START_TRIP
                                                        putExtra(LocationService.EXTRA_DRIVER_ID, auth.currentUser?.email?.lowercase()?.trim() ?: "")
                                                    }
                                                    context.startService(startTripIntent)
                                                    
                                                    totalDistanceMetres = 0f
                                                    actualRoutePoints.clear()
                                                    
                                                    // Sync to drivers collection
                                                    val email = auth.currentUser?.email
                                                    if (email != null) {
                                                        val dSnap = db.collection("drivers")
                                                            .whereEqualTo("driver_email", email.lowercase().trim())
                                                            .get().await()
                                                        dSnap.documents.firstOrNull()?.reference?.update(
                                                            "current_status", "moving_to_pickup",
                                                            "current_trip_phase", "moving_to_pickup"
                                                        )
                                                    }
                                                    tripActionSuccess = "Routing to Pickup point..."
                                                } catch (e: Exception) {
                                                    tripActionError = "Failed: ${e.message}"
                                                } finally {
                                                    isStartingTrip = false
                                                }
                                            }
                                        },
                                        modifier = Modifier.fillMaxWidth().height(64.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = AccentBlue),
                                        shape = RoundedCornerShape(16.dp),
                                        enabled = !isAnyLoading
                                    ) {
                                        if (isStartingTrip) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                        else Text("START PICKUP ROUTE", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                    }
                                }

                                // Step 3: MARK AS PICKED UP (Odometer required)
                                phase == "moving_to_pickup" -> {
                                    Button(
                                        onClick = {
                                            showOdometerDialog = true
                                        },
                                        modifier = Modifier.fillMaxWidth().height(64.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = AccentTeal),
                                        shape = RoundedCornerShape(16.dp),
                                        enabled = !isAnyLoading
                                    ) {
                                        if (isMarkingPickup) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                        else Text("MARK AS PICKED UP", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                    }
                                }

                                // Step 4: START DROPOFF ROUTE
                                phase == "picked_up" -> {
                                    Button(
                                        onClick = {
                                            val docId = nextSchedule?.docId ?: return@Button
                                            scope.launch {
                                                try {
                                                    isStartingTrip = true
                                                    db.collection("schedules").document(docId).update(
                                                        "trip_phase", "moving_to_dropoff"
                                                    ).await()

                                                    // Sync to drivers collection
                                                    val email = auth.currentUser?.email
                                                    if (email != null) {
                                                        val dSnap = db.collection("drivers")
                                                            .whereEqualTo("driver_email", email.lowercase().trim())
                                                            .get().await()
                                                        dSnap.documents.firstOrNull()?.reference?.update(
                                                            "current_status", "moving_to_dropoff",
                                                            "current_trip_phase", "moving_to_dropoff"
                                                        )
                                                    }
                                                    tripActionSuccess = "Routing to Dropoff point..."
                                                } catch (e: Exception) {
                                                    tripActionError = "Failed: ${e.message}"
                                                } finally {
                                                    isStartingTrip = false
                                                }
                                            }
                                        },
                                        modifier = Modifier.fillMaxWidth().height(64.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = AccentBlue),
                                        shape = RoundedCornerShape(16.dp),
                                        enabled = !isAnyLoading
                                    ) {
                                        if (isStartingTrip) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                        else Text("START DROPOFF ROUTE", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                    }
                                }

                                // Step 5: MARK AS DROPPED OFF
                                phase == "moving_to_dropoff" -> {
                                    Button(
                                        onClick = {
                                            val docId = nextSchedule?.docId ?: return@Button
                                            scope.launch {
                                                try {
                                                     isMarkingDropoff = true
                                                     tripActionError = null
                                                     val docRef = db.collection("schedules").document(docId)
                                                     val doc = docRef.get().await()
                                                     val returnReq = doc.getBoolean("return_to_pickup") ?: false
                                                     val nextP = if (returnReq) "return_pickup" else "ready_to_complete"
                                                     
                                                     docRef.update("trip_phase", nextP, "dropped_off_at", FieldValue.serverTimestamp()).await()
                                                     
                                                     // Sync to drivers collection
                                                     val email = auth.currentUser?.email
                                                     if (email != null) {
                                                         val dSnap = db.collection("drivers")
                                                             .whereEqualTo("driver_email", email.lowercase().trim())
                                                             .get().await()
                                                         dSnap.documents.firstOrNull()?.reference?.update(
                                                             "current_status", nextP,
                                                             "current_trip_phase", nextP
                                                         )
                                                     }
                                                     
                                                     // Manual DTR transition: Automated Time-Out removed.
                                                     // Handled by explicit buttons now.

                                                     tripActionSuccess = if (returnReq) "Arrived! Return required." else "Arrived! Trip ready to complete."
                                                 } catch (e: Exception) {
                                                     tripActionError = "Failed: ${e.message}"
                                                 } finally {
                                                     isMarkingDropoff = false
                                                 }
                                             }
                                         },
                                         modifier = Modifier.fillMaxWidth().height(64.dp),
                                         colors = ButtonDefaults.buttonColors(containerColor = AccentOrange),
                                         shape = RoundedCornerShape(16.dp),
                                         enabled = !isAnyLoading
                                     ) {
                                         if (isMarkingDropoff) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                         else Text("MARK AS DROPPED OFF", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                     }
                                }

                                // Step 6: COMPLETE (Odometer & Signature required)
                                phase == "dropped_off" || phase == "ready_to_complete" || phase == "return_pickup" -> {
                                    Button(
                                        onClick = {
                                            showOdometerDialog = true
                                        },
                                        modifier = Modifier.fillMaxWidth().height(64.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = AccentTeal),
                                        shape = RoundedCornerShape(16.dp),
                                        enabled = !isAnyLoading
                                    ) {
                                        Text("COMPLETE TRIP", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                }

                // New Task Reactive Overlay
                androidx.compose.animation.AnimatedVisibility(
                    visible = showNewTaskOverlay,
                    enter = androidx.compose.animation.fadeIn() + androidx.compose.animation.expandVertically(),
                    exit = androidx.compose.animation.fadeOut() + androidx.compose.animation.shrinkVertically(),
                    modifier = Modifier.fillMaxSize()
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.95f))
                            .padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(24.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(
                                imageVector = Icons.Default.Notifications,
                                contentDescription = "New Job",
                                tint = AccentTeal,
                                modifier = Modifier.size(80.dp)
                            )
                            Text(
                                "NEW ASSIGNMENT",
                                color = Color.White,
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Card(
                                colors = CardDefaults.cardColors(containerColor = CardBlue),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text("Passenger: ${nextSchedule?.passenger_name ?: nextSchedule?.client_name ?: "Fleet Assign"}", color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                                    
                                    if (!nextSchedule?.passenger_phone.isNullOrBlank()) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Icon(Icons.Default.Phone, contentDescription = null, tint = AccentTeal, modifier = Modifier.size(16.dp))
                                            Text(nextSchedule?.passenger_phone!!, color = AccentTeal, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                                        }
                                    }

                                    Divider(color = Color.White.copy(alpha = 0.1f))

                                    // All pick-up and drop-off points (Full Segment Visibility)
                                    if (!nextSchedule?.segments.isNullOrEmpty()) {
                                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                            Text("TRIP ROUTE:", color = TextSecondary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                            nextSchedule?.segments?.forEachIndexed { index, segment ->
                                                Column(modifier = Modifier.padding(start = 4.dp)) {
                                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                                        Box(modifier = Modifier.size(6.dp).background(AccentBlue, androidx.compose.foundation.shape.CircleShape))
                                                        Spacer(Modifier.width(8.dp))
                                                        Text("P${index+1}: ${segment.pickup}", color = Color.White, style = MaterialTheme.typography.bodySmall)
                                                    }
                                                    Spacer(modifier = Modifier.height(2.dp))
                                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                                        Box(modifier = Modifier.size(6.dp).background(AccentOrange, androidx.compose.foundation.shape.CircleShape))
                                                        Spacer(Modifier.width(8.dp))
                                                        Text("D${index+1}: ${segment.dropoff}", color = Color.White, style = MaterialTheme.typography.bodySmall)
                                                    }
                                                }
                                            }
                                        }
                                    } else {
                                        Text("Pickup: ${nextSchedule?.pickup_location?.firstOrNull()?.address ?: "Pending"}", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                                        Text("Dropoff: ${nextSchedule?.dropoff_location?.address ?: "Pending"}", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                                    }

                                    if (!nextSchedule?.special_instructions.isNullOrBlank()) {
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Icon(Icons.Default.Info, contentDescription = null, tint = Color(0xFFFFB347), modifier = Modifier.size(14.dp))
                                            Text(nextSchedule?.special_instructions!!, color = Color(0xFFFFB347), style = MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                }
                            }
                            if (!isJobAcceptable) {
                                Text(
                                    "Ready to accept in window (+/- 1hr)",
                                    color = Color(0xFFFF6B6B),
                                    style = MaterialTheme.typography.bodySmall,
                                    modifier = Modifier.padding(bottom = 8.dp)
                                )
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Button(
                                    onClick = { 
                                        val docId = nextSchedule?.docId ?: return@Button
                                        scope.launch {
                                            try {
                                                isStartingTrip = true
                                                tripActionError = null
                                                
                                                // Reset tracking for new job
                                                actualRoutePoints.clear()
                                                totalDistanceMetres = 0f

                                                // Notify service to start accumulating NEW route
                                                val startTripIntent = Intent(context, LocationService::class.java).apply {
                                                    action = LocationService.ACTION_START_TRIP
                                                    putExtra(LocationService.EXTRA_DRIVER_ID, auth.currentUser?.email?.lowercase()?.trim() ?: "")
                                                }
                                                context.startService(startTripIntent)
                                                db.collection("schedules").document(docId).update(
                                                    "status", "accepted",
                                                    "trip_phase", "accepted",
                                                    "accepted_at", FieldValue.serverTimestamp()
                                                ).await()

                                                acceptedAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
                                                
                                                // Create initial real-time Trip Ticket
                                                val initialTicketData = hashMapOf(
                                                    "schedule_id" to docId,
                                                    "driver_uid" to (auth.currentUser?.uid ?: ""),
                                                    "driver_email" to (auth.currentUser?.email?.lowercase()?.trim() ?: ""),
                                                    "driver_name" to liveDriverName,
                                                    "passenger_name" to (nextSchedule?.passenger_name ?: nextSchedule?.client_name ?: "Unknown"),
                                                    "client_name" to (nextSchedule?.client_name ?: "Jettsan"),
                                                    "vehicle_plate" to (session.driver?.plateNumber ?: ""),
                                                    "pickup_location" to (nextSchedule?.pickup_location?.firstOrNull()?.address ?: "Unknown"),
                                                    "dropoff_location" to (nextSchedule?.dropoff_location?.address ?: "Unknown"),
                                                    "time_of_departure" to "",
                                                    "time_of_arrival" to "",
                                                    "total_km" to 0.0,
                                                    "route_polyline" to "",
                                                    "status" to "in_progress",
                                                    "isOfficial" to true,
                                                    "created_at" to FieldValue.serverTimestamp()
                                                )
                                                val ticketRef = db.collection("trip_tickets").add(initialTicketData).await()
                                                activeTicketId = ticketRef.id

                                                val email = auth.currentUser?.email
                                                if (email != null) {
                                                    val driverSnap = db.collection("drivers")
                                                        .whereEqualTo("driver_email", email.lowercase().trim())
                                                        .get().await()
                                                    driverSnap.documents.firstOrNull()?.reference?.update(
                                                        "current_status", "on_schedule",
                                                        "current_trip_id", docId,
                                                        "current_trip_phase", "accepted",
                                                        "active_ticket_id", activeTicketId
                                                    )
                                                }

                                                // Manual DTR transition: Automated Time-In removed.
                                                // Handled by explicit buttons now.

                                                showNewTaskOverlay = false
                                                tripActionSuccess = "Booking accepted! You can now start the trip when ready."
                                            } catch (e: Exception) {
                                                tripActionError = "Failed: ${e.message}"
                                            } finally {
                                                isStartingTrip = false
                                                // Sync overlay acceptance to drivers collection
                                                driverDocRef?.update(
                                                    "current_status", "on_schedule",
                                                    "current_trip_phase", "accepted"
                                                )
                                            }
                                        }
                                    },
                                    modifier = Modifier.weight(1f).height(64.dp),
                                    shape = RoundedCornerShape(16.dp),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = if (isJobAcceptable) AccentTeal else Color.Gray.copy(alpha = 0.5f)
                                    ),
                                    enabled = !isStartingTrip && isJobAcceptable
                                ) {
                                    if (isStartingTrip) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                    else Text("ACCEPT JOB", fontWeight = FontWeight.Bold)
                                }
                                
                                OutlinedButton(
                                    onClick = { showNewTaskOverlay = false },
                                    modifier = Modifier.weight(1f).height(64.dp),
                                    shape = RoundedCornerShape(16.dp),
                                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.5f))
                                ) {
                                    Text("VIEW DETAILS", color = Color.White)
                                }
                            }
                        }
                    }
                }

        if (showTripTicket) {
            TripTicketDialog(
                driverName = session.user?.name ?: "Driver",
                vehiclePlate = session.driver?.plateNumber ?: "N/A",
                vehicleType = session.driver?.vehicleAssigned ?: "Vehicle",
                timeOfDeparture = pickedUpAt ?: "--:--",
                timeOfArrival = completedAt ?: "--:--",
                totalKm = totalDistanceMetres / 1000.0,
                routePoints = actualRoutePoints.toList(),
                segments = nextSchedule?.segments,
                isSubmitting = isCompletingTrip,
                onConfirm = {
                    val docId = targetTripId ?: return@TripTicketDialog
                    scope.launch {
                        try {
                            isCompletingTrip = true
                            tripActionError = null
                            
                            val tripData = hashMapOf(
                                "status" to "completed",
                                "trip_phase" to "completed",
                                "completed_at" to FieldValue.serverTimestamp(),
                                "accepted_at" to (acceptedAt ?: ""),
                                "picked_up_at" to (pickedUpAt ?: ""),
                                "time_of_departure" to (pickedUpAt ?: ""),
                                "time_of_arrival" to (completedAt ?: ""),
                                "total_km_travelled" to (totalDistanceMetres / 1000.0),
                                "vehicle_type" to (session.driver?.vehicleAssigned ?: ""),
                                "plate_number" to (session.driver?.plateNumber ?: ""),
                                "route_polyline" to GoogleMapsService.encodePolyline(actualRoutePoints)
                            )
                            
                            db.collection("schedules").document(docId).update(tripData as Map<String, Any>).await()
                            
                            // Encode the actual route points traveled
                            val routePolyline = if (actualRoutePoints.isNotEmpty()) {
                                GoogleMapsService.encodePolyline(actualRoutePoints.toList())
                            } else {
                                ""
                            }

                            // Save the actual Trip Ticket for the Admin Dashboard and History
                            val ticketData = hashMapOf(
                                "schedule_id" to docId,
                                "driver_uid" to (auth.currentUser?.uid ?: ""),
                                "driver_email" to (auth.currentUser?.email?.lowercase()?.trim() ?: ""),
                                "driver_name" to liveDriverName,
                                "passenger_name" to (nextSchedule?.passenger_name ?: nextSchedule?.client_name ?: "Unknown"),
                                "client_name" to (nextSchedule?.client_name ?: "Jettsan"),
                                "vehicle_plate" to (session.driver?.plateNumber ?: ""),
                                "pickup_location" to (nextSchedule?.pickup_location?.firstOrNull()?.address ?: "Unknown"),
                                "dropoff_location" to (nextSchedule?.dropoff_location?.address ?: "Unknown"),
                                "time_of_departure" to (pickedUpAt ?: ""),
                                "time_of_arrival" to (completedAt ?: ""),
                                "total_km" to (totalDistanceMetres / 1000.0),
                                "route_polyline" to GoogleMapsService.encodePolyline(actualRoutePoints),
                                "segments" to (nextSchedule?.segments?.map { mapOf("pickup" to it.pickup, "dropoff" to it.dropoff) } ?: emptyList<Map<String, String>>()),
                                "status" to "completed",
                                "completed_at" to FieldValue.serverTimestamp()
                            )
                            activeTicketId?.let { ticketId ->
                                db.collection("trip_tickets").document(ticketId).update(ticketData as Map<String, Any>).await()
                            }
                            activeTicketId = null
                            
                            // Update driver back to available and sync to drivers collection
                            val currentMileage = session.driver?.currentMileage ?: 0.0
                            val newMileage = currentMileage + (totalDistanceMetres / 1000.0)
                            
                            val email = auth.currentUser?.email
                            if (email != null) {
                                val dSnap = db.collection("drivers")
                                    .whereEqualTo("driver_email", email.lowercase().trim())
                                    .get().await()
                                    
                                dSnap.documents.firstOrNull()?.reference?.update(
                                    "current_status", "available",
                                    "current_trip_id", "",
                                    "current_trip_phase", "completed",
                                    "current_mileage", newMileage,
                                    "active_ticket_id", "",
                                    "last_updated", com.google.firebase.firestore.FieldValue.serverTimestamp()
                                )?.await()
                            }
                            
                            tripActionSuccess = "Trip completed successfully!"
                        } catch (e: Exception) {
                            tripActionError = "Failed: ${e.message}"
                            Log.e("DriverDashboard", "Trip completion failed", e)
                        } finally {
                            isCompletingTrip = false
                            showTripTicket = false
                        }
                    }
                }
            )
        }

        // Accident Report Dialog (outside ModalNavigationDrawer but inside Box)
        if (showAccidentDialog) {
            AccidentReportDialog(
                onDismiss = { showAccidentDialog = false },
                onReport = handleAccidentReport,
                isReporting = isReportingAccident
            )
        }
        
        // NSCRP: Odometer Reading Dialog
        if (showOdometerDialog) {
            val isStarting = tripPhase == "moving_to_pickup" || tripPhase == "accepted"
            OdometerDialog(
                lastMileage = lastVehicleMileage,
                isStarting = isStarting,
                onConfirm = { mileage ->
                    showOdometerDialog = false
                    val docId = nextSchedule?.docId ?: return@OdometerDialog
                    val uid = auth.currentUser?.uid ?: return@OdometerDialog
                    scope.launch {
                        try {
                            isMarkingPickup = true
                            
                            // 1. Automated Time In (DTR) if not already
                            if (!isTimedIn) {
                                // Enforce 26-hour monthly OT cap
                                if (monthlyOTHours >= 26.0) {
                                    tripActionError = "Daily Time Record Blocked: Monthly Overtime Cap (26h) reached. Please contact your supervisor."
                                    return@launch
                                }

                                val addr = getAddressFromLocation(currentLatitude, currentLongitude)
                                val logData = hashMapOf(
                                    "driver_uid" to uid,
                                    "driver_email" to (auth.currentUser?.email?.lowercase()?.trim() ?: ""),
                                    "driver_name" to liveDriverName,
                                    "action" to "time_in",
                                    "timestamp" to FieldValue.serverTimestamp(),
                                    "latitude" to currentLatitude,
                                    "longitude" to currentLongitude,
                                    "location_name" to addr,
                                    "device_time" to LocalDateTime.now().toString(),
                                    "is_overtime" to false // Initial login is standard
                                )
                                db.collection("dtr_logs").add(logData).await()
                                db.collection("drivers").document(uid).update("is_currently_timed_in", true).await()
                                isTimedIn = true
                            }
                            
                            // 2. Update Schedule with Odometer
                            val updateData = if (isStarting) {
                                mapOf("odometer_start" to mileage, "trip_phase" to "picked_up", "picked_up_at" to FieldValue.serverTimestamp())
                            } else {
                                endOdometerValue = mileage
                                showSignatureDialog = true
                                emptyMap<String, Any>()
                            }
                            
                            if (isStarting) {
                                db.collection("schedules").document(docId).update(updateData).await()
                                // 3. Update Driver's Current Mileage
                                db.collection("drivers").document(uid).update("current_mileage", mileage).await()
                                tripActionSuccess = "Trip started! Please drive safely to the destination."
                            }
                            lastVehicleMileage = mileage
                            
                            if (!isStarting) {
                                showSignatureDialog = true
                            } else {
                                tripActionSuccess = "Odometer recorded. Trip started!"
                            }
                        } catch (e: Exception) {
                            tripActionError = "Odometer failed: ${e.message}"
                        } finally {
                            isMarkingPickup = false
                        }
                    }
                },
                onDismiss = { showOdometerDialog = false }
            )
        }

        // NSCRP: Signature / Refusal Dialog
        if (showSignatureDialog) {
            val tId = nextSchedule?.docId ?: ""
            SignatureDialog(
                tripId = tId,
                onConfirm = { signatureUrl ->
                    showSignatureDialog = false
                    val dId = nextSchedule?.docId ?: return@SignatureDialog
                    scope.launch {
                        try {
                            isCompletingTrip = true
                            db.collection("schedules").document(dId).update(
                                "passenger_signature_url", signatureUrl,
                                "odometer_end", endOdometerValue,
                                "trip_phase", "completed",
                                "status", "completed",
                                "completed_at", FieldValue.serverTimestamp()
                            ).await()
                            
                            // Auto-trigger completion ticket
                            targetTripId = dId
                            showTripTicket = true
                            tripActionSuccess = "Trip verified and completed!"
                        } catch (e: Exception) {
                            tripActionError = "Completion failed: ${e.message}"
                        } finally {
                            isCompletingTrip = false
                        }
                    }
                },
                onRefuse = { reason ->
                    showSignatureDialog = false
                    val dId = nextSchedule?.docId ?: return@SignatureDialog
                    scope.launch {
                        try {
                            isCompletingTrip = true
                            db.collection("schedules").document(dId).update(
                                "refusal_reason", reason,
                                "odometer_end", endOdometerValue,
                                "trip_phase", "completed",
                                "status", "completed",
                                "completed_at", FieldValue.serverTimestamp()
                            ).await()
                            
                            // Auto-trigger completion ticket
                            targetTripId = dId
                            showTripTicket = true
                            tripActionSuccess = "Refusal documented. Trip completed."
                        } catch (e: Exception) {
                            tripActionError = "Completion failed: ${e.message}"
                        } finally {
                            isCompletingTrip = false
                        }
                    }
                },
                onDismiss = { showSignatureDialog = false }
            )
        }

    // Navigation Overlays
    if (showProfile) {
            BackHandler { showProfile = false }
            DriverProfile(session = session, onBack = { showProfile = false })
        }
        
        if (showTripHistory) {
            BackHandler { showTripHistory = false }
            TripHistoryScreen(onBack = { showTripHistory = false })
        }
        if (showDtrHistory) {
            BackHandler { showDtrHistory = false }
            DTRHistoryScreen(onBack = { showDtrHistory = false })
        }
        }
    } // End of ModalNavigationDrawer main content lambda
} // End of outer Box (1167)
} // End of DriverDashboard function (236)

@Composable
fun SpeedometerWidget(speedKmH: Float, modifier: Modifier = Modifier) {
    val maxSpeed = 140f
    val sweepAngle = 240f
    val startAngle = 150f
    
    val currentSpeedClamped = speedKmH.coerceIn(0f, maxSpeed)
    val progress = currentSpeedClamped / maxSpeed
    val progressAngle = progress * sweepAngle
    
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier.padding(8.dp)
    ) {
        Box(
            modifier = Modifier.size(120.dp),
            contentAlignment = Alignment.Center
        ) {
            androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxSize()) {
                val strokeWidth = 10.dp.toPx()
                // Background arc
                drawArc(
                    color = Color.DarkGray,
                    startAngle = startAngle,
                    sweepAngle = sweepAngle,
                    useCenter = false,
                    style = androidx.compose.ui.graphics.drawscope.Stroke(
                        width = strokeWidth,
                        cap = androidx.compose.ui.graphics.StrokeCap.Round
                    )
                )
                
                // Foreground arc
                val gaugeColor = when {
                    speedKmH < 60f -> Color(0xFF10B981) // Green
                    speedKmH < 100f -> Color(0xFFF59E0B) // Amber
                    else -> Color(0xFFEF4444) // Red
                }
                
                drawArc(
                    color = gaugeColor,
                    startAngle = startAngle,
                    sweepAngle = progressAngle,
                    useCenter = false,
                    style = androidx.compose.ui.graphics.drawscope.Stroke(
                        width = strokeWidth,
                        cap = androidx.compose.ui.graphics.StrokeCap.Round
                    )
                )
            }
            // Speed text inside gauge
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "%.0f".format(currentSpeedClamped),
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.headlineLarge
                )
                Text(
                    text = "KM/H",
                    color = Color.LightGray,
                    style = MaterialTheme.typography.labelSmall
                )
            }
        }
    }
}

@Composable
fun OdometerDialog(
    lastMileage: Double,
    isStarting: Boolean,
    onConfirm: (Double) -> Unit,
    onDismiss: () -> Unit
) {
    var mileageStr by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = CardBlue,
            modifier = androidx.compose.ui.Modifier.padding(16.dp)
        ) {
            Column(
                modifier = androidx.compose.ui.Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    if (isStarting) "START ODOMETER" else "END ODOMETER",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                
                Text(
                    "Last recorded: ${"%.1f".format(lastMileage)} KM",
                    color = TextSecondary,
                    style = MaterialTheme.typography.bodyMedium
                )

                OutlinedTextField(
                    value = mileageStr,
                    onValueChange = { if (it.all { char -> char.isDigit() || char == '.' }) mileageStr = it },
                    label = { Text("Enter Odometer Reading") },
                    modifier = androidx.compose.ui.Modifier.fillMaxWidth(),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                        keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                    ),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = AccentTeal,
                        cursorColor = AccentTeal
                    )
                )

                if (error != null) {
                    Text(error!!, color = Color.Red, style = MaterialTheme.typography.bodySmall)
                }

                Button(
                    onClick = {
                        val mileage = mileageStr.toDoubleOrNull()
                        if (mileage == null) {
                            error = "Invalid number"
                        } else if (mileage < lastMileage) {
                            error = "Mileage cannot be less than last recorded (${lastMileage})"
                        } else {
                            onConfirm(mileage)
                        }
                    },
                    modifier = androidx.compose.ui.Modifier.fillMaxWidth().height(56.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = AccentTeal)
                ) {
                    Text("CONFIRM", fontWeight = FontWeight.Bold, color = Midnight)
                }
            }
        }
    }
}

@Composable
fun SignatureDialog(
    tripId: String,
    onConfirm: (String) -> Unit,
    onRefuse: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var refusalReasonVal by remember { mutableStateOf("") }
    var showRefusalField by remember { mutableStateOf(false) }
    var isSubmitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    
    val paths = remember { mutableStateListOf<PathState>() }
    val scope = rememberCoroutineScope()

    androidx.compose.ui.window.Dialog(onDismissRequest = { if (!isSubmitting) onDismiss() }) {
        Surface(
            shape = RoundedCornerShape(24.dp), 
            color = CardBlue,
            modifier = Modifier.fillMaxWidth().padding(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(24.dp), 
                verticalArrangement = Arrangement.spacedBy(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("CLIENT VERIFICATION", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Color.White)
                
                if (!showRefusalField) {
                    Text("Please ask the passenger to sign below:", color = TextSecondary, style = MaterialTheme.typography.bodyMedium)
                    
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(250.dp)
                            .background(Color.White, RoundedCornerShape(12.dp))
                            .border(2.dp, AccentTeal.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                    ) {
                        SignaturePad(
                            paths = paths,
                            modifier = Modifier.fillMaxSize()
                        )
                        
                        if (paths.isEmpty()) {
                            Text("Draw signature here", color = Color.LightGray, modifier = Modifier.align(Alignment.Center))
                        }
                    }

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(
                            onClick = { paths.clear() },
                            enabled = !isSubmitting && paths.isNotEmpty()
                        ) {
                            Text("Clear", color = AccentOrange)
                        }
                        Spacer(Modifier.weight(1f))
                        TextButton(
                            onClick = { showRefusalField = true },
                            enabled = !isSubmitting
                        ) {
                            Text("Passenger Refused", color = Color.White.copy(alpha = 0.7f))
                        }
                    }

                    Button(
                        onClick = {
                            if (paths.isEmpty()) {
                                error = "Signature is required"
                                return@Button
                            }
                            scope.launch {
                                try {
                                    isSubmitting = true
                                    error = null
                                    val bitmap = FirebaseStorageHelper.createBitmapFromPaths(paths, 800, 500)
                                    val url = FirebaseStorageHelper.uploadSignature(bitmap, tripId)
                                    onConfirm(url)
                                } catch (e: Exception) {
                                    error = "Upload failed: ${e.message}"
                                } finally {
                                    isSubmitting = false
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = AccentTeal),
                        enabled = !isSubmitting && paths.isNotEmpty()
                    ) {
                        if (isSubmitting) CircularProgressIndicator(color = Midnight, modifier = Modifier.size(24.dp))
                        else Text("SAVE SIGNATURE", fontWeight = FontWeight.Bold, color = Midnight)
                    }
                } else {
                    Text("REFUSAL TO SIGN", color = AccentOrange, fontWeight = FontWeight.Bold)
                    Text("Please provide the reason for refusal:", color = TextSecondary)
                    
                    OutlinedTextField(
                        value = refusalReasonVal,
                        onValueChange = { refusalReasonVal = it },
                        label = { Text("Refusal Reason") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            focusedBorderColor = AccentOrange,
                            cursorColor = AccentOrange
                        )
                    )
                    
                    if (error != null) {
                        Text(error!!, color = Color.Red, style = MaterialTheme.typography.bodySmall)
                    }

                    Button(
                        onClick = {
                            if (refusalReasonVal.trim().isEmpty()) {
                                error = "Reason is mandatory"
                                return@Button
                            }
                            onRefuse(refusalReasonVal)
                        },
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = AccentOrange)
                    ) {
                        Text("SUBMIT REFUSAL", fontWeight = FontWeight.Bold)
                    }
                    
                    TextButton(onClick = { showRefusalField = false; error = null }) {
                        Text("Back to Signature", color = Color.White.copy(alpha = 0.6f))
                    }
                }
                
                if (error != null && !showRefusalField) {
                    Text(error!!, color = Color.Red, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
