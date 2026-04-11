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
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = Color.Black
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                // 1. The Image Layer
                if (originalBitmap != null) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .pointerInput(Unit) {
                                detectTransformGestures { _, pan, zoom, _ ->
                                    scale = (scale * zoom).coerceIn(1f, 5f)
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

                // 2. The Circular Mask Overlay (Dimmed background with hole)
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val canvasWidth = size.width
                    val canvasHeight = size.height
                    val circleRadius = 140.dp.toPx() // 280dp diameter

                    drawContext.canvas.nativeCanvas.apply {
                        val checkPoint = saveLayer(0f, 0f, canvasWidth, canvasHeight, null)
                        
                        // Draw semi-transparent background
                        drawRect(color = Color.Black.copy(alpha = 0.7f))
                        
                        // Draw the hole (Clear the circle)
                        drawCircle(
                            color = Color.Transparent,
                            radius = circleRadius,
                            center = androidx.compose.ui.geometry.Offset(canvasWidth / 2, canvasHeight / 2),
                            blendMode = BlendMode.Clear
                        )
                        
                        // Draw a subtle border for the circle
                        drawCircle(
                            color = Color.White.copy(alpha = 0.5f),
                            radius = circleRadius,
                            center = androidx.compose.ui.geometry.Offset(canvasWidth / 2, canvasHeight / 2),
                            style = Stroke(width = 2.dp.toPx())
                        )
                        
                        restoreToCount(checkPoint)
                    }
                }

                // 3. Close Button (Top Left)
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.padding(16.dp).align(Alignment.TopStart).statusBarsPadding()
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.White)
                }

                // 4. Bottom Controls
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding()
                        .padding(horizontal = 24.dp, vertical = 32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        "Pinch to Zoom • Drag to Move",
                        color = Color.White.copy(alpha = 0.9f),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier
                            .background(Color.Black.copy(alpha = 0.4f), RoundedCornerShape(20.dp))
                            .padding(horizontal = 16.dp, vertical = 6.dp)
                    )
                    
                    Spacer(modifier = Modifier.height(24.dp))
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        OutlinedButton(
                            onClick = onDismiss,
                            modifier = Modifier.weight(1f).height(56.dp),
                            shape = RoundedCornerShape(12.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.3f)),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)
                        ) {
                            Text("Cancel", style = MaterialTheme.typography.titleMedium)
                        }
                        
                        Button(
                            onClick = {
                                originalBitmap?.let { bmp ->
                                    // Functional Cropping Implementation
                                    val cropped = cropBitmap(bmp, scale, offset)
                                    onConfirm(cropped)
                                }
                            },
                            modifier = Modifier.weight(1f).height(56.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = AccentTeal)
                        ) {
                            Text("Save Photo", style = MaterialTheme.typography.titleMedium, color = Midnight)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Helper to perform the actual bitmap cropping based on UI state.
 * For this prototype, we produce a squared 512x512 bitmap for storage efficiency.
 */
fun cropBitmap(source: Bitmap, scale: Float, offset: androidx.compose.ui.geometry.Offset): Bitmap {
    val size = 512
    val result = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(result)
    
    // We want to draw the source bitmap so that the center of the UI crop area (screen center)
    // maps to the center of our new bitmap.
    
    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
    paint.isFilterBitmap = true
    
    // Calculate scaling to FIT the source into a virtual "screen" of e.g. 1080px width
    // This is a simplification but works for common photo aspects.
    val virtualScreenWidth = 1080f
    val virtualScreenHeight = 1920f
    
    val scaleFactor = virtualScreenWidth / source.width.toFloat()
    val finalScale = scale * scaleFactor
    
    val matrix = android.graphics.Matrix()
    // Center in 512x512 result
    matrix.postTranslate(-source.width / 2f, -source.height / 2f)
    matrix.postScale(finalScale, finalScale)
    matrix.postTranslate(size / 2f + offset.x, size / 2f + offset.y)
    
    canvas.drawBitmap(source, matrix, paint)
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
