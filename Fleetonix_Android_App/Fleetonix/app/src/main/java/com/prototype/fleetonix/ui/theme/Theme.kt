package com.prototype.fleetonix.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val FleetonixDarkColorScheme = darkColorScheme(
    primary = AccentTeal,
    onPrimary = DeepOcean,
    secondary = AccentBlue,
    onSecondary = TextPrimary,
    tertiary = AccentOrange,
    onTertiary = TextPrimary,
    background = Midnight,
    onBackground = TextPrimary,
    surface = CardBlue,
    onSurface = TextPrimary,
    surfaceVariant = DeepOcean,
    onSurfaceVariant = TextSecondary,
    outline = DividerBlue
)

@Composable
fun FleetonixTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = FleetonixDarkColorScheme,
        typography = Typography,
        content = content
    )
}
