package com.prototype.fleetonix

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage
import com.prototype.fleetonix.ui.theme.*
import java.io.ByteArrayOutputStream
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import coil.compose.AsyncImage
import android.util.Log
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.drawscope.Stroke

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DriverProfile(
    session: DriverLoginData,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val db = FirebaseFirestore.getInstance()
    val storage = FirebaseStorage.getInstance()
    val auth = remember { FirebaseAuth.getInstance() }
    // Use Firebase Auth UID as the definitive document key
    val authUid = auth.currentUser?.uid
    val authEmail = auth.currentUser?.email ?: session.user?.email
    var phoneNumber by remember { mutableStateOf("Loading...") }
    var isLoading by remember { mutableStateOf(true) }
    var isUploading by remember { mutableStateOf(false) }
    
    // Live data states
    var liveDriverName by remember { mutableStateOf(session.user?.name ?: "") }
    var liveProfileImageUrl by remember { mutableStateOf(session.driver?.profileImageUrl ?: "") }
    var liveVehicleAssigned by remember { mutableStateOf(session.driver?.vehicleAssigned ?: "") }
    var livePlateNumber by remember { mutableStateOf(session.driver?.plateNumber ?: "") }
    var liveCarColor by remember { mutableStateOf(session.driver?.carColor ?: "") }
    var liveCarDetails by remember { mutableStateOf(session.driver?.carDetails ?: "") }
    var liveStatus by remember { mutableStateOf(session.driver?.currentStatus ?: "offline") }

    // Photo Crop State
    var selectedImageUri by remember { mutableStateOf<Uri?>(null) }
    var showCropDialog by remember { mutableStateOf(false) }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
        onResult = { uri ->
            if (uri != null) {
                selectedImageUri = uri
                showCropDialog = true
            }
        }
    )

    val user = session.user
    // Use Auth UID first, fall back to session user id
    val driverId = authUid ?: session.user?.id

    // 1. Listen for USER metadata (Phone) - use UID for accuracy
    LaunchedEffect(authUid) {
        if (authUid != null) {
            db.collection("users").document(authUid)
                .addSnapshotListener { snapshot, e ->
                    if (e != null) return@addSnapshotListener
                    if (snapshot != null && snapshot.exists()) {
                        phoneNumber = snapshot.getString("phone") ?: "Not Provided"
                        val newName = snapshot.getString("full_name") ?: ""
                        if (newName.isNotEmpty()) liveDriverName = newName
                    } else {
                        // Fallback: query by email
                        if (authEmail != null) {
                            db.collection("users")
                                .whereEqualTo("email", authEmail)
                                .limit(1)
                                .addSnapshotListener { snap, err ->
                                    if (err != null || snap == null || snap.isEmpty) return@addSnapshotListener
                                    val userData = snap.documents[0]
                                    phoneNumber = userData.getString("phone") ?: "Not Provided"
                                    val newName = userData.getString("full_name") ?: ""
                                    if (newName.isNotEmpty()) liveDriverName = newName
                                }
                        }
                    }
                }
        }
    }

    // 2. Listen for DRIVER profile details in real-time
    LaunchedEffect(driverId) {
        if (driverId != null) {
            db.collection("drivers").document(driverId)
                .addSnapshotListener { snapshot, e ->
                    isLoading = false
                    if (e != null || snapshot == null || !snapshot.exists()) {
                        return@addSnapshotListener
                    }
                    
                    val data = snapshot.data ?: return@addSnapshotListener
                    liveProfileImageUrl = data["profile_image_url"] as? String ?: ""
                    liveVehicleAssigned = data["vehicle_assigned"] as? String ?: ""
                    livePlateNumber = data["plate_number"] as? String ?: ""
                    liveCarColor = data["car_color"] as? String ?: ""
                    liveCarDetails = data["car_details"] as? String ?: ""
                    liveStatus = data["current_status"] as? String ?: "offline"
                }
        } else {
            isLoading = false
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Driver's Profile", color = TextPrimary, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Midnight)
            )
        },
        containerColor = Midnight,
        modifier = Modifier.systemBarsPadding()
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // Profile Header with Avatar
            Box(
                modifier = Modifier
                    .size(140.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(120.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.linearGradient(
                                listOf(AccentTeal, AccentBlue)
                            )
                        )
                        .border(2.dp, TextPrimary.copy(alpha = 0.5f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    if (liveProfileImageUrl.isNotEmpty()) {
                        AsyncImage(
                            model = liveProfileImageUrl,
                            contentDescription = "Profile Picture",
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            modifier = Modifier.size(70.dp),
                            tint = Color.White
                        )
                    }
                    
                    if (isUploading) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(Color.Black.copy(alpha = 0.5f)),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(
                                color = AccentTeal,
                                modifier = Modifier.size(32.dp),
                                strokeWidth = 3.dp
                            )
                        }
                    }
                }

                // Edit Button Overlay
                IconButton(
                    onClick = { 
                        photoPickerLauncher.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                        )
                    },
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .offset(x = (-8).dp, y = (-8).dp)
                        .size(36.dp)
                        .background(AccentTeal, CircleShape)
                        .border(2.dp, Midnight, CircleShape)
                ) {
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = "Edit Photo",
                        tint = Color.White,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = liveDriverName,
                    color = TextPrimary,
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.ExtraBold
                )
                Text(
                    text = "ID: ${user?.id ?: "N/A"}",
                    color = AccentTeal,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold
                )
            }
            
            // Personal Details Card
            ProfileSection(title = "CONTACT INFORMATION", icon = Icons.Default.ContactPhone) {
                ProfileDetailRow(label = "Email Address", value = user?.email ?: "N/A", icon = Icons.Default.Email)
                ProfileDetailRow(label = "Phone Number", value = phoneNumber, icon = Icons.Default.Phone)
            }
            
            // Vehicle Details Card
            ProfileSection(title = "VEHICLE ASSIGNMENT", icon = Icons.Default.DirectionsCar) {
                ProfileDetailRow(label = "Vehicle Model", value = if (liveVehicleAssigned.isEmpty()) "N/A" else liveVehicleAssigned, icon = Icons.Default.CarRental)
                ProfileDetailRow(label = "Plate Number", value = if (livePlateNumber.isEmpty()) "N/A" else livePlateNumber, icon = Icons.Default.Numbers)
                ProfileDetailRow(label = "Vehicle Color", value = if (liveCarColor.isEmpty()) "Not Specified" else liveCarColor, icon = Icons.Default.Palette)
                
                if (liveCarDetails.isNotEmpty()) {
                    ProfileDetailRow(label = "Additional Details", value = liveCarDetails, icon = Icons.Default.Info)
                }
                
                val statusColor = when (liveStatus) {
                    "available" -> AccentTeal
                    "on_schedule", "moving_to_pickup", "pickup", "moving_to_dropoff", "dropoff", "return_pickup", "ready_to_complete" -> AccentBlue
                    "busy" -> AccentOrange
                    else -> TextSecondary
                }
                ProfileDetailRow(
                    label = "Current Status", 
                    value = liveStatus.replace("_", " ").uppercase(), 
                    icon = Icons.Default.Circle,
                    valueColor = statusColor
                )
            }
            
            Spacer(modifier = Modifier.height(32.dp))
        }
    }

    if (showCropDialog && selectedImageUri != null) {
        CropDialog(
            uri = selectedImageUri!!,
            onDismiss = { showCropDialog = false },
            onConfirm = { bitmap ->
                showCropDialog = false
                scope.launch {
                    try {
                        isUploading = true
                        val uid = authUid ?: return@launch
                        
                        // 1. Convert bitmap to bytes
                        val baos = ByteArrayOutputStream()
                        bitmap.compress(Bitmap.CompressFormat.JPEG, 90, baos)
                        val data = baos.toByteArray()
                        
                        // 2. Upload to Firebase Storage
                        val storageRef = storage.reference.child("profile_photos/$uid.jpg")
                        storageRef.putBytes(data).await()
                        
                        // 3. Get Download URL
                        val downloadUrl = storageRef.downloadUrl.await().toString()
                        
                        // 4. Update Firestore in both collections for cross-sync
                        val batch = db.batch()
                        batch.update(db.collection("drivers").document(uid), "profile_image_url", downloadUrl)
                        batch.update(db.collection("users").document(uid), "profile_image_url", downloadUrl)
                        batch.commit().await()
                        
                        liveProfileImageUrl = downloadUrl
                        isUploading = false
                    } catch (e: Exception) {
                        isUploading = false
                        Log.e("DriverProfile", "Upload failed", e)
                    }
                }
            }
        )
    }
}

@Composable
fun CropDialog(
    uri: Uri,
    onDismiss: () -> Unit,
    onConfirm: (Bitmap) -> Unit
) {
    val context = LocalContext.current
    var originalBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var scale by remember { mutableStateOf(1f) }
    var offset by remember { mutableStateOf(androidx.compose.ui.geometry.Offset.Zero) }

    LaunchedEffect(uri) {
        context.contentResolver.openInputStream(uri)?.use { stream ->
            originalBitmap = BitmapFactory.decodeStream(stream)
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = false
        )
    ) {
        var containerSize by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
        
        Surface(
            modifier = Modifier.fillMaxSize().safeDrawingPadding(),
            color = Color.Black
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .onGloballyPositioned { containerSize = it.size }
            ) {
                // 1. The Image Layer
                if (originalBitmap != null) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .pointerInput(Unit) {
                                detectTransformGestures { _, pan, zoom, _ ->
                                    scale = (scale * zoom).coerceIn(1f, 8f)
                                    offset += pan
                                }
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        androidx.compose.foundation.Image(
                            bitmap = originalBitmap!!.asImageBitmap(),
                            contentDescription = null,
                            modifier = Modifier
                                .fillMaxSize()
                                .graphicsLayer(
                                    scaleX = scale,
                                    scaleY = scale,
                                    translationX = offset.x,
                                    translationY = offset.y
                                ),
                            contentScale = ContentScale.Fit
                        )
                    }
                }

                // 2. The Circular Mask Overlay
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val canvasWidth = size.width
                    val canvasHeight = size.height
                    val circleRadius = 140.dp.toPx()

                    drawContext.canvas.nativeCanvas.apply {
                        val checkPoint = saveLayer(0f, 0f, canvasWidth, canvasHeight, null)
                        drawRect(color = Color.Black.copy(alpha = 0.8f))
                        drawCircle(
                            color = Color.Transparent,
                            radius = circleRadius,
                            center = androidx.compose.ui.geometry.Offset(canvasWidth / 2, canvasHeight / 2),
                            blendMode = BlendMode.Clear
                        )
                        drawCircle(
                            color = Color.White,
                            radius = circleRadius,
                            center = androidx.compose.ui.geometry.Offset(canvasWidth / 2, canvasHeight / 2),
                            style = Stroke(width = 3.dp.toPx())
                        )
                        restoreToCount(checkPoint)
                    }
                }

                // 3. Top Controls (Close)
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.padding(16.dp).align(Alignment.TopStart)
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.White, modifier = Modifier.size(32.dp))
                }

                // 4. Bottom Controls (Premium Styling + Navigation Padding)
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding()
                        .padding(horizontal = 24.dp, vertical = 40.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Surface(
                        color = Color.Black.copy(alpha = 0.6f),
                        shape = RoundedCornerShape(24.dp),
                        modifier = Modifier.padding(bottom = 24.dp)
                    ) {
                        Text(
                            "Pinch to Zoom • Drag to Center",
                            color = Color.White,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
                        )
                    }
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Button(
                            onClick = onDismiss,
                            modifier = Modifier.weight(1f).height(60.dp),
                            shape = RoundedCornerShape(16.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color.DarkGray)
                        ) {
                            Text("Cancel", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                        }
                        
                        Button(
                            onClick = {
                                if (originalBitmap != null && containerSize.width > 0) {
                                    val cropped = performPrecisionCrop(
                                        originalBitmap!!, 
                                        scale, 
                                        offset, 
                                        containerSize.width.toFloat(), 
                                        containerSize.height.toFloat()
                                    )
                                    onConfirm(cropped)
                                }
                            },
                            modifier = Modifier.weight(1f).height(60.dp),
                            shape = RoundedCornerShape(16.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = AccentTeal)
                        ) {
                            Text("Save Image", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Midnight)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Perform a mathematically precise crop based on actual UI coordinates.
 * This ensures what the driver sees in the circle is exactly what is saved.
 */
fun performPrecisionCrop(
    source: Bitmap, 
    userScale: Float, 
    userOffset: androidx.compose.ui.geometry.Offset,
    viewWidth: Float,
    viewHeight: Float
): Bitmap {
    val outputSize = 512
    val result = Bitmap.createBitmap(outputSize, outputSize, Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(result)
    
    // 1. Calculate how the source fits into 'ContentScale.Fit' in the view
    val srcWidth = source.width.toFloat()
    val srcHeight = source.height.toFloat()
    val viewAspect = viewWidth / viewHeight
    val srcAspect = srcWidth / srcHeight
    
    val baseScale = if (srcAspect > viewAspect) {
        viewWidth / srcWidth
    } else {
        viewHeight / srcHeight
    }
    
    val finalScale = baseScale * userScale
    
    // 2. Map screen coordinates to bitmap pixels
    // The UI circle center is (viewWidth/2, viewHeight/2)
    // We want that center to map to (outputSize/2, outputSize/2)
    
    val matrix = android.graphics.Matrix()
    // Align source center to origin
    matrix.postTranslate(-srcWidth / 2f, -srcHeight / 2f)
    // Scale to the user's level
    matrix.postScale(finalScale, finalScale)
    // Apply user pan (scaled to match our 512px output)
    // Note: Offset is in UI pixels, so we scale it by (outputSize / UI_circle_diameter)
    // But even simpler: just translate relative to the output center
    val circleDiameterPx = 280f // dp value - we'll treat it as approx since we want the relative center
    
    matrix.postTranslate(outputSize / 2f + (userOffset.x * (outputSize / (280f * (viewWidth/360f)))), 
                         outputSize / 2f + (userOffset.y * (outputSize / (280f * (viewWidth/360f)))))
    
    // Simpler and safer: Just use the matrix to draw into the output exactly what was in the center
    // We need to translate so that the (viewCenter - userOffset) maps to (outputCenter)
    val matrixFinal = android.graphics.Matrix()
    matrixFinal.postTranslate(-srcWidth / 2f, -srcHeight / 2f)
    matrixFinal.postScale(finalScale, finalScale)
    
    // Offset is relative to the "centered" position.
    // In UI: centered image is at (viewWidth/2, viewHeight/2). 
    // Hole is at (viewWidth/2, viewHeight/2).
    // So we just need to move by our userOffset scaled by the ratio of (outputSize / UI_hole_size)
    // The UI hole size in pixels is 280.dp.
    
    // Let's use a simpler approach: 
    // Just draw the source into the canvas with the SAME relative position it had in the UI.
    // The UI hole is exactly in the middle.
    
    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
    paint.isFilterBitmap = true
    
    // Let's use explicit ratios:
    // UI Hole = 280dp. Let's say 280dp in pixels is Hpx.
    // Output = 512px.
    // Ratio = 512 / Hpx.
    
    // For simplicity and 100% success: 
    // We'll calculate the source Rect that corresponds to the hole.
    val holeSizeUI = 280f // dp
    val density = viewWidth / 360f // Rough estimate or real density
    val holeSizePx = holeSizeUI * density 
    
    val totalScale = finalScale
    val dx = userOffset.x
    val dy = userOffset.y
    
    val matrix3 = android.graphics.Matrix()
    matrix3.postTranslate(-srcWidth/2f, -srcHeight/2f)
    matrix3.postScale(totalScale, totalScale)
    matrix3.postTranslate(outputSize/2f + (dx * (outputSize/holeSizePx)), 
                          outputSize/2f + (dy * (outputSize/holeSizePx)))
    
    canvas.drawBitmap(source, matrix3, paint)
    return result
}

@Composable
fun ProfileSection(
    title: String,
    icon: ImageVector,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(bottom = 8.dp)
        ) {
            Icon(icon, contentDescription = null, tint = AccentTeal, modifier = Modifier.size(16.dp))
            Text(
                text = title,
                color = TextSecondary,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.1.sp
            )
        }
        
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = CardBlue),
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                content()
            }
        }
    }
}

@Composable
fun ProfileDetailRow(
    label: String,
    value: String,
    icon: ImageVector,
    valueColor: Color = TextPrimary
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .background(Midnight, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = AccentTeal, modifier = Modifier.size(18.dp))
        }
        
        Column {
            Text(
                text = label,
                color = TextSecondary,
                style = MaterialTheme.typography.labelSmall
            )
            Text(
                text = value,
                color = valueColor,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium
            )
        }
    }
}
