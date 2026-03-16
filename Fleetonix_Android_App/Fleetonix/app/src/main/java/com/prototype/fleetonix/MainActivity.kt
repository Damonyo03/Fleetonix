package com.prototype.fleetonix

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import com.prototype.fleetonix.ui.theme.FleetonixTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            FleetonixTheme {
                FleetonixApp()
            }
        }
    }
}

@Composable
fun FleetonixApp() {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var locationReady by rememberSaveable { mutableStateOf(false) }

    DisposableEffect(lifecycleOwner, locationReady) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                val gpsActive = context.isGpsEnabled()
                val permissionGranted = hasLocationPermission(context)
                if (!gpsActive || !permissionGranted) {
                    locationReady = false
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        if (!locationReady) {
            LocationGate(onReady = { locationReady = true })
        } else {
            AuthFlow()
        }
    }
}
