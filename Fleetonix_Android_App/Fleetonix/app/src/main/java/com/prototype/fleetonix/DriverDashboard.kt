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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
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
import com.google.android.gms.maps.*
import com.google.android.gms.maps.model.*
import com.google.maps.android.compose.*
import java.time.*
import java.time.format.*

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
    isSubmitting: Boolean,
    onConfirm: () -> Unit
) {
    AlertDialog(
        onDismissRequest = { }, // Force confirmation
        tonalElevation = 8.dp,
        containerColor = CardBlue,
        title = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = AccentTeal, modifier = Modifier.size(48.dp))
                Spacer(Modifier.height(8.dp))
                Text("TRAVEL TRIP TICKET", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = TextPrimary)
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Divider(color = Midnight)
                
                TicketRow("Driver", driverName)
                TicketRow("Vehicle", "$vehicleType ($vehiclePlate)")
                TicketRow("Departure", timeOfDeparture)
                TicketRow("Arrival", timeOfArrival)
                
                Spacer(Modifier.height(8.dp))
                
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Midnight, RoundedCornerShape(8.dp))
                        .padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("TOTAL DISTANCE", style = MaterialTheme.typography.labelSmall, color = TextSecondary)
                        Text("${"%.2f".format(totalKm)} KM", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold, color = AccentTeal)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                enabled = !isSubmitting,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = AccentTeal),
                shape = RoundedCornerShape(12.dp)
            ) {
                if (isSubmitting) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                else Text("CONFIRM & CLOSE", fontWeight = FontWeight.Bold)
            }
        }
    )
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

    // Accident report states
    var showAccidentDialog by remember { mutableStateOf(false) }
    var isReportingAccident by remember { mutableStateOf(false) }

    // Vehicle issue states
    var showVehicleIssueDialog by remember { mutableStateOf(false) }
    var isReportingVehicleIssue by remember { mutableStateOf(false) }

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

    val nextSchedule = feed?.schedules?.firstOrNull()
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
    val stopsCount = feed?.schedules?.size ?: 0
    val scheduledDateTime = remember(nextSchedule?.scheduled_date, nextSchedule?.scheduled_time) {
        parseScheduleDateTime(nextSchedule?.scheduled_date, nextSchedule?.scheduled_time)
    }
    val isStartWindowOpen = scheduledDateTime?.let { target ->
        val diffMinutes = Duration.between(LocalDateTime.now(), target).toMinutes()
        diffMinutes <= 60
    } ?: true

    // Trip action states
    var isStartingTrip by remember { mutableStateOf(false) }
    var isMarkingPickup by remember { mutableStateOf(false) }
    var isMarkingDropoff by remember { mutableStateOf(false) }
    var isMarkingReturnPickup by remember { mutableStateOf(false) }
    var isCompletingTrip by remember { mutableStateOf(false) }

    // Trip Ticket states
    var totalDistanceMetres by remember { mutableStateOf(0f) }
    var acceptedAt by remember { mutableStateOf<String?>(null) }
    var pickedUpAt by remember { mutableStateOf<String?>(null) }
    var completedAt by remember { mutableStateOf<String?>(null) }
    var showTripTicket by remember { mutableStateOf(false) }

    // New Task Popup states
    var lastKnownScheduleId by remember { mutableStateOf<Int?>(nextSchedule?.scheduleId) }
    var showNewTaskOverlay by remember { mutableStateOf(false) }

    // Trigger reactive overlay when a new assignment arrives
    LaunchedEffect(nextSchedule?.scheduleId) {
        if (nextSchedule?.scheduleId != null && nextSchedule.scheduleId != lastKnownScheduleId && tripPhase == "pending") {
            showNewTaskOverlay = true
            lastKnownScheduleId = nextSchedule.scheduleId
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

    // Automated Routing logic
    LaunchedEffect(tripPhase, currentLatitude, currentLongitude, nextSchedule?.scheduleId) {
        val schedule = nextSchedule ?: return@LaunchedEffect
        
        // Log the triggers
        Log.d("Routing", "Triggered: phase=$tripPhase, loc=$currentLatitude,$currentLongitude, scheduleId=${schedule.scheduleId}")

        if (currentLatitude == 0.0 || currentLongitude == 0.0) {
            Log.w("Routing", "Waiting for valid GPS coordinates...")
            return@LaunchedEffect
        }

        val origin = "$currentLatitude,$currentLongitude"
        val destination = when (tripPhase) {
            "pending", "assigned", "pickup", "return_pickup" -> if (schedule.pickup_location?.latitude != null) "${schedule.pickup_location.latitude},${schedule.pickup_location.longitude}" else null
            "dropoff" -> if (schedule.dropoff_location?.latitude != null) "${schedule.dropoff_location.latitude},${schedule.dropoff_location.longitude}" else null
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
                    "driver_email" to user?.email,
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

    // Acknowledgment Listener
    var latestAckMessage by remember { mutableStateOf<String?>(null) }
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

                    if (lat != 0.0 && lng != 0.0) {
                        currentLatitude = lat
                        currentLongitude = lng
                        currentSpeed = speed
                        currentAccuracy = accuracy
                        currentHeading = bearing
                        totalDistanceMetres = totalDist

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
            val startIntent = Intent(context, LocationService::class.java).apply { action = LocationService.ACTION_START }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(startIntent)
            } else {
                context.startService(startIntent)
            }
            // Also push the last known location immediately so admin map updates right away
            try {
                val loc = LocationServices.getFusedLocationProviderClient(context).lastLocation.await()
                if (loc != null && loc.latitude != 0.0 && loc.longitude != 0.0) {
                    val email = auth.currentUser?.email?.lowercase()?.trim() ?: ""
                    if (email.isNotEmpty()) {
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
                        )
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
                    val lat = schedule.pickup_location?.latitude
                    val lng = schedule.pickup_location?.longitude
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

    // Show profile screen if requested
    if (showProfile) {
        DriverProfile(session = session, onBack = { showProfile = false })
        return
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
                val issueDescription = description ?: issueType

                val issueData = hashMapOf(
                    "driver_email" to user?.email,
                    "schedule_id" to (schedule?.scheduleId ?: 0),
                    "firebase_schedule_id" to schedule?.docId,
                    "issue_type" to issueType,
                    "description" to issueDescription,
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
                        val driverName = session.user?.name ?: "Driver"
                        Text(
                            text = "Hi, $driverName",
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
                        title = "Stops",
                        value = "$stopsCount remaining",
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
                        // GPS Stats Row
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Speed", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                                Text("${"%.1f".format(currentSpeed * 3.6)} km/h", color = TextPrimary, fontWeight = FontWeight.Bold)
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Accuracy", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                                Text("${"%.1f".format(currentAccuracy)}m", color = TextPrimary, fontWeight = FontWeight.Bold)
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Position", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                                Text("${"%.4f".format(currentLatitude)}, ${"%.4f".format(currentLongitude)}", color = TextPrimary, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
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
                                properties = mapProperties,
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
                                                nextSchedule?.pickup_location?.address ?: "" 
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
                        
                        // Action Buttons for Navigation
                        Row(
                            modifier = Modifier.padding(16.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Button(
                                onClick = { 
                                    // Open in Waze
                                    try {
                                        val url = "waze://?ll=$currentLatitude,$currentLongitude&navigate=yes"
                                        val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
                                        context.startActivity(intent)
                                    } catch (e: Exception) {
                                        // Fallback to Google Maps if Waze not installed
                                        val gmmIntentUri = android.net.Uri.parse("google.navigation:q=$currentLatitude,$currentLongitude")
                                        val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
                                        mapIntent.setPackage("com.google.android.apps.maps")
                                        context.startActivity(mapIntent)
                                    }
                                },
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.buttonColors(containerColor = AccentOrange)
                            ) {
                                Text("Waze", style = MaterialTheme.typography.bodySmall)
                            }
                            
                            Button(
                                onClick = {
                                    // Open in Google Maps
                                    val gmmIntentUri = android.net.Uri.parse("google.navigation:q=$currentLatitude,$currentLongitude")
                                    val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
                                    mapIntent.setPackage("com.google.android.apps.maps")
                                    context.startActivity(mapIntent)
                                },
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.buttonColors(containerColor = AccentBlue)
                            ) {
                                Text("G-Maps", style = MaterialTheme.typography.bodySmall)
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

                        // Trip action buttons (same as before)
                        val startWindowLocked =
                            nextSchedule != null && tripPhase == "pending" && !isTripCompleted && !isStartWindowOpen
                        if (startWindowLocked) {
                            Text(
                                text = "Start Trip becomes available 1 hour before the pickup schedule.",
                                color = TextSecondary,
                                style = MaterialTheme.typography.bodySmall
                            )
                        }

                        if (nextSchedule != null && canStartTrip) {
                            Button(
                                onClick = {
                                    val scheduleId = nextSchedule.scheduleId ?: return@Button
                                    val token = session.sessionToken ?: return@Button

                                    scope.launch {
                                        try {
                                            isStartingTrip = true
                                            tripActionError = null
                                            tripActionSuccess = null

                                            val docId = nextSchedule.docId ?: throw Exception("Schedule ID missing")
                                            db.collection("schedules").document(docId).update(
                                                "status", "accepted",
                                                "trip_phase", "pickup",
                                                "accepted_at", FieldValue.serverTimestamp()
                                            ).await()

                                            acceptedAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
                                            val startTripIntent = Intent(context, LocationService::class.java).apply {
                                                action = LocationService.ACTION_START_TRIP
                                            }
                                            context.startService(startTripIntent)
                                            totalDistanceMetres = 0f
                                            
                                            // Also update driver status
                                            val email = auth.currentUser?.email
                                            if (email != null) {
                                                val driverSnap = db.collection("drivers")
                                                    .whereEqualTo("driver_email", email)
                                                    .get().await()
                                                driverSnap.documents.firstOrNull()?.reference?.update("current_status", "on_schedule")
                                            }
                                            
                                            tripActionSuccess = "Booking accepted! Use the map for directions to pickup."
                                        } catch (e: Exception) {
                                            tripActionError = "Failed to accept booking: ${e.message}"
                                        } finally {
                                            isStartingTrip = false
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !isAnyActionLoading
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

                        if (nextSchedule != null && canMarkPickup) {
                            Button(
                                onClick = {
                                    val scheduleId = nextSchedule.scheduleId ?: return@Button
                                    val token = session.sessionToken ?: return@Button

                                    scope.launch {
                                        try {
                                            isMarkingPickup = true
                                            tripActionError = null
                                            tripActionSuccess = null

                                            val docId = nextSchedule.docId ?: throw Exception("Schedule ID missing")
                                            db.collection("schedules").document(docId).update(
                                                "trip_phase", "dropoff",
                                                "picked_up_at", FieldValue.serverTimestamp()
                                            ).await()
                                            
                                            tripActionSuccess = "Pickup confirmed! Proceed to dropoff location."
                                        } catch (e: Exception) {
                                            tripActionError = "Failed to mark pickup: ${e.message}"
                                        } finally {
                                            isMarkingPickup = false
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !isAnyActionLoading,
                                colors = ButtonDefaults.buttonColors(containerColor = AccentTeal)
                            ) {
                                if (isMarkingPickup) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        color = Color.White,
                                        strokeWidth = 2.dp
                                    )
                                } else {
                                    Text("Pick Up")
                                }
                            }
                        }

                        if (nextSchedule != null && canMarkDropoff) {
                            Button(
                                onClick = {
                                    val scheduleId = nextSchedule.scheduleId ?: return@Button
                                    val token = session.sessionToken ?: return@Button

                                    scope.launch {
                                        try {
                                            isMarkingDropoff = true
                                            tripActionError = null
                                            tripActionSuccess = null

                                            val docId = nextSchedule.docId ?: throw Exception("Schedule ID missing")
                                            val docRef = db.collection("schedules").document(docId)
                                            val doc = docRef.get().await()
                                            val returnReq = doc.getBoolean("return_to_pickup") ?: false
                                            
                                            val nextPhase = if (returnReq) "return_pickup" else "ready_to_complete"
                                            docRef.update(
                                                "trip_phase", nextPhase,
                                                "dropped_off_at", FieldValue.serverTimestamp()
                                            ).await()

                                            if (returnReq) {
                                                tripActionSuccess = "Dropoff confirmed! Return to pickup point."
                                            } else {
                                                tripActionSuccess = "Dropoff confirmed! Trip ready to complete."
                                            }
                                        } catch (e: Exception) {
                                            tripActionError = "Failed to mark dropoff: ${e.message}"
                                        } finally {
                                            isMarkingDropoff = false
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !isAnyActionLoading,
                                colors = ButtonDefaults.buttonColors(containerColor = AccentOrange)
                            ) {
                                if (isMarkingDropoff) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        color = Color.White,
                                        strokeWidth = 2.dp
                                    )
                                } else {
                                    Text("Drop Off")
                                }
                            }
                        }

                        if (nextSchedule != null && canMarkReturnPickup && returnToPickup) {
                            Button(
                                onClick = {
                                    val scheduleId = nextSchedule.scheduleId ?: return@Button
                                    val token = session.sessionToken ?: return@Button

                                    scope.launch {
                                        try {
                                            isMarkingReturnPickup = true
                                            tripActionError = null
                                            tripActionSuccess = null

                                            val docId = nextSchedule.docId ?: throw Exception("Schedule ID missing")
                                            db.collection("schedules").document(docId).update(
                                                "trip_phase", "ready_to_complete",
                                                "return_picked_up_at", FieldValue.serverTimestamp()
                                            ).await()
                                            
                                            tripActionSuccess = "Return pickup confirmed! Please complete the trip."
                                        } catch (e: Exception) {
                                            tripActionError = "Failed to complete return pickup: ${e.message}"
                                        } finally {
                                            isMarkingReturnPickup = false
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !isAnyActionLoading,
                                colors = ButtonDefaults.buttonColors(containerColor = AccentTeal)
                            ) {
                                if (isMarkingReturnPickup) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        color = Color.White,
                                        strokeWidth = 2.dp
                                    )
                                } else {
                                    Text("Pickup")
                                }
                            }
                        }

                        if (nextSchedule != null && canCompleteTrip) {
                            Button(
                                onClick = {
                                    val scheduleId = nextSchedule.scheduleId ?: return@Button
                                    val token = session.sessionToken ?: return@Button

                                    scope.launch {
                                        try {
                                            isCompletingTrip = true
                                            tripActionError = null
                                            tripActionSuccess = null

                                            val docId = nextSchedule.docId ?: throw Exception("Schedule ID missing")
                                            db.collection("schedules").document(docId).update(
                                                "status", "completed",
                                                "trip_phase", "completed",
                                                "completed_at", FieldValue.serverTimestamp()
                                            ).await()
                                            
                                            tripActionSuccess = "Trip completed successfully!"
                                        } catch (e: Exception) {
                                            tripActionError = "Failed to complete trip: ${e.message}"
                                        } finally {
                                            isCompletingTrip = false
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !isAnyActionLoading,
                                colors = ButtonDefaults.buttonColors(containerColor = AccentTeal)
                            ) {
                                if (isCompletingTrip) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        color = Color.White,
                                        strokeWidth = 2.dp
                                    )
                                } else {
                                    Text("Complete Trip")
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
                            .fillMaxWidth(),
                        color = CardBlue,
                        tonalElevation = 8.dp,
                        shadowElevation = 16.dp,
                        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
                    ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                // Left icon: Call Client
                                FilledIconButton(
                                    onClick = {
                                        val phone = nextSchedule.client?.phone ?: nextSchedule.client_phone
                                        if (!phone.isNullOrBlank()) {
                                            val intent = Intent(Intent.ACTION_DIAL, android.net.Uri.parse("tel:$phone"))
                                            context.startActivity(intent)
                                        }
                                    },
                                    modifier = Modifier.size(54.dp),
                                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = AccentTeal),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Icon(Icons.Default.Phone, contentDescription = "Call Client", tint = Color.White)
                                }

                                // Right info: Trip Info
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = nextSchedule.client?.name ?: "Client Assignment",
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
                            
                            when {
                                canAcceptBooking -> {
                                    Button(
                                        onClick = {
                                            val docId = nextSchedule.docId ?: return@Button
                                            scope.launch {
                                                try {
                                                    isStartingTrip = true
                                                    tripActionError = null
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
                                                    tripActionSuccess = "Booking accepted! Click START TRIP when ready to move."
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
                                        else Text("ACCEPT BOOKING", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                    }
                                }
                                canStartTrip -> {
                                    Button(
                                        onClick = {
                                            val docId = nextSchedule.docId ?: return@Button
                                            scope.launch {
                                                try {
                                                    isStartingTrip = true
                                                    tripActionError = null
                                                    db.collection("schedules").document(docId).update(
                                                        "trip_phase", "pickup",
                                                        "started_at", FieldValue.serverTimestamp()
                                                    ).await()

                                                    val startTripIntent = Intent(context, LocationService::class.java).apply {
                                                        action = LocationService.ACTION_START_TRIP
                                                    }
                                                    context.startService(startTripIntent)
                                                    totalDistanceMetres = 0f
                                                    
                                                     // Update driver status
                                                    driverDocRef?.update("current_trip_phase", "pickup")
                                                    
                                                    tripActionSuccess = "Trip started! Use the map for directions to pickup."
                                                } catch (e: Exception) {
                                                    tripActionError = "Failed: ${e.message}"
                                                } finally {
                                                    isStartingTrip = false
                                                }
                                            }
                                        },
                                        modifier = Modifier.fillMaxWidth().height(64.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF8B5CF6)), // Purple
                                        shape = RoundedCornerShape(16.dp),
                                        enabled = !isAnyLoading
                                    ) {
                                        if (isStartingTrip) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                        else Text("START TRIP (EN ROUTE)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                    }
                                }
                                canMarkPickup -> {
                                    Button(
                                        onClick = {
                                            val docId = nextSchedule.docId ?: return@Button
                                            scope.launch {
                                                try {
                                                    isMarkingPickup = true
                                                    tripActionError = null
                                                     db.collection("schedules").document(docId).update(
                                                        "trip_phase", "dropoff",
                                                        "picked_up_at", FieldValue.serverTimestamp()
                                                    ).await()

                                                    pickedUpAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
                                                    
                                                    // Sync to driver doc
                                                    driverDocRef?.update(
                                                        "current_trip_phase", "dropoff",
                                                        "picked_up_at", pickedUpAt
                                                    )
                                                } catch (e: Exception) {
                                                    tripActionError = "Failed: ${e.message}"
                                                } finally {
                                                    isMarkingPickup = false
                                                }
                                            }
                                        },
                                        modifier = Modifier.fillMaxWidth().height(64.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = AccentTeal),
                                        shape = RoundedCornerShape(16.dp),
                                        enabled = !isAnyLoading
                                    ) {
                                        if (isMarkingPickup) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                        else Text("CONFIRM PICKUP", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                    }
                                }
                                canMarkDropoff -> {
                                    Button(
                                        onClick = {
                                            val docId = nextSchedule.docId ?: return@Button
                                            scope.launch {
                                                try {
                                                    isMarkingDropoff = true
                                                    tripActionError = null
                                                    val docRef = db.collection("schedules").document(docId)
                                                    val doc = docRef.get().await()
                                                    val returnReq = doc.getBoolean("return_to_pickup") ?: false
                                                     val nextP = if (returnReq) "return_pickup" else "ready_to_complete"
                                                    docRef.update("trip_phase", nextP, "dropped_off_at", FieldValue.serverTimestamp()).await()
                                                    
                                                    // Sync to driver doc
                                                    driverDocRef?.update("current_trip_phase", nextP)
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
                                        else Text("CONFIRM DROPOFF", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                    }
                                }
                                canMarkReturnPickup && returnToPickup -> {
                                    Button(
                                        onClick = {
                                            val docId = nextSchedule.docId ?: return@Button
                                            scope.launch {
                                                try {
                                                    isMarkingReturnPickup = true
                                                    tripActionError = null
                                                     db.collection("schedules").document(docId).update(
                                                        "trip_phase", "ready_to_complete",
                                                        "return_picked_up_at", FieldValue.serverTimestamp()
                                                    ).await()
                                                    
                                                    // Sync to driver doc
                                                    driverDocRef?.update("current_trip_phase", "ready_to_complete")
                                                } catch (e: Exception) {
                                                    tripActionError = "Failed: ${e.message}"
                                                } finally {
                                                    isMarkingReturnPickup = false
                                                }
                                            }
                                        },
                                        modifier = Modifier.fillMaxWidth().height(64.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = AccentTeal),
                                        shape = RoundedCornerShape(16.dp),
                                        enabled = !isAnyLoading
                                    ) {
                                        if (isMarkingReturnPickup) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                        else Text("CONFIRM RETURN PICKUP", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                    }
                                }
                                canCompleteTrip -> {
                                    Button(
                                        onClick = {
                                            completedAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
                                            showTripTicket = true
                                        },
                                        modifier = Modifier.fillMaxWidth().height(64.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = AccentTeal),
                                        shape = RoundedCornerShape(16.dp),
                                        enabled = !isAnyLoading
                                    ) {
                                        if (isCompletingTrip) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                        else Text("COMPLETE TRIP", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
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
                                Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("Client: ${nextSchedule?.client?.name ?: "Fleet Assign"}", color = Color.White, fontWeight = FontWeight.Bold)
                                    Text("Pickup: ${nextSchedule?.pickup_location?.address}", color = TextSecondary)
                                    Text("Dropoff: ${nextSchedule?.dropoff_location?.address}", color = TextSecondary)
                                }
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
                                                db.collection("schedules").document(docId).update(
                                                    "status", "accepted",
                                                    "trip_phase", "accepted",
                                                    "accepted_at", FieldValue.serverTimestamp()
                                                ).await()

                                                acceptedAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
                                                
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
                                                showNewTaskOverlay = false
                                                tripActionSuccess = "Booking accepted! You can now start the trip when ready."
                                            } catch (e: Exception) {
                                                tripActionError = "Failed: ${e.message}"
                                            } finally {
                                                isStartingTrip = false
                                            }
                                        }
                                    },
                                    modifier = Modifier.weight(1f).height(64.dp),
                                    shape = RoundedCornerShape(16.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = AccentTeal),
                                    enabled = !isStartingTrip
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
                isSubmitting = isCompletingTrip,
                onConfirm = {
                    val docId = nextSchedule?.docId ?: return@TripTicketDialog
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
                                "plate_number" to (session.driver?.plateNumber ?: "")
                            )
                            
                            db.collection("schedules").document(docId).update(tripData as Map<String, Any>).await()
                            
                            // Update driver back to available and increment mileage
                            val currentMileage = session.driver?.currentMileage ?: 0.0
                            val newMileage = currentMileage + (totalDistanceMetres / 1000.0)
                            
                            driverDocRef?.update(
                                "current_status", "available",
                                "current_trip_id", "",
                                "current_trip_phase", "completed",
                                "current_mileage", newMileage
                            )?.await()
                            
                            showTripTicket = false
                        } catch (e: Exception) {
                            tripActionError = "Failed: ${e.message}"
                        } finally {
                            isCompletingTrip = false
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

        // Vehicle Issue Dialog (outside ModalNavigationDrawer but inside Box)
        if (showVehicleIssueDialog) {
            VehicleIssueDialog(
                onDismiss = { showVehicleIssueDialog = false },
                onReport = handleVehicleIssueReport,
                isReporting = isReportingVehicleIssue
            )
    }
}
}
}
