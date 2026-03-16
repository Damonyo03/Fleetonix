package com.prototype.fleetonix

import android.Manifest
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDrawerState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.prototype.fleetonix.ui.theme.AccentBlue
import com.prototype.fleetonix.ui.theme.AccentOrange
import com.prototype.fleetonix.ui.theme.AccentTeal
import com.prototype.fleetonix.ui.theme.CardBlue
import com.prototype.fleetonix.ui.theme.Midnight
import com.prototype.fleetonix.ui.theme.TextPrimary
import com.prototype.fleetonix.ui.theme.TextSecondary
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FieldValue
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.android.gms.maps.model.PolylineOptions
import com.google.maps.android.compose.Polyline
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

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
    val tripPhase = nextSchedule?.tripPhase ?: "pending"
    val returnRequired = nextSchedule?.returnToPickup == true

    // Determine which time to show in "Next Pickup" stat
    val nextPickupTime = when {
        returnRequired && (tripPhase == "return_pickup" || tripPhase == "ready_to_complete") -> {
            nextSchedule?.returnPickupTime?.let { formatScheduleTime(it) } ?: "--"
        }

        else -> {
            nextSchedule?.scheduledTime?.let { formatScheduleTime(it) } ?: "--"
        }
    }
    val stopsCount = feed?.schedules?.size ?: 0
    val scheduledDateTime = remember(nextSchedule?.scheduledDate, nextSchedule?.scheduledTime) {
        parseScheduleDateTime(nextSchedule?.scheduledDate, nextSchedule?.scheduledTime)
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

    val returnToPickup = nextSchedule?.returnToPickup == true

    // Button visibility logic
    val isTripCompleted = tripPhase == "completed"
    val canStartTrip = tripPhase == "pending" && !isTripCompleted && isStartWindowOpen
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
            "pickup", "pending" -> if (schedule.pickup?.latitude != null) "${schedule.pickup.latitude},${schedule.pickup.longitude}" else null
            "dropoff" -> if (schedule.dropoff?.latitude != null) "${schedule.dropoff.latitude},${schedule.dropoff.longitude}" else null
            else -> null
        }

        Log.d("Routing", "Origin: $origin, Destination: $destination")

        if (destination != null) {
            try {
                val response = GoogleMapsService.api.getDirections(origin, destination, googleMapsApiKey)
                Log.d("Routing", "API Status: ${response.status}")
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
    LaunchedEffect(feed?.schedules?.firstOrNull()?.scheduleId, feed?.schedules?.firstOrNull()?.tripPhase) {
        val activeSchedule = feed?.schedules?.firstOrNull()
        if (activeSchedule != null) {
            // Keep schedule_id active for all trip phases (pending, pickup, dropoff, return_pickup, ready_to_complete)
            // Only mark as completed when trip_phase is "completed"
            if (activeSchedule.tripPhase != "completed") {
                currentScheduleId = activeSchedule.scheduleId
                Log.d("LocationTracking", "Schedule ID updated: $currentScheduleId (phase: ${activeSchedule.tripPhase})")
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

    // Start location tracking
    LaunchedEffect(session.sessionToken) {
        val locationClient = LocationServices.getFusedLocationProviderClient(context)
        isTrackingActive = true

        scope.launch {
            // Find the driver document once to minimize redundant queries
            var driverDocRef = try {
                val driverSnap = db.collection("drivers")
                    .whereEqualTo("driver_email", auth.currentUser?.email)
                    .get()
                    .await()
                driverSnap.documents.firstOrNull()?.reference
            } catch (e: Exception) {
                Log.e("LocationTracking", "Error finding driver doc", e)
                null
            }

            while (isTrackingActive) {
                try {
                    if (hasLocationPermission(context)) {
                        val locationRequest =
                            LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10000)
                                .setWaitForAccurateLocation(true)
                                .setMinUpdateIntervalMillis(5000)
                                .setMaxUpdateDelayMillis(10000)
                                .build()

                        val cancellationTokenSource = CancellationTokenSource()
                        val location = try {
                            locationClient.getCurrentLocation(
                                locationRequest.priority,
                                cancellationTokenSource.token
                            ).await()
                        } catch (securityException: SecurityException) {
                            Log.e("LocationTracking", "Permission denied: ${securityException.message}")
                            null
                        }

                        location?.let { loc ->
                            val lat = loc.latitude
                            val lng = loc.longitude
                            val accuracy = loc.accuracy
                            
                            // Update local state for UI
                            currentLatitude = lat
                            currentLongitude = lng
                            currentSpeed = loc.speed
                            currentAccuracy = loc.accuracy

                            // Basic validation for Philippines region
                            val isInPhilippines = (lat >= 4 && lat <= 21) && (lng >= 116 && lng <= 127)
                            if (isInPhilippines || accuracy <= 50) {
                                val locData = hashMapOf(
                                    "current_latitude" to lat,
                                    "current_longitude" to lng,
                                    "current_speed" to loc.speed,
                                    "current_heading" to loc.bearing,
                                    "current_accuracy" to loc.accuracy,
                                    "current_route_polyline" to (activePolylineEncoded ?: ""),
                                    "trip_eta" to tripETA,
                                    "trip_distance" to tripDistance,
                                    "last_updated" to FieldValue.serverTimestamp()
                                )
                                
                                if (driverDocRef != null) {
                                    driverDocRef?.update(locData as Map<String, Any>)
                                } else {
                                    // Retry finding doc if we lost it
                                    val driverSnap = db.collection("drivers")
                                        .whereEqualTo("driver_email", auth.currentUser?.email)
                                        .get()
                                        .await()
                                    driverDocRef = driverSnap.documents.firstOrNull()?.reference
                                    driverDocRef?.update(locData as Map<String, Any>)
                                }
                                Log.d("LocationTracking", "Updated: $lat, $lng (Accuracy: ${accuracy}m)")
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e("LocationTracking", "Error in loop: ${e.message}")
                }
                delay(10000) // 10s interval
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

                            GoogleMap(
                                modifier = Modifier.fillMaxSize(),
                                cameraPositionState = cameraPositionState,
                                properties = MapProperties(
                                    isMyLocationEnabled = currentLatitude != 0.0,
                                    isTrafficEnabled = true
                                ),
                                uiSettings = MapUiSettings(
                                    myLocationButtonEnabled = true,
                                    zoomControlsEnabled = true,
                                    compassEnabled = true,
                                    mapToolbarEnabled = true
                                )
                            ) {
                                Marker(
                                    state = MarkerState(position = driverPos),
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
                                        state = MarkerState(position = dest),
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
                                                nextSchedule?.pickup?.address ?: "" 
                                            else 
                                                nextSchedule?.dropoff?.address ?: ""
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

                if (nextSchedule != null) {
                    val assignmentTitle =
                        if (tripPhase == "pending") "Upcoming Assignment" else "Task Today"
                    Text(assignmentTitle, color = TextSecondary)
                    Card(
                        colors = CardDefaults.cardColors(containerColor = CardBlue),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                "Client: ${nextSchedule.client?.company ?: nextSchedule.client?.name ?: "N/A"}",
                                color = TextPrimary
                            )
                            Text(
                                "Pickup: ${nextSchedule.pickup?.address ?: "N/A"}",
                                color = TextSecondary,
                                style = MaterialTheme.typography.bodySmall
                            )
                            Text(
                                "Dropoff: ${nextSchedule.dropoff?.address ?: "N/A"}",
                                color = TextSecondary,
                                style = MaterialTheme.typography.bodySmall
                            )
                            if (nextSchedule.passengers != null) {
                                Text(
                                    "Passengers: ${nextSchedule.passengers}",
                                    color = TextSecondary,
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                            val instructions =
                                nextSchedule.specialInstructions?.takeIf { it.isNotBlank() }
                            if (instructions != null) {
                                Text(
                                    "Special Instructions",
                                    color = TextPrimary,
                                    fontWeight = FontWeight.SemiBold,
                                    style = MaterialTheme.typography.bodySmall
                                )
                                Text(
                                    instructions,
                                    color = TextSecondary,
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }

                    // Location Information
                    Text("Location Information", color = TextSecondary)
                    Card(
                        colors = CardDefaults.cardColors(containerColor = CardBlue),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            val showPickupLocation = when (tripPhase) {
                                "pending", "pickup", "return_pickup" -> true
                                "dropoff" -> false
                                "ready_to_complete" -> returnToPickup
                                "completed" -> false
                                else -> true
                            }
                            val targetLat =
                                if (showPickupLocation) nextSchedule.pickup?.latitude else nextSchedule.dropoff?.latitude
                            val targetLon =
                                if (showPickupLocation) nextSchedule.pickup?.longitude else nextSchedule.dropoff?.longitude
                            val targetAddress =
                                if (showPickupLocation) nextSchedule.pickup?.address else nextSchedule.dropoff?.address
                            val locationLabel =
                                if (showPickupLocation) "Pickup Location" else "Dropoff Location"

                            Text(
                                locationLabel,
                                color = TextPrimary,
                                style = MaterialTheme.typography.titleSmall
                            )
                            Text(
                                targetAddress ?: "N/A",
                                color = TextSecondary,
                                style = MaterialTheme.typography.bodyMedium
                            )

                            if (targetLat != null && targetLon != null && targetLat != 0.0 && targetLon != 0.0) {
                                Button(
                                    onClick = {
                                        openExternalMaps(
                                            context,
                                            targetLat,
                                            targetLon,
                                            targetAddress ?: ""
                                        )
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = ButtonDefaults.buttonColors(containerColor = AccentBlue)
                                ) {
                                    Text(
                                        "Open External Maps",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                }
                            } else {
                                Text(
                                    "Location coordinates not available",
                                    color = TextSecondary,
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }
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

                        Button(
                            onClick = onRefresh,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !isFeedLoading
                        ) {
                            if (isFeedLoading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Text("Refresh Assignments")
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
                        Column(
                            modifier = Modifier
                                .padding(20.dp)
                                .navigationBarsPadding(),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
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
                                canStartTrip -> {
                                    Button(
                                        onClick = {
                                            val docId = nextSchedule.docId ?: return@Button
                                            scope.launch {
                                                try {
                                                    isStartingTrip = true
                                                    tripActionError = null
                                                    db.collection("schedules").document(docId).update(
                                                        "status", "accepted",
                                                        "trip_phase", "pickup",
                                                        "accepted_at", FieldValue.serverTimestamp()
                                                    ).await()
                                                    
                                                    // Update driver status
                                                    val email = auth.currentUser?.email
                                                    if (email != null) {
                                                        val driverSnap = db.collection("drivers")
                                                            .whereEqualTo("driver_email", email)
                                                            .get().await()
                                                        driverSnap.documents.firstOrNull()?.reference?.update("current_status", "on_schedule")
                                                    }
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
                                            val docId = nextSchedule.docId ?: return@Button
                                            scope.launch {
                                                try {
                                                    isCompletingTrip = true
                                                    tripActionError = null
                                                    db.collection("schedules").document(docId).update(
                                                        "status", "completed",
                                                        "trip_phase", "completed",
                                                        "completed_at", FieldValue.serverTimestamp()
                                                    ).await()
                                                } catch (e: Exception) {
                                                    tripActionError = "Failed: ${e.message}"
                                                } finally {
                                                    isCompletingTrip = false
                                                }
                                            }
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
                                    Text("Pickup: ${nextSchedule?.pickup?.address}", color = TextSecondary)
                                    Text("Dropoff: ${nextSchedule?.dropoff?.address}", color = TextSecondary)
                                }
                            }
                            Button(
                                onClick = { showNewTaskOverlay = false },
                                modifier = Modifier.fillMaxWidth().height(64.dp),
                                shape = RoundedCornerShape(16.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = AccentTeal)
                            ) {
                                Text("VIEW DETAILS", fontWeight = FontWeight.Bold)
                            }
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

