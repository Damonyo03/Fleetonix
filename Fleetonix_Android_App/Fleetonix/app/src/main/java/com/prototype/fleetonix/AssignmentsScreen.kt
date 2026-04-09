package com.prototype.fleetonix

import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.prototype.fleetonix.ui.theme.*

// ─────────────────────────────────────────────────────────────
// Data model for a single assignment (parsed from Firestore)
// ─────────────────────────────────────────────────────────────
data class Assignment(
    val docId: String,
    val scheduleId: String,
    val tripPhase: String,
    val currentSegmentIndex: Int,
    val scheduleDate: String?,
    val scheduleTime: String?,
    val clientName: String?,
    val passengerName: String?,
    val passengerPhone: String?,
    val pickupAddress: String?,
    val dropoffAddress: String?,
    val segments: List<AssignmentSegment>,
    val returnToPickup: Boolean,
    val returnPickupTime: String?,
    val specialInstructions: String?,
    val totalKm: Double?,
    val isOfficial: Boolean
)

data class AssignmentSegment(
    val pickup: String,
    val dropoff: String
)

// ─────────────────────────────────────────────────────────────
// Color helpers for phases
// ─────────────────────────────────────────────────────────────
private fun phaseLabel(phase: String): String = when (phase.lowercase()) {
    "pending" -> "Pending"
    "accepted" -> "Accepted"
    "pickup" -> "On the Way"
    "dropoff" -> "Dropping Off"
    "return_pickup" -> "Return Pickup"
    "ready_to_complete" -> "Finishing Up"
    "completed" -> "Completed"
    else -> phase.replaceFirstChar { it.uppercase() }
}

private fun phaseColor(phase: String): Color = when (phase.lowercase()) {
    "pending" -> Color(0xFFFFB347)       // Orange
    "accepted" -> Color(0xFF00D4FF)      // Blue
    "pickup", "dropoff" -> Color(0xFF14B8A6)  // Teal
    "return_pickup", "ready_to_complete" -> Color(0xFFA78BFA) // Purple
    "completed" -> Color(0xFF10B981)     // Green
    else -> Color(0xFF6B7280)
}

// ─────────────────────────────────────────────────────────────
// Assignment Card
// ─────────────────────────────────────────────────────────────
@Composable
fun AssignmentCard(
    assignment: Assignment,
    onAcceptJob: (Assignment) -> Unit
) {
    val phase = assignment.tripPhase
    val badgeColor by animateColorAsState(
        targetValue = phaseColor(phase),
        animationSpec = tween(500),
        label = "badgeColor"
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CardBlue),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // ── Header ──────────────────────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    // Schedule date + time
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            Icons.Default.CalendarToday,
                            contentDescription = null,
                            tint = AccentTeal,
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = "${assignment.scheduleDate ?: "TBD"}  ·  ${formatScheduleTime(assignment.scheduleTime ?: "")}",
                            style = MaterialTheme.typography.bodySmall,
                            color = AccentTeal,
                            fontWeight = FontWeight.SemiBold
                        )
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    // Client name
                    Text(
                        text = assignment.clientName ?: "Unknown Client",
                        style = MaterialTheme.typography.titleMedium,
                        color = TextPrimary,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    // Passenger name
                    if (!assignment.passengerName.isNullOrBlank()) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(
                                    Icons.Default.Person,
                                    contentDescription = null,
                                    tint = TextSecondary,
                                    modifier = Modifier.size(12.dp)
                                )
                                Text(
                                    text = assignment.passengerName,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = TextSecondary
                                )
                            }
                            
                            if (!assignment.passengerPhone.isNullOrBlank()) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Phone,
                                        contentDescription = null,
                                        tint = AccentTeal,
                                        modifier = Modifier.size(12.dp)
                                    )
                                    Text(
                                        text = assignment.passengerPhone,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = AccentTeal,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }
                }

                // Phase badge
                Box(
                    modifier = Modifier
                        .background(badgeColor.copy(alpha = 0.15f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 5.dp)
                ) {
                    Text(
                        text = phaseLabel(phase),
                        color = badgeColor,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp
                    )
                }
            }

            // ── Route Timeline (Multi-Segment Stepper) ────────────────
            if (assignment.segments.isNotEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            color = Color.White.copy(alpha = 0.03f),
                            shape = RoundedCornerShape(12.dp)
                        )
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(0.dp)
                ) {
                    assignment.segments.forEachIndexed { index, segment ->
                        val isCurrentSegment = index == assignment.currentSegmentIndex
                        val isPastSegment = index < assignment.currentSegmentIndex
                        
                        // Pickup point
                        TimelineRow(
                            label = "Pickup ${index + 1}",
                            address = segment.pickup,
                            dotColor = if (isPastSegment || (isCurrentSegment && phase.lowercase() != "pickup")) Color(0xFF10B981) else Color(0xFF00D4FF),
                            isFilled = isPastSegment || (isCurrentSegment && phase.lowercase() != "pickup"),
                            isCurrent = isCurrentSegment && phase.lowercase() == "pickup",
                            showLine = true
                        )

                        // Drop-off point
                        TimelineRow(
                            label = "Drop-off ${index + 1}",
                            address = segment.dropoff,
                            dotColor = if (isPastSegment) Color(0xFF10B981) else if (isCurrentSegment && phase.lowercase() == "dropoff") Color(0xFF00D4FF) else Color(0xFF6B7280),
                            isFilled = isPastSegment,
                            isCurrent = isCurrentSegment && phase.lowercase() == "dropoff",
                            showLine = index < assignment.segments.lastIndex
                        )
                    }
                }
            } else {
                // Fallback: single pickup → dropoff
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            color = Color.White.copy(alpha = 0.03f),
                            shape = RoundedCornerShape(12.dp)
                        )
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(0.dp)
                ) {
                    TimelineRow(
                        label = "Pickup",
                        address = assignment.pickupAddress ?: "—",
                        dotColor = AccentBlue,
                        isFilled = true,
                        showLine = true
                    )
                    TimelineRow(
                        label = "Drop-off",
                        address = assignment.dropoffAddress ?: "—",
                        dotColor = Color(0xFF10B981),
                        isFilled = true,
                        showLine = false
                    )
                }
            }

            // ── Return to Pickup ────────────────────────────────────
            if (assignment.returnToPickup) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFA78BFA).copy(alpha = 0.1f), RoundedCornerShape(8.dp))
                        .padding(10.dp)
                ) {
                    Icon(
                        Icons.Default.Replay,
                        contentDescription = null,
                        tint = Color(0xFFA78BFA),
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "Return to pickup" +
                            (assignment.returnPickupTime?.let { "  ·  ${formatScheduleTime(it)}" } ?: ""),
                        color = Color(0xFFA78BFA),
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            // ── Special Instructions ────────────────────────────────
            if (!assignment.specialInstructions.isNullOrBlank()) {
                Row(
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFFFB347).copy(alpha = 0.08f), RoundedCornerShape(8.dp))
                        .padding(10.dp)
                ) {
                    Icon(
                        Icons.Default.Info,
                        contentDescription = null,
                        tint = Color(0xFFFFB347),
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = assignment.specialInstructions,
                        color = Color(0xFFFFB347),
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }

            // ── Footer ──────────────────────────────────────────────
            if (assignment.totalKm != null && assignment.totalKm > 0) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            Icons.Default.Speed,
                            contentDescription = null,
                            tint = TextSecondary,
                            modifier = Modifier.size(12.dp)
                        )
                        Text(
                            text = "${"%.2f".format(assignment.totalKm)} km travelled",
                            color = TextSecondary,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }

            // ── Accept Button ───────────────────────────────────────
            if (phase == "pending") {
                Button(
                    onClick = { onAcceptJob(assignment) },
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = AccentTeal)
                ) {
                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("ACCEPT JOB", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Timeline Row (shared component)
// ─────────────────────────────────────────────────────────────
@Composable
private fun TimelineRow(
    label: String,
    address: String,
    dotColor: Color,
    isFilled: Boolean,
    isCurrent: Boolean = false,
    showLine: Boolean
) {
    // Pulse animation for the current point
    val pulseScale by androidx.compose.animation.core.rememberInfiniteTransition(label = "pulse")
        .animateFloat(
            initialValue = 1.0f,
            targetValue = 1.4f,
            animationSpec = androidx.compose.animation.core.infiniteRepeatable(
                animation = tween(1000),
                repeatMode = androidx.compose.animation.core.RepeatMode.Reverse
            ),
            label = "scale"
        )
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Dot + line column
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.width(16.dp)
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(24.dp) // Larger container to allow pulse overflow
            ) {
                if (isCurrent) {
                    Box(
                        modifier = Modifier
                            .size(16.dp)
                            .graphicsLayer {
                                scaleX = pulseScale
                                scaleY = pulseScale
                            }
                            .clip(CircleShape)
                            .background(dotColor.copy(alpha = 0.3f))
                    )
                }

                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .clip(CircleShape)
                        .background(if (isFilled || isCurrent) dotColor else Color.Transparent)
                        .then(
                            if (!isFilled && !isCurrent) Modifier
                                .background(dotColor.copy(alpha = 0.4f), CircleShape)
                                .padding(2.dp)
                            else Modifier
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    if (!isFilled && !isCurrent) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(CardBlue)
                        )
                    }
                }
            }

            if (showLine) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(36.dp)
                        .background(Color.White.copy(alpha = 0.12f))
                )
            }
        }

        // Label + address
        Column(modifier = Modifier.weight(1f).padding(bottom = if (showLine) 16.dp else 0.dp)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = TextSecondary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 10.sp
            )
            Text(
                text = address,
                style = MaterialTheme.typography.bodySmall,
                color = TextPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Main Assignments Screen
// ─────────────────────────────────────────────────────────────
@RequiresApi(Build.VERSION_CODES.O)
@Composable
fun AssignmentsScreen(onBack: () -> Unit) {
    val auth = remember { FirebaseAuth.getInstance() }
    val db = remember { FirebaseFirestore.getInstance() }

    var assignments by remember { mutableStateOf<List<Assignment>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    // Real-time Firestore listener
    DisposableEffect(auth.currentUser?.email) {
        val email = auth.currentUser?.email?.lowercase()?.trim()
        if (email == null) {
            isLoading = false
            return@DisposableEffect onDispose {}
        }

        val listener = db.collection("schedules")
            .whereEqualTo("driver_email", email)
            .whereEqualTo("isOfficial", true)
            .orderBy("schedule_date", Query.Direction.DESCENDING)
            .addSnapshotListener { snapshot, error ->
                isLoading = false
                if (error != null) {
                    Log.e("AssignmentsScreen", "Firestore error", error)
                    errorMsg = "Could not load assignments: ${error.message}"
                    return@addSnapshotListener
                }

                if (snapshot != null) {
                    // Phase E: Mark assignments as viewed by driver
                    snapshot.documents.forEach { doc ->
                        if (doc.get("driver_viewed_at") == null) {
                            doc.reference.update("driver_viewed_at", com.google.firebase.firestore.FieldValue.serverTimestamp())
                        }
                    }

                    val parsed = snapshot.documents.mapNotNull { doc ->
                        val data = doc.data ?: return@mapNotNull null
                        val phase = data["trip_phase"] as? String ?: "pending"

                        // Parse segments (multi-segment support)
                        @Suppress("UNCHECKED_CAST")
                        val segmentsList = data["segments"] as? List<Map<String, Any?>>
                        val segments = segmentsList?.mapNotNull { seg ->
                            val pickup = seg["pickup"] as? String ?: return@mapNotNull null
                            val dropoff = seg["dropoff"] as? String ?: return@mapNotNull null
                            AssignmentSegment(pickup = pickup, dropoff = dropoff)
                        } ?: emptyList()

                        // Parse pickup locations (handling both String and Array)
                        val rawPickup = data["pickup_location"]
                        val pickupAddress = when (rawPickup) {
                            is String -> rawPickup
                            is List<*> -> {
                                val first = rawPickup.firstOrNull() as? Map<*, *>
                                first?.get("address") as? String ?: first?.get("text") as? String ?: "Multi-point"
                            }
                            else -> data["pickup_location"] as? String
                        }

                        // Parse dropoff location (handling both String and Map)
                        val rawDropoff = data["dropoff_location"]
                        val dropoffAddress = when (rawDropoff) {
                            is String -> rawDropoff
                            is Map<*, *> -> rawDropoff["address"] as? String ?: rawDropoff["text"] as? String
                            else -> data["dropoff_location"] as? String
                        }

                        Assignment(
                            docId = doc.id,
                            scheduleId = (data["schedule_id"] as? Number)?.toString() ?: doc.id.take(8).uppercase(),
                            tripPhase = phase,
                            currentSegmentIndex = (data["current_segment_index"] as? Number)?.toInt() ?: 0,
                            scheduleDate = data["schedule_date"] as? String,
                            scheduleTime = data["schedule_time"] as? String,
                            clientName = data["client_name"] as? String,
                            passengerName = data["passenger_name"] as? String,
                            passengerPhone = data["passenger_phone"] as? String,
                            pickupAddress = pickupAddress,
                            dropoffAddress = dropoffAddress,
                            segments = segments,
                            returnToPickup = data["return_to_pickup"] as? Boolean ?: false,
                            returnPickupTime = data["return_pickup_time"] as? String,
                            specialInstructions = data["special_instructions"] as? String,
                            totalKm = (data["total_km_travelled"] as? Number)?.toDouble(),
                            isOfficial = data["isOfficial"] as? Boolean ?: false
                        )
                    }.sortedWith(
                        compareBy<Assignment> {
                            when (it.tripPhase) {
                                "pickup", "dropoff", "return_pickup", "ready_to_complete" -> 0
                                "accepted" -> 1
                                "pending" -> 2
                                "completed" -> 3
                                else -> 4
                            }
                        }.thenByDescending { it.scheduleDate }
                    )

                    assignments = parsed
                    Log.d("AssignmentsScreen", "Loaded ${parsed.size} assignments")
                }
            }

        onDispose { listener.remove() }
    }

    // ── UI ──────────────────────────────────────────────────────
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Midnight)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .statusBarsPadding()
        ) {
            // Top bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(CardBlue)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.Default.ArrowBack,
                        contentDescription = "Back",
                        tint = TextPrimary
                    )
                }
                Column {
                    Text(
                        text = "My Assignments",
                        style = MaterialTheme.typography.titleLarge,
                        color = TextPrimary,
                        fontWeight = FontWeight.Bold
                    )
                    if (!isLoading) {
                        Text(
                            text = "${assignments.size} assignment${if (assignments.size != 1) "s" else ""}",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondary
                        )
                    }
                }
            }

            // Content
            when {
                isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            CircularProgressIndicator(color = AccentTeal)
                            Text(
                                "Loading your assignments...",
                                color = TextSecondary,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                }

                errorMsg != null -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Icon(
                                Icons.Default.CloudOff,
                                contentDescription = null,
                                tint = Color(0xFFFF6B6B),
                                modifier = Modifier.size(64.dp)
                            )
                            Text(
                                "Connection Error",
                                style = MaterialTheme.typography.titleMedium,
                                color = TextPrimary,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                errorMsg ?: "",
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }

                assignments.isEmpty() -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Icon(
                                Icons.Default.EventBusy,
                                contentDescription = null,
                                tint = TextSecondary,
                                modifier = Modifier.size(72.dp)
                            )
                            Text(
                                "No Assignments",
                                style = MaterialTheme.typography.titleMedium,
                                color = TextPrimary,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                "You have no upcoming or active assignments. Check back later.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = TextSecondary,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        // Active / In-Progress section
                        val activeItems = assignments.filter {
                            it.tripPhase in listOf("pickup", "dropoff", "return_pickup", "ready_to_complete", "accepted")
                        }
                        if (activeItems.isNotEmpty()) {
                            item {
                                SectionHeader(title = "Active", icon = Icons.Default.DirectionsCar, color = AccentTeal)
                            }
                            items(activeItems, key = { it.docId }) { a ->
                                AssignmentCard(assignment = a, onAcceptJob = {})
                            }
                        }

                        // Pending section
                        val pendingItems = assignments.filter { it.tripPhase == "pending" }
                        if (pendingItems.isNotEmpty()) {
                            item {
                                SectionHeader(title = "Upcoming", icon = Icons.Default.Schedule, color = Color(0xFFFFB347))
                            }
                            items(pendingItems, key = { it.docId }) { a ->
                                AssignmentCard(
                                    assignment = a,
                                    onAcceptJob = { clickedItem ->
                                        isLoading = true
                                        db.collection("schedules").document(clickedItem.docId).update(
                                            "status", "accepted",
                                            "trip_phase", "accepted",
                                            "accepted_at", com.google.firebase.firestore.FieldValue.serverTimestamp()
                                        ).addOnSuccessListener {
                                            onBack()
                                        }.addOnFailureListener { e ->
                                            errorMsg = "Failed to accept job: ${e.message}"
                                            isLoading = false
                                        }
                                    }
                                )
                            }
                        }

                        // Completed section
                        val completedItems = assignments.filter { it.tripPhase == "completed" }
                        if (completedItems.isNotEmpty()) {
                            item {
                                SectionHeader(title = "Completed", icon = Icons.Default.CheckCircle, color = Color(0xFF10B981))
                            }
                            items(completedItems, key = { it.docId }) { a ->
                                AssignmentCard(assignment = a, onAcceptJob = {})
                            }
                        }
                    }
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Section header (used to group Active / Upcoming / Completed)
// ─────────────────────────────────────────────────────────────
@Composable
private fun SectionHeader(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    color: Color
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.padding(vertical = 4.dp)
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
        Text(
            text = title.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = color,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.5.sp
        )
    }
}
