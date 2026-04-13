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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.activity.compose.BackHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontStyle
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
    vehicleUnit: String,
    vehiclePlate: String,
    vehicleColor: String,
    timeOfDeparture: String,
    timeOfArrival: String,
    totalKm: Double,
    odometerStart: Double,
    odometerEnd: Double,
    pickupLocation: String,
    dropoffLocation: String,
    tripPurpose: String,
    routePoints: List<LatLng>,
    isSubmitting: Boolean,
    onConfirm: () -> Unit
) {
    val cameraPositionState = rememberCameraPositionState()

    // Auto-frame bounds to show the entire route
    LaunchedEffect(routePoints) {
        if (routePoints.isNotEmpty()) {
            try {
                val boundsBuilder = LatLngBounds.builder()
                routePoints.forEach { boundsBuilder.include(it) }
                val bounds = boundsBuilder.build()
                cameraPositionState.move(CameraUpdateFactory.newLatLngBounds(bounds, 50))
            } catch (e: Exception) {
                Log.e("TripTicketDialog", "Error setting camera bounds", e)
            }
        }
    }

    AlertDialog(
        onDismissRequest = { },
        title = {
            Text(
                "TRIP TICKET SUMMARY",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = AccentTeal
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Route Map Visualization
                if (routePoints.isNotEmpty()) {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp)
                            .clip(RoundedCornerShape(12.dp)),
                        border = BorderStroke(1.dp, AccentTeal.copy(alpha = 0.3f))
                    ) {
                        GoogleMap(
                            modifier = Modifier.fillMaxSize(),
                            cameraPositionState = cameraPositionState,
                            uiSettings = MapUiSettings(
                                zoomControlsEnabled = false,
                                scrollGesturesEnabled = true,
                                myLocationButtonEnabled = false
                            )
                        ) {
                            Polyline(
                                points = routePoints,
                                color = AccentTeal,
                                width = 10f,
                                jointType = JointType.ROUND,
                                startCap = RoundCap(),
                                endCap = RoundCap()
                            )
                            
                            // Markers for Start and End
                            Marker(
                                state = MarkerState(position = routePoints.first()),
                                title = "Pickup",
                                icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_AZURE)
                            )
                            Marker(
                                state = MarkerState(position = routePoints.last()),
                                title = "Dropoff",
                                icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_ORANGE)
                            )
                        }
                    }
                }

                // Main Info Card
                Card(
                    colors = CardDefaults.cardColors(containerColor = Midnight),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        DetailRow("Driver", driverName)
                        DetailRow("Vehicle Unit", vehicleUnit)
                        DetailRow("Plate Number", vehiclePlate)
                        DetailRow("Unit Color", vehicleColor)
                        DetailRow("Purpose", tripPurpose)
                        Divider(color = Color.White.copy(alpha = 0.1f))
                        DetailRow("Departure", timeOfDeparture)
                        DetailRow("Arrival", timeOfArrival)
                        DetailRow("Distance", "%.2f KM".format(totalKm))
                        Divider(color = Color.White.copy(alpha = 0.1f))
                        DetailRow("Odometer Start", "%.1f KM".format(odometerStart))
                        DetailRow("Odometer End", "%.1f KM".format(odometerEnd))
                        DetailRow("Travelled (Odo)", "%.1f KM".format(odometerEnd - odometerStart))
                    }
                }

                // Locations
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("ROUTE", style = MaterialTheme.typography.labelSmall, color = TextSecondary)
                    
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(modifier = Modifier.size(8.dp).background(AccentBlue, androidx.compose.foundation.shape.CircleShape))
                        Spacer(Modifier.width(12.dp))
                        Text(pickupLocation ?: "Origin", color = Color.White, style = MaterialTheme.typography.bodyMedium)
                    }
                    
                    Box(modifier = Modifier.width(2.dp).height(12.dp).padding(start = 3.dp).background(Color.White.copy(alpha = 0.1f)))
                    
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(modifier = Modifier.size(8.dp).background(AccentOrange, androidx.compose.foundation.shape.CircleShape))
                        Spacer(Modifier.width(12.dp))
                        Text(dropoffLocation ?: "Destination", color = Color.White, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                enabled = !isSubmitting,
                colors = ButtonDefaults.buttonColors(containerColor = AccentTeal)
            ) {
                if (isSubmitting) CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Midnight)
                else Text("CONFIRM & COMPLETE", color = Midnight, fontWeight = FontWeight.Bold)
            }
        },
        containerColor = CardBlue
    )
}

@Composable
fun DetailRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = TextSecondary, style = MaterialTheme.typography.bodySmall)
        Text(value, color = Color.White, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun ReceiptRow(label: String, value: String) {
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
    var liveVehicleUnit by remember { mutableStateOf(session.driver?.vehicleAssigned ?: "Unknown") }
    var liveVehiclePlate by remember { mutableStateOf(session.driver?.plateNumber ?: "Unknown") }
    var liveVehicleColor by remember { mutableStateOf(session.driver?.carColor ?: "Unknown") }
    var accreditedCompanyId = "jettsan"

    // Accident report states
    var showAccidentDialog by remember { mutableStateOf(false) }
    var isReportingAccident by remember { mutableStateOf(false) }
    var incidentActive by remember { mutableStateOf(false) }

    // TNVS Flow States
    var showActiveTripPopup by remember { mutableStateOf(false) }

    // NSCRP States
    var monthlyOTHours by remember { mutableStateOf(0.0) }
    var liveOdometer by remember { mutableStateOf(0.0) }
    var startOdometer by remember { mutableStateOf("") }
    var endOdometer by remember { mutableStateOf("") }
    var lastVehicleMileage by remember { mutableStateOf(0.0) } // Legacy ref for compatibility
    var showOdometerDialog by remember { mutableStateOf(false) }

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
    var lastTimeInObj by remember { mutableStateOf<LocalDateTime?>(null) }
    var isDtrLoading by remember { mutableStateOf(false) }

    var lastTimeInStr by remember { mutableStateOf<String?>(null) }
    var lastAddress by remember { mutableStateOf<String?>(null) }
    var lastTotalHours by remember { mutableStateOf<Double?>(null) }
    var lastIsOvertime by remember { mutableStateOf(false) }
    var dtrCooldown by remember { mutableStateOf(false) }
    var latestAckMessage by remember { mutableStateOf<String?>(null) }

    // Live Metadata Sync (Asset Profile)
    LaunchedEffect(auth.currentUser?.uid) {
        val uid = auth.currentUser?.uid ?: return@LaunchedEffect
        db.collection("drivers").document(uid).addSnapshotListener { snapshot, e ->
            if (e != null) {
                Log.e("DriverDashboard", "Metadata listener failed", e)
                return@addSnapshotListener
            }
            if (snapshot != null && snapshot.exists()) {
                liveDriverName = snapshot.getString("driver_name") ?: liveDriverName
                liveVehicleUnit = snapshot.getString("vehicle_assigned") ?: "Unknown"
                liveVehiclePlate = snapshot.getString("plate_number") ?: "Unknown"
                liveVehicleColor = snapshot.getString("car_color") ?: "Unknown"
                lastVehicleMileage = snapshot.getDouble("current_mileage") ?: lastVehicleMileage
            }
        }
    }
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
            
        // 4. Real-time Odometer & DTR status listener
        db.collection("drivers").document(uid).addSnapshotListener { doc, err ->
            if (doc != null && doc.exists()) {
                liveOdometer = doc.getDouble("current_mileage") ?: 0.0
                lastVehicleMileage = liveOdometer
                isTimedIn = doc.getBoolean("is_currently_timed_in") ?: false
                
                val lastTimeInTS = doc.getTimestamp("last_time_in")
                if (lastTimeInTS != null) {
                    lastTimeInObj = LocalDateTime.ofInstant(lastTimeInTS.toDate().toInstant(), ZoneId.systemDefault())
                }

                incidentActive = doc.getBoolean("incident_active") ?: false
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

    val nextSchedule = feed?.schedules?.filter {
        val status = it.trip_phase?.lowercase() ?: "pending"
        // 1. Relax is_published filter if already accepted/active
        val isExplicitlyAssigned = it.is_published == true || status != "pending"
        
        // 2. 1-hour Window Rule for Pending trips
        val isWithinWindow = if (status == "pending") {
            try {
                val sDate = it.schedule_date ?: ""
                val sTime = it.scheduled_time ?: ""
                val now = LocalDateTime.now()
                val today = now.toLocalDate()
                val targetDate = LocalDate.parse(sDate)
                
                if (!targetDate.isEqual(today)) false
                else {
                    val timeParts = sTime.split(":")
                    val targetTime = LocalTime.of(timeParts[0].toInt(), timeParts[1].toInt())
                    val targetDateTime = LocalDateTime.of(today, targetTime)
                    val diffMinutes = java.time.Duration.between(now, targetDateTime).toMinutes()
                    diffMinutes <= 60 && diffMinutes >= -120 // 1 hour before, up to 2 hours after start (grace period)
                }
            } catch (e: Exception) { true } // Fallback to visible if parsing fails
        } else true
        
        isExplicitlyAssigned && isWithinWindow
    }?.sortedByDescending { 
        when (it.trip_phase?.lowercase()) {
            "accepted", "en_route_pickup", "picked_up", "en_route_dropoff", "dropped_off" -> 100
            "pending" -> 50
            "completed" -> 0
            else -> 10
        }
    }?.firstOrNull()

    val tripPhase = nextSchedule?.trip_phase ?: "pending"

    // Auto-trigger Active Trip Popup when phase becomes 'accepted'
    LaunchedEffect(tripPhase) {
        if (tripPhase == "accepted") {
            showActiveTripPopup = true
        }
    }

    val returnRequired = nextSchedule?.return_to_pickup == true

    // Determine which time to show in "Next Pickup" stat
    val nextPickupTime: String = when {
        returnRequired && (tripPhase == "return_pickup" || tripPhase == "ready_to_complete") -> {
            nextSchedule?.return_pickup_time?.let { time -> formatScheduleTime(time) } ?: "--"
        }

        else -> {
            nextSchedule?.scheduled_time?.let { time -> formatScheduleTime(time) } ?: "--"
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

    // 3-Point Telemetry Coordinates (Actual events)
    var tripStartLat by rememberSaveable { mutableStateOf<Double?>(null) }
    var tripStartLng by rememberSaveable { mutableStateOf<Double?>(null) }
    var tripPickupLat by rememberSaveable { mutableStateOf<Double?>(null) }
    var tripPickupLng by rememberSaveable { mutableStateOf<Double?>(null) }
    var tripDropoffLat by rememberSaveable { mutableStateOf<Double?>(null) }
    var tripDropoffLng by rememberSaveable { mutableStateOf<Double?>(null) }

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

    // Emergency Cancellation states
    var showCancelDialog by remember { mutableStateOf(false) }
    var cancelReason by remember { mutableStateOf("") }
    var isCancelling by remember { mutableStateOf(false) }

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

    // --- System Notification Helper ---
    val logSystemNotification: suspend (String, String, String) -> Unit = { title, message, type ->
        try {
            val uid = auth.currentUser?.uid ?: ""
            val email = auth.currentUser?.email ?: ""
            val notificationData = hashMapOf(
                "title" to title,
                "message" to "$liveDriverName: $message",
                "type" to type,
                "driver_uid" to uid,
                "driver_email" to email,
                "timestamp" to FieldValue.serverTimestamp()
            )
            db.collection("notifications").add(notificationData).await()
        } catch (e: Exception) {
            Log.e("NotificationLog", "Failed to log system notification: ${e.message}")
        }
    }

    // Logic: Auto Time-In Helper to ensure drivers are on-duty before trip actions
    val triggerAutoTimeIn: suspend () -> Unit = {
        if (!isTimedIn) {
            try {
                isDtrLoading = true
                val uid = (FirebaseAuth.getInstance().currentUser?.uid)
                if (uid != null) {
                    val nowVal = LocalDateTime.now()
                    val logData = hashMapOf(
                        "driver_uid" to uid,
                        "driver_email" to (FirebaseAuth.getInstance().currentUser?.email ?: ""),
                        "driver_name" to liveDriverName,
                        "accredited_company_id" to accreditedCompanyId,
                        "action" to "time_in",
                        "timestamp" to FieldValue.serverTimestamp(),
                        "latitude" to currentLatitude,
                        "longitude" to currentLongitude,
                        "device_time" to nowVal.toString(),
                        "meta" to "auto_triggered_by_trip"
                    )
                    FirebaseFirestore.getInstance().collection("dtr_logs").add(logData).await()
                    FirebaseFirestore.getInstance().collection("drivers").document(uid).update(
                        "is_currently_timed_in", true,
                        "last_time_in", FieldValue.serverTimestamp()
                    ).await()
                    
                    isTimedIn = true
                    lastTimeInObj = nowVal
                    Log.d("DriverDashboard", "Auto Time-In success")
                }
            } catch (e: Exception) {
                Log.e("DriverDashboard", "Auto Time-In failed: ${e.message}")
            } finally {
                isDtrLoading = false
            }
        }
    }

    // INITIAL LOCATION LOGIC: Get last known location immediately
    LaunchedEffect(Unit) {
        PresenceManager.updateStatus(context, true)
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
            "accepted", "en_route_pickup", "pending", "assigned" -> {
                val loc = schedule.pickup_location
                if (loc?.latitude != null && loc.latitude != 0.0) "${loc.latitude},${loc.longitude}" else null
            }
            "picked_up", "en_route_dropoff", "dropped_off" -> {
                val loc = schedule.dropoff_location
                if (loc?.latitude != null && loc.latitude != 0.0) "${loc.latitude},${loc.longitude}" else null
            }
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

                // Improvement: Fallback to dashboard's current coordinates if fresh location fetch fails
                val lat = location?.latitude ?: currentLatitude
                val lng = location?.longitude ?: currentLongitude
                
                if (lat == 0.0 && lng == 0.0) {
                    throw Exception("Could not determine location. Please ensure GPS is enabled.")
                }

                val user = auth.currentUser
                val schedule = nextSchedule

                val accidentData = hashMapOf(
                    "driver_email" to user?.email?.lowercase()?.trim(),
                    "driver_uid" to (user?.uid ?: ""), // Add UID for rule matching
                    "schedule_id" to (schedule?.scheduleId ?: 0),
                    "firebase_schedule_id" to schedule?.docId,
                    "latitude" to lat,
                    "longitude" to lng,
                    "description" to "Accident reported via shake detection",
                    "status" to "pending", // CRITICAL: Admin Dashboard filters for status != "acknowledged"
                    "reported_at" to FieldValue.serverTimestamp()
                )

                db.collection("accidents").add(accidentData).await()
                
                // Set incident_active in drivers collection for blinking indicator on Admin Map
                if (user?.uid != null) {
                    db.collection("drivers").document(user.uid).update("incident_active", true).await()
                }
                
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

        onDispose {
            accidentSub.remove()
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
            override fun onReceive(rcvContext: Context?, intent: Intent?) {
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
                                                "actual_route_polyline", routePolyline
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
                            
                            // AUTO RE-ROUTE: If significantly off-track (> 100m) and not currently recalculating
                            // Fixed phase names: en_route_pickup, en_route_dropoff
                            val isActiveRoutingPhase = (tripPhase == "en_route_pickup" || tripPhase == "en_route_dropoff" || tripPhase == "pickup" || tripPhase == "dropoff")
                            
                            if (distToPoly > 100f && !isReRouting && isActiveRoutingPhase) {
                                scope.launch {
                                    isReRouting = true
                                    try {
                                        val dest = if (tripPhase == "en_route_pickup" || tripPhase == "pickup") nextSchedule?.pickup_location else nextSchedule?.dropoff_location
                                        if (dest != null) {
                                            val originStr = "${lat},${lng}"
                                            val destStr = dest.address ?: dest.text ?: ""
                                            val mapsKey = googleMapsApiKey // Use the verified key defined at line 667
                                            val resp = GoogleMapsService.api.getDirections(originStr, destStr, mapsKey)
                                            if (resp.status == "OK" && resp.routes.isNotEmpty()) {
                                                val encoded = resp.routes[0].overviewPolyline.points
                                                activePolylineEncoded = encoded
                                                polylinePoints = GoogleMapsService.decodePolyline(encoded)
                                                showReRoutePrompt = false
                                                Log.d("DriverDashboard", "Automatic re-routing succeeded for phase: $tripPhase")
                                            }
                                        }
                                    } catch (e: Exception) {
                                        Log.e("DriverDashboard", "Auto re-route failed", e)
                                    } finally {
                                        isReRouting = false
                                    }
                                }
                            } else if (distToPoly > 50f && !showReRoutePrompt && isActiveRoutingPhase && !isReRouting) {
                                // Fallback: Show manual prompt if between 50-100m
                                showReRoutePrompt = true
                            } else if (distToPoly <= 30f) {
                                showReRoutePrompt = false
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
                putExtra(LocationService.EXTRA_DRIVER_UID, auth.currentUser?.uid)
                putExtra(LocationService.EXTRA_DRIVER_EMAIL, auth.currentUser?.email?.lowercase()?.trim())
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
        // Polyline Clearing Safeguard
        LaunchedEffect(nextSchedule, tripPhase) {
            if (nextSchedule == null || tripPhase == "completed" || tripPhase == "cancelled") {
                polylinePoints = emptyList()
                activePolylineEncoded = null
                tripETA = ""
                tripDistance = ""
                Log.d("Routing", "Route cleared: No active/published trip.")
            }
        }

        return // Don't render dashboard if GPS is blocked
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
                    // Accident Resolution Banner
                    if (incidentActive) {
                        Card(
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFFF6B6B)),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(16.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Icon(Icons.Default.Warning, contentDescription = null, tint = Color.White)
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("ACCIDENT REPORTED", color = Color.White, fontWeight = FontWeight.Bold)
                                    Text("Blinking indicator is active on Admin map.", color = Color.White.copy(alpha = 0.8f), style = MaterialTheme.typography.bodySmall)
                                }
                                Button(
                                    onClick = {
                                        scope.launch {
                                            try {
                                                val uid = auth.currentUser?.uid ?: return@launch
                                                db.collection("drivers").document(uid).update("incident_active", false).await()
                                                incidentActive = false
                                                tripActionSuccess = "Accident status resolved."
                                            } catch (e: Exception) {
                                                tripActionError = "Failed to resolve: ${e.message}"
                                            }
                                        }
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text("RESOLVE", color = Color(0xFFFF6B6B), fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
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

                        // Business Logic: Must have a schedule today to Time In/Out
                        val now = LocalDateTime.now()
                        val todayStr = now.toLocalDate().toString()
                        val hasSchedulesToday = feed?.schedules?.any { it.schedule_date == todayStr } ?: false
                        val hasStandby = feed?.schedules?.any { it.status?.lowercase() == "standby" || it.passenger_name?.lowercase()?.contains("standby") == true } ?: false
                        
                        val hasActiveTrips = feed?.schedules?.any { 
                            it.trip_phase != "pending" && it.trip_phase != "completed" && it.trip_phase != "assigned" && it.trip_phase != "cancelled"
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
                                                "last_time_in", FieldValue.serverTimestamp(),
                                                "last_updated", FieldValue.serverTimestamp()
                                            ).await()
                                            
                                            isTimedIn = true
                                            lastTimeInObj = nowVal
                                            tripActionSuccess = "Successfully Timed-In!"
                                            
                                            // Admin Event
                                            logSystemNotification("🕒 Driver Clock-In", "is now ON DUTY", "success")
                                        } catch (e: Exception) {
                                            tripActionError = "Time-In Error: ${e.message}"
                                        } finally {
                                            isDtrLoading = false
                                        }
                                    }
                                },
                                modifier = Modifier.weight(1f),
                                enabled = !isTimedIn && !isDtrLoading && (hasSchedulesToday || hasStandby),
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
                                                "total_hours" to "%.2f".format(totalHours).toDouble(),
                                                "is_overtime" to qualifiedForOT,
                                                "device_time" to nowVal.toString()
                                            )
                                            db.collection("dtr_logs").add(logData).await()
                                            db.collection("drivers").document(uid).update(
                                                "is_currently_timed_in", false,
                                                "last_time_out", FieldValue.serverTimestamp(),
                                                "last_updated", FieldValue.serverTimestamp()
                                            ).await()
                                            
                                            isTimedIn = false
                                            tripActionSuccess = if (qualifiedForOT) "Timed-Out with Overtime!" else "Timed-Out Successfully"
                                            
                                            // Admin Event
                                            logSystemNotification("🕓 Driver Clock-Out", "is now OFF DUTY ${if (qualifiedForOT) "(with OT)" else ""}", "warning")
                                        } catch (e: Exception) {
                                            tripActionError = "Time-Out Error: ${e.message}"
                                        } finally {
                                            isDtrLoading = false
                                        }
                                    }
                                },
                                modifier = Modifier.weight(1f),
                                enabled = isTimedIn && !isDtrLoading && !hasActiveTrips && (hasSchedulesToday || hasStandby),
                                colors = ButtonDefaults.buttonColors(containerColor = AccentOrange)
                            ) {
                                Text("TIME OUT", color = Midnight, fontWeight = FontWeight.Bold)
                            }
                        }

                        if (!hasSchedulesToday && !isTimedIn && !hasStandby) {
                            Text(
                                text = "Daily schedule required to Time In.",
                                color = AccentOrange,
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                        if (hasActiveTrips && isTimedIn) {
                            Text(
                                text = "Cannot Time Out with active trips.",
                                color = AccentOrange,
                                style = MaterialTheme.typography.labelSmall
                            )
                        }

                        // Session Info & Warnings
                        if (isTimedIn && lastTimeInObj != null) {
                            val sessionStart = lastTimeInObj!!
                            val isFromPreviousDay = sessionStart.toLocalDate().isBefore(now.toLocalDate())
                            val timeFormatter = DateTimeFormatter.ofPattern("hh:mm a")
                            val dateFormatter = DateTimeFormatter.ofPattern("MMM dd")

                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    text = "Session Started: ${sessionStart.format(timeFormatter)}${if (isFromPreviousDay) " (${sessionStart.format(dateFormatter)})" else ""}",
                                    color = AccentTeal,
                                    style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.Bold
                                )
                                
                                if (isFromPreviousDay) {
                                    Text(
                                        text = "⚠️ You are still Timed-In from a previous day. Please Time Out to reset your session.",
                                        color = AccentOrange,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontStyle = FontStyle.Italic
                                    )
                                }
                            }
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
                        title = "Odometer",
                        value = String.format("%.2f KM", liveOdometer),
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
                                    try {
                                        val builder = LatLngBounds.builder()
                                        polylinePoints.forEach { builder.include(it) }
                                        // Include driver position in the bounds to ensure they are visible
                                        if (currentLatitude != 0.0) {
                                            builder.include(LatLng(currentLatitude, currentLongitude))
                                        }
                                        val bounds = builder.build()
                                        cameraPositionState.animate(
                                            CameraUpdateFactory.newLatLngBounds(bounds, 100),
                                            1000
                                        )
                                    } catch (e: Exception) {
                                        Log.e("DriverDashboard", "Error fitting route bounds", e)
                                    }
                                }
                            }

                            // NSCRP: 3D Navigation Perspective Update
                            LaunchedEffect(currentLatitude, currentLongitude, currentHeading) {
                                if (tripPhase != "idle" && tripPhase != "completed" && currentLatitude != 0.0) {
                                    cameraPositionState.animate(
                                        CameraUpdateFactory.newCameraPosition(
                                            CameraPosition.builder()
                                                .target(driverPos)
                                                .zoom(18f)
                                                .tilt(60f) // Standard 3D Navigation tilt
                                                .bearing(currentHeading) // Auto-rotate with driver heading
                                                .build()
                                        ),
                                        800
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
                                    // High-visibility Vibrant Cyan polyline
                                    Polyline(
                                        points = polylinePoints,
                                        color = Color(0xFF00E5FF),
                                        width = 16f,
                                        startCap = RoundCap(),
                                        endCap = RoundCap(),
                                        jointType = JointType.ROUND
                                    )
                                    
                                    // Start point marker (e.g. the path origin)
                                    val startPos = polylinePoints.first()
                                    Marker(
                                        state = com.google.maps.android.compose.rememberMarkerState(position = startPos),
                                        title = "Trip Start",
                                        icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_AZURE)
                                    )

                                    // Destination marker
                                    val dest = polylinePoints.last()
                                    val isPickup = tripPhase == "pickup" || tripPhase == "en_route_pickup" || tripPhase == "pending"
                                    Marker(
                                        state = com.google.maps.android.compose.rememberMarkerState(position = dest),
                                        title = if (isPickup) "Pickup Location" else "Dropoff Location",
                                        snippet = if (isPickup) "Arrive here for Pickup" else "Customer Destination",
                                        icon = BitmapDescriptorFactory.defaultMarker(if (isPickup) BitmapDescriptorFactory.HUE_ORANGE else BitmapDescriptorFactory.HUE_RED)
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
                                            val pickupAddr: String = nextSchedule?.pickup_location?.address ?: nextSchedule?.pickup_location?.text ?: ""
                                            val dropoffAddr: String = nextSchedule?.dropoff_location?.address ?: nextSchedule?.dropoff_location?.text ?: ""
                                            val address: String = if (tripPhase == "pickup" || tripPhase == "pending") pickupAddr else dropoffAddr
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

                // Return Required stat removed as per user instruction



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
                                                    val dest = if (tripPhase == "en_route_pickup" || tripPhase == "pickup") nextSchedule?.pickup_location else nextSchedule?.dropoff_location
                                                    if (dest != null) {
                                                        val originStr = "${currentLatitude},${currentLongitude}"
                                                        val destStr = dest.address ?: dest.text ?: ""
                                                        val mapsKey = googleMapsApiKey // Use the verified key defined at line 667
                                                        val resp = GoogleMapsService.api.getDirections(originStr, destStr, mapsKey)
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

                        // Legacy Accept button removed from main scroll to prevent confusion.
                        // Acceptance handled in AssignmentsScreen or via New Task Overlay.
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
                                
                                // EMERGENCY CANCEL (Only for accepted/active trips)
                                if (tripPhase != "pending" && tripPhase != "completed") {
                                    OutlinedButton(
                                        onClick = { showCancelDialog = true },
                                        contentPadding = PaddingValues(horizontal = 12.dp),
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFF6B6B)),
                                        border = BorderStroke(1.dp, Color(0xFFFF6B6B).copy(alpha = 0.5f)),
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.height(36.dp)
                                    ) {
                                        Icon(Icons.Default.Cancel, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text("CANCEL", style = MaterialTheme.typography.labelSmall)
                                    }
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
                            
val phase = tripPhase ?: "pending"
                             val isAnyLoading = isStartingTrip || isMarkingPickup || isMarkingDropoff || isMarkingReturnPickup || isCompletingTrip

                             when {
                                 // Step 1: START PICKUP ROUTE
                                 phase == "accepted" -> {
                                     Button(
                                         onClick = {
                                             showOdometerDialog = true
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

                                 // Step 2: PICKED UP
                                 phase == "en_route_pickup" -> {
                                     Button(
                                         onClick = {
                                             val docId = nextSchedule?.docId ?: return@Button
                                             scope.launch {
                                                 try {
                                                     isMarkingPickup = true
                                                     db.collection("schedules").document(docId).update(
                                                         "trip_phase", "picked_up",
                                                         "picked_up_at", FieldValue.serverTimestamp()
                                                     ).await()
                                                     
                                                     pickedUpAt = formatCurrentTime()
                                                     
                                                     // Sync to drivers collection
                                                     val email = auth.currentUser?.email
                                                     if (email != null) {
                                                         val dSnap = db.collection("drivers")
                                                             .whereEqualTo("driver_email", email.lowercase().trim())
                                                             .get().await()
                                                         dSnap.documents.firstOrNull()?.reference?.update(
                                                             "current_status", "Passenger Picked Up",
                                                             "current_trip_phase", "picked_up"
                                                         )
                                                     }
                                                     tripActionSuccess = "Passenger marked as picked up!"
                                                     
                                                     // Admin Event
                                                      logSystemNotification("🚖 Passenger Picked-Up", "has picked up passenger for ticket #${activeTicketId ?: "N/A"}", "info")
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
                                         else Text("I HAVE ARRIVED / PICKUP", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                     }
                                 }

                                 // Step 3: START DROPOFF ROUTE
                                 phase == "picked_up" -> {
                                     Button(
                                         onClick = {
                                             val docId = nextSchedule?.docId ?: return@Button
                                             scope.launch {
                                                 try {
                                                     isStartingTrip = true
                                                     db.collection("schedules").document(docId).update(
                                                         "trip_phase", "en_route_dropoff"
                                                     ).await()

                                                     // Sync to drivers collection
                                                     val email = auth.currentUser?.email
                                                     if (email != null) {
                                                         val dSnap = db.collection("drivers")
                                                             .whereEqualTo("driver_email", email.lowercase().trim())
                                                             .get().await()
                                                         dSnap.documents.firstOrNull()?.reference?.update(
                                                             "current_status", "En Route to Drop-off",
                                                             "current_trip_phase", "en_route_dropoff"
                                                         )
                                                     }
                                                     tripActionSuccess = "Routing to Drop-off point..."
                                                     
                                                     // Admin Event
                                                     logSystemNotification("🛣️ En-Route to Dropoff", "is now heading to the destination", "info")
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
                                         else Text("START DROP-OFF ROUTE", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                     }
                                 }

                                 // Step 4: DROPPED OFF
                                 phase == "en_route_dropoff" -> {
                                     Button(
                                         onClick = {
                                             val docId = nextSchedule?.docId ?: return@Button
                                             scope.launch {
                                                 try {
                                                     isMarkingDropoff = true
                                                     db.collection("schedules").document(docId).update(
                                                         "trip_phase", "dropped_off",
                                                         "dropped_off_at", FieldValue.serverTimestamp()
                                                     ).await()

                                                     // Sync to drivers collection
                                                     val email = auth.currentUser?.email
                                                     if (email != null) {
                                                         val dSnap = db.collection("drivers")
                                                             .whereEqualTo("driver_email", email.lowercase().trim())
                                                             .get().await()
                                                         dSnap.documents.firstOrNull()?.reference?.update(
                                                             "current_status", "Passenger Dropped Off",
                                                             "current_trip_phase", "dropped_off"
                                                         )
                                                     }
                                                     tripActionSuccess = "Arrived at destination!"
                                                     
                                                     // Admin Event
                                                     logSystemNotification("🏁 Arrival at Destination", "has arrived at the drop-off point", "success")
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
                                         else Text("COMPLETE DROP-OFF", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                     }
                                 }

                                 // Step 5: FINALIZE
                                 phase == "dropped_off" -> {
                                     Button(
                                         onClick = {
                                             // Calculate end odometer based on start + distance
                                             // and allow manual adjustment in the next step
                                             val calculatedDistance = totalDistanceMetres / 1000.0
                                             val startOdo = nextSchedule?.odometer_start ?: lastVehicleMileage
                                             endOdometerValue = startOdo + calculatedDistance
                                             showOdometerDialog = true
                                         },
                                         modifier = Modifier.fillMaxWidth().height(64.dp),
                                         colors = ButtonDefaults.buttonColors(containerColor = AccentTeal),
                                         shape = RoundedCornerShape(16.dp),
                                         enabled = !isAnyLoading
                                     ) {
                                         Text("FINALIZE & COMPLETE TRIP", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
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

                                    // Simplified Single Point Location
                                    val pickup = nextSchedule?.pickup_location?.address ?: nextSchedule?.pickup_location?.text ?: "Pending"
                                    val dropoff = nextSchedule?.dropoff_location?.address ?: nextSchedule?.dropoff_location?.text ?: "Pending"
                                    
                                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text("TRIP ROUTE:", color = TextSecondary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                        Text("Pickup: $pickup", color = Color.White, style = MaterialTheme.typography.bodySmall)
                                        Text("Dropoff: $dropoff", color = Color.White, style = MaterialTheme.typography.bodySmall)
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
                                                    putExtra(LocationService.EXTRA_DRIVER_UID, auth.currentUser?.uid)
                                                    putExtra(LocationService.EXTRA_DRIVER_EMAIL, auth.currentUser?.email?.lowercase()?.trim() ?: "")
                                                }
                                                context.startService(startTripIntent)
                                                db.collection("schedules").document(docId).update(
                                                    "status", "accepted",
                                                    "trip_phase", "accepted",
                                                    "accepted_at", FieldValue.serverTimestamp()
                                                ).await()

                                                acceptedAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
                                                
                                                // Admin Event
                                                logSystemNotification("📋 Job Accepted", "has accepted an assignment for ${nextSchedule?.passenger_name ?: "Passenger"}", "success")
                                                
                                                // Create initial real-time Trip Ticket
                                                val initialTicketData = hashMapOf(
                                                    "schedule_id" to docId,
                                                    "driver_uid" to (auth.currentUser?.uid ?: ""),
                                                    "driver_email" to (auth.currentUser?.email?.lowercase()?.trim() ?: ""),
                                                    "driver_name" to liveDriverName,
                                                    "passenger_name" to (nextSchedule?.passenger_name ?: nextSchedule?.client_name ?: "Unknown"),
                                                    "client_name" to (nextSchedule?.client_name ?: "Jettsan"),
                                                    "vehicle_plate" to (session.driver?.plateNumber ?: ""),
                                                    "pickup_location" to (nextSchedule?.pickup_location?.address ?: nextSchedule?.pickup_location?.text ?: "Unknown"),
                                                    "dropoff_location" to (nextSchedule?.dropoff_location?.address ?: nextSchedule?.dropoff_location?.text ?: "Unknown"),
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

                // TNVS Active Trip Auto-Popup
                androidx.compose.animation.AnimatedVisibility(
                    visible = showActiveTripPopup && nextSchedule != null && tripPhase == "accepted",
                    enter = androidx.compose.animation.fadeIn() + androidx.compose.animation.expandVertically(),
                    exit = androidx.compose.animation.fadeOut() + androidx.compose.animation.shrinkVertically(),
                    modifier = Modifier.fillMaxSize()
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.9f))
                            .padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = CardBlue),
                            shape = RoundedCornerShape(24.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(20.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.DirectionsCar,
                                    contentDescription = null,
                                    tint = AccentTeal,
                                    modifier = Modifier.size(64.dp)
                                )
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("TRIP READY", color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                                    Text("Assignment accepted. Start route now?", color = TextSecondary, style = MaterialTheme.typography.bodyMedium)
                                }
                                
                                val pickup = nextSchedule?.pickup_location?.address ?: nextSchedule?.pickup_location?.text ?: "Unknown"
                                Card(
                                    colors = CardDefaults.cardColors(containerColor = Midnight.copy(alpha = 0.5f)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(modifier = Modifier.padding(16.dp)) {
                                        Text("PICKUP AT:", color = TextSecondary, style = MaterialTheme.typography.labelSmall)
                                        Text(pickup, color = Color.White, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                                    }
                                }

                                Button(
                                    onClick = {
                                        showActiveTripPopup = false
                                        // Trigger the "START PICKUP ROUTE" logic
                                        val docId = nextSchedule?.docId ?: return@Button
                                        scope.launch {
                                            try {
                                                isStartingTrip = true
                                                db.collection("schedules").document(docId).update(
                                                    "trip_phase", "en_route_pickup",
                                                    "started_at", FieldValue.serverTimestamp()
                                                ).await()
                                                
                                                val startTripIntent = Intent(context, LocationService::class.java).apply {
                                                    action = LocationService.ACTION_START_TRIP
                                                    putExtra(LocationService.EXTRA_DRIVER_UID, auth.currentUser?.uid)
                                                    putExtra(LocationService.EXTRA_DRIVER_EMAIL, auth.currentUser?.email?.lowercase()?.trim() ?: "")
                                                    putExtra(LocationService.EXTRA_SCHEDULE_ID, docId)
                                                }
                                                context.startService(startTripIntent)
                                                
                                                val uid = auth.currentUser?.uid
                                                if (uid != null) {
                                                    db.collection("drivers").document(uid).update(
                                                        "current_status", "En Route to Pickup",
                                                        "current_trip_phase", "en_route_pickup"
                                                    ).await()
                                                }
                                            } catch (e: Exception) {
                                                tripActionError = "Navigation failed: ${e.message}"
                                            } finally {
                                                isStartingTrip = false
                                            }
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth().height(64.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = AccentTeal),
                                    shape = RoundedCornerShape(16.dp)
                                ) {
                                    Text("START PICKUP ROUTE", color = Midnight, fontWeight = FontWeight.Bold)
                                }

                                TextButton(onClick = { showActiveTripPopup = false }) {
                                    Text("LATER", color = TextSecondary)
                                }
                            }
                        }
                    }
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
            val isStarting = tripPhase == "moving_to_pickup" || tripPhase == "accepted" || tripPhase == "en_route_pickup"
            OdometerDialog(
                lastMileage = lastVehicleMileage,
                defaultValue = if (!isStarting) endOdometerValue else null,
                isStarting = isStarting,
                onConfirm = { mileage ->
                    showOdometerDialog = false
                    val docId = nextSchedule?.docId ?: return@OdometerDialog
                    val uid = auth.currentUser?.uid ?: return@OdometerDialog
                    scope.launch {
                        try {
                            isMarkingPickup = true
                            // Automatic time-in safeguard
                            triggerAutoTimeIn()
                            
                            // 2. Update Schedule with Odometer
                            if (isStarting) {
                                val timestampStr = formatCurrentTime()
                                val phaseUpdate = if (tripPhase == "accepted") "en_route_pickup" else "picked_up"
                                
                                val updateData = mutableMapOf<String, Any>(
                                    "odometer_start" to mileage,
                                    "trip_phase" to phaseUpdate,
                                    "status" to "accepted"
                                )
                                
                                if (tripPhase == "accepted") {
                                    updateData["started_at"] = FieldValue.serverTimestamp()
                                    // Also start tracking service here
                                    val startTripIntent = Intent(context, LocationService::class.java).apply {
                                        action = LocationService.ACTION_START_TRIP
                                        putExtra(LocationService.EXTRA_DRIVER_UID, auth.currentUser?.uid)
                                        putExtra(LocationService.EXTRA_DRIVER_EMAIL, auth.currentUser?.email?.lowercase()?.trim() ?: "")
                                        putExtra(LocationService.EXTRA_SCHEDULE_ID, nextSchedule?.docId ?: "")
                                    }
                                    context.startService(startTripIntent)
                                    totalDistanceMetres = 0f
                                    actualRoutePoints.clear()
                                } else {
                                    updateData["picked_up_at"] = FieldValue.serverTimestamp()
                                    pickedUpAt = timestampStr
                                }

                                db.collection("schedules").document(docId).update(updateData).await()
                                
                                // 3. Update Driver's Current Mileage & Status
                                val driverUpdate = mutableMapOf<String, Any>(
                                    "current_mileage" to mileage,
                                    "current_trip_phase" to phaseUpdate
                                )
                                if (tripPhase == "accepted") {
                                    driverUpdate["current_status"] = "En Route to Pickup"
                                } else {
                                    driverUpdate["current_status"] = "Passenger Picked Up"
                                }
                                
                                db.collection("drivers").document(uid).update(driverUpdate).await()
                                tripActionSuccess = if (tripPhase == "accepted") "Trip started! Routing to pickup..." else "Passenger picked up! Routing to destination..."
                                
                                // Admin Event
                                if (tripPhase == "accepted") {
                                    logSystemNotification("🚀 Trip Started", "is now en-route to pickup location", "info")
                                }
                            } else {
                                // End odometer flow
                                endOdometerValue = mileage
                                completedAt = formatCurrentTime()
                                showTripTicket = true
                            }
                            lastVehicleMileage = mileage
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


        // NSCRP: Final Trip Ticket (Summary + Driver Verification)
        if (showTripTicket) {
            val dId = nextSchedule?.docId ?: ""
            val vModel = session.driver?.vehicleAssigned ?: "Vehicle"
            val vColor = session.driver?.carColor ?: ""
            val vDetails = if (vColor.isNotEmpty()) "$vModel ($vColor)" else vModel
            
            TripTicketDialog(
                driverName = liveDriverName,
                vehicleUnit = liveVehicleUnit,
                vehiclePlate = liveVehiclePlate,
                vehicleColor = liveVehicleColor,
                timeOfDeparture = pickedUpAt ?: nextSchedule?.scheduled_time ?: "--:--",
                timeOfArrival = completedAt ?: formatCurrentTime(),
                totalKm = endOdometerValue - (nextSchedule?.odometer_start ?: 0.0),
                odometerStart = nextSchedule?.odometer_start ?: 0.0,
                odometerEnd = endOdometerValue,
                pickupLocation = nextSchedule?.pickup_location?.address ?: nextSchedule?.pickup_location?.text ?: "Start",
                dropoffLocation = nextSchedule?.dropoff_location?.address ?: nextSchedule?.dropoff_location?.text ?: "End",
                tripPurpose = nextSchedule?.trip_purpose ?: "OFFICIAL",
                routePoints = actualRoutePoints,
                isSubmitting = isCompletingTrip,
                onConfirm = {
                    scope.launch {
                        try {
                            isCompletingTrip = true
                            // Automatic time-in safeguard before final writes
                            triggerAutoTimeIn()
                            
                            // Final updates to schedule
                            db.collection("schedules").document(dId).update(
                                "odometer_end", endOdometerValue,
                                "trip_phase", "completed",
                                "status", "completed",
                                "actual_route_polyline", GoogleMapsService.encodePolyline(actualRoutePoints),
                                "completed_at", FieldValue.serverTimestamp()
                            ).await()
                            
                            // Admin Event
                            logSystemNotification("✅ Trip Completed", "has successfully finalized the trip for job #${dId.takeLast(6)}", "success")
                            
                            // Save ticket data and update driver status
                            // Logic moved here for direct control
                            val vModel = session.driver?.vehicleAssigned ?: "Vehicle"
                            val vColor = session.driver?.carColor ?: ""
                            val vDetails = if (vColor.isNotEmpty()) "$vModel ($vColor)" else vModel

                            val ticketData = hashMapOf(
                                "schedule_id" to dId,
                                "driver_uid" to (auth.currentUser?.uid ?: ""),
                                "driver_email" to (auth.currentUser?.email?.lowercase()?.trim() ?: ""),
                                "driver_name" to liveDriverName,
                                "passenger_name" to (nextSchedule?.passenger_name ?: nextSchedule?.client_name ?: "Unknown"),
                                "client_name" to (nextSchedule?.client_name ?: "Jettsan"),
                                "vehicle_plate" to liveVehiclePlate,
                                "vehicle_unit" to liveVehicleUnit,
                                "vehicle_color" to liveVehicleColor,
                                "vehicle_details" to vDetails, // Keep for legacy
                                "pickup_location" to (nextSchedule?.pickup_location?.address ?: nextSchedule?.pickup_location?.text ?: "Unknown"),
                                "dropoff_location" to (nextSchedule?.dropoff_location?.address ?: nextSchedule?.dropoff_location?.text ?: "Unknown"),
                                "time_of_departure" to (pickedUpAt ?: nextSchedule?.scheduled_time ?: ""),
                                "time_of_arrival" to (completedAt ?: ""),
                                "total_km" to (endOdometerValue - (nextSchedule?.odometer_start ?: 0.0)),
                                "total_km_travelled" to (endOdometerValue - (nextSchedule?.odometer_start ?: 0.0)),
                                "odometer_start" to (nextSchedule?.odometer_start ?: 0.0),
                                "odometer_end" to endOdometerValue,
                                "actual_route_polyline" to GoogleMapsService.encodePolyline(actualRoutePoints),
                                "route_polyline" to GoogleMapsService.encodePolyline(actualRoutePoints),
                                "recommended_route_polyline" to (nextSchedule?.route_polyline ?: ""),
                                "status" to "completed",
                                "start_latitude" to (tripStartLat ?: (if (actualRoutePoints.isNotEmpty()) actualRoutePoints.first().latitude else 0.0)),
                                "start_longitude" to (tripStartLng ?: (if (actualRoutePoints.isNotEmpty()) actualRoutePoints.first().longitude else 0.0)),
                                "pickup_latitude" to (tripPickupLat ?: 0.0),
                                "pickup_longitude" to (tripPickupLng ?: 0.0),
                                "dropoff_latitude" to (tripDropoffLat ?: (if (actualRoutePoints.isNotEmpty()) actualRoutePoints.last().latitude else 0.0)),
                                "dropoff_longitude" to (tripDropoffLng ?: (if (actualRoutePoints.isNotEmpty()) actualRoutePoints.last().longitude else 0.0)),
                                "trip_purpose" to (nextSchedule?.trip_purpose ?: "OFFICIAL"),
                                "created_at" to FieldValue.serverTimestamp(), // Fallback if recovered
                                "completed_at" to FieldValue.serverTimestamp()
                            )
                            
                            // Use deterministic ID to prevent duplication
                            val finalTicketId = "TKT_${dId}"
                            
                            db.collection("trip_tickets").document(finalTicketId).set(ticketData).await()
                            
                            // Update driver capacity/status
                            val uid = auth.currentUser?.uid
                            if (uid != null) {
                                db.collection("drivers").document(uid).update(
                                    "current_status", "available",
                                    "current_trip_id", "",
                                    "current_trip_phase", "completed",
                                    "current_mileage", endOdometerValue,
                                    "active_ticket_id", "",
                                    "last_updated", FieldValue.serverTimestamp()
                                ).await()
                            }

                            showTripTicket = false
                            tripActionSuccess = "Trip successfully finalized!"
                            totalDistanceMetres = 0f
                            actualRoutePoints.clear()
                            activeTicketId = null
                        } catch (e: Exception) {
                            tripActionError = "Finalization Failed: ${e.message}"
                        } finally {
                            isCompletingTrip = false
                        }
                    }
                }
            )
        }

        if (showCancelDialog) {
            EmergencyCancellationDialog(
                onConfirm = { reason ->
                    scope.launch {
                        try {
                            isCancelling = true
                            // Automatic time-in safeguard before cancellation writes
                            triggerAutoTimeIn()
                            
                            val dId = nextSchedule?.docId ?: throw Exception("Trip ID missing")
                            
                            // 1. Update Schedule
                            db.collection("schedules").document(dId).update(
                                "status", "cancelled",
                                "trip_phase", "completed",
                                "cancellation_reason", reason,
                                "cancelled_at", FieldValue.serverTimestamp()
                            ).await()

                            // 2. Update Trip Ticket if exists (or create one for record)
                            val finalTicketId = activeTicketId ?: "TKT_${dId}_${System.currentTimeMillis()}"
                            db.collection("trip_tickets").document(finalTicketId).set(hashMapOf(
                                "status" to "cancelled",
                                "cancellation_reason" to reason,
                                "created_at" to FieldValue.serverTimestamp(), // Fallback if recovered
                                "cancelled_at" to FieldValue.serverTimestamp(),
                                "schedule_id" to dId,
                                "driver_uid" to (auth.currentUser?.uid ?: ""),
                                "driver_email" to (auth.currentUser?.email?.lowercase()?.trim() ?: "")
                            ), SetOptions.merge()).await()

                            // 3. Update Driver Status
                            val email = auth.currentUser?.email
                            if (email != null) {
                                val dSnap = db.collection("drivers")
                                    .whereEqualTo("driver_email", email.lowercase().trim())
                                    .get().await()
                                dSnap.documents.firstOrNull()?.reference?.update(
                                    "current_status", "available",
                                    "current_trip_id", "",
                                    "current_trip_phase", "completed",
                                    "active_ticket_id", "",
                                    "last_updated", FieldValue.serverTimestamp()
                                )?.await()
                            }

                            showCancelDialog = false
                            
                            // Admin Event
                            logSystemNotification("🛑 Trip Cancelled", "has CANCELLED the trip. Reason: $cancelReason", "danger")
                            tripActionSuccess = "Trip cancelled and reported."
                            activeTicketId = null
                            actualRoutePoints.clear()
                        } catch (e: Exception) {
                            tripActionError = "Cancellation Failed: ${e.message}"
                        } finally {
                            isCancelling = false
                        }
                    }
                },
                onDismiss = { showCancelDialog = false }
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
}
}
}

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
    defaultValue: Double? = null,
    isStarting: Boolean,
    onConfirm: (Double) -> Unit,
    onDismiss: () -> Unit
) {
    var mileageStr by remember { mutableStateOf(defaultValue?.let { "%.1f".format(it) } ?: "") }
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
fun EmergencyCancellationDialog(
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var reason by remember { mutableStateOf("") }
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
                Icon(
                    Icons.Default.Warning,
                    contentDescription = null,
                    tint = Color(0xFFFF6B6B),
                    modifier = androidx.compose.ui.Modifier.size(48.dp)
                )

                Text(
                    "EMERGENCY CANCELLATION",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    textAlign = TextAlign.Center
                )
                
                Text(
                    "Please provide a valid reason for canceling this trip. This will be reviewed by the administration.",
                    color = TextSecondary,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center
                )

                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it; if(it.isNotBlank()) error = null },
                    label = { Text("Reason for Cancellation") },
                    placeholder = { Text("e.g., Vehicle breakdown, Medical emergency") },
                    modifier = androidx.compose.ui.Modifier.fillMaxWidth().height(120.dp),
                    maxLines = 5,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = Color(0xFFFF6B6B),
                        cursorColor = Color(0xFFFF6B6B)
                    )
                )

                if (error != null) {
                    Text(error!!, color = Color(0xFFFF6B6B), style = MaterialTheme.typography.bodySmall)
                }

                Row(
                    modifier = androidx.compose.ui.Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    TextButton(
                        onClick = onDismiss,
                        modifier = androidx.compose.ui.Modifier.weight(1f).height(56.dp)
                    ) {
                        Text("GO BACK", color = TextSecondary)
                    }

                    Button(
                        onClick = {
                            if (reason.trim().length < 5) {
                                error = "Please provide a more detailed reason (min 5 chars)"
                            } else {
                                onConfirm(reason.trim())
                            }
                        },
                        modifier = androidx.compose.ui.Modifier.weight(1f).height(56.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF6B6B))
                    ) {
                        Text("CANCEL TRIP", fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
            }
        }
    }
}

@RequiresApi(Build.VERSION_CODES.O)
fun formatCurrentTime(): String {
    return java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("hh:mm a"))
}
