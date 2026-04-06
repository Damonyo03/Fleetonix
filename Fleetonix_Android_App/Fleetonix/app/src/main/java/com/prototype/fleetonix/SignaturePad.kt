package com.prototype.fleetonix

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput

@Composable
fun SignaturePad(
    modifier: Modifier = Modifier,
    paths: MutableList<PathState>,
    onPathAdded: () -> Unit = {}
) {
    var currentPath by remember { mutableStateOf<Path?>(null) }
    var currentPathPoints = remember { mutableStateListOf<Offset>() }

    Canvas(
        modifier = modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { offset ->
                        currentPath = Path().apply { moveTo(offset.x, offset.y) }
                        currentPathPoints.add(offset)
                    },
                    onDrag = { change, _ ->
                        currentPath?.lineTo(change.position.x, change.position.y)
                        currentPathPoints.add(change.position)
                        // Trigger recomposition
                        val tempPath = currentPath
                        currentPath = null
                        currentPath = tempPath
                    },
                    onDragEnd = {
                        currentPath?.let {
                            paths.add(PathState(it, currentPathPoints.toList()))
                        }
                        currentPath = null
                        currentPathPoints.clear()
                        onPathAdded()
                    }
                )
            }
    ) {
        // Draw existing paths
        paths.forEach { pathState ->
            drawPath(
                path = pathState.path,
                color = Color.Black,
                style = Stroke(
                    width = 8f,
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round
                )
            )
        }

        // Draw current path
        currentPath?.let {
            drawPath(
                path = it,
                color = Color.Black,
                style = Stroke(
                    width = 8f,
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round
                )
            )
        }
    }
}

data class PathState(
    val path: Path,
    val points: List<Offset>
)
