import sys

file_path = r'c:\Users\user\Downloads\Projects\Fleetonix\Fleetonix_Android_App\Fleetonix\app\src\main\java\com\prototype\fleetonix\DriverDashboard.kt'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_line = 2388 - 1 # 0-indexed
end_line = 2410 - 1

indent = "                                                      "

new_content = [
    indent + 'val docRef = db.collection("schedules").document(docId)\n',
    indent + 'val doc = docRef.get().await()\n',
    indent + '\n',
    indent + 'val segments = doc.get("segments") as? List<*> ?: emptyList<Any>()\n',
    indent + 'val curIdx = (doc.get("current_segment_index") as? Number)?.toInt() ?: 0\n',
    indent + '\n',
    indent + 'if (curIdx + 1 < segments.size) {\n',
    indent + '    // Progressive Multi-Segment logic\n',
    indent + '    val nextIdx = curIdx + 1\n',
    indent + '    docRef.update(\n',
    indent + '        "current_segment_index", nextIdx,\n',
    indent + '        "trip_phase", "moving_to_pickup"\n',
    indent + '    ).await()\n',
    indent + '    \n',
    indent + '    // Sync to drivers collection\n',
    indent + '    val email = auth.currentUser?.email\n',
    indent + '    if (email != null) {\n',
    indent + '        val dSnap = db.collection("drivers")\n',
    indent + '            .whereEqualTo("driver_email", email.lowercase().trim())\n',
    indent + '            .get().await()\n',
    indent + '        dSnap.documents.firstOrNull()?.reference?.update(\n',
    indent + '            "current_status", "moving_to_pickup",\n',
    indent + '            "current_trip_phase", "moving_to_pickup"\n',
    indent + '        )\n',
    indent + '    }\n',
    indent + '    tripActionSuccess = "Segment ${curIdx + 1} Done! Moving to Pickup ${nextIdx + 1}."\n',
    indent + '} else {\n',
    indent + '    // Final Segment logic\n',
    indent + '    val returnReq = doc.getBoolean("return_to_pickup") ?: false\n',
    indent + '    val nextP = if (returnReq) "return_pickup" else "ready_to_complete"\n',
    indent + '    \n',
    indent + '    docRef.update("trip_phase", nextP, "total_segments_completed", segments.size, "dropped_off_at", FieldValue.serverTimestamp()).await()\n',
    indent + '    \n',
    indent + '    // Sync to drivers collection\n',
    indent + '    val email = auth.currentUser?.email\n',
    indent + '    if (email != null) {\n',
    indent + '        val dSnap = db.collection("drivers")\n',
    indent + '            .whereEqualTo("driver_email", email.lowercase().trim())\n',
    indent + '            .get().await()\n',
    indent + '        dSnap.documents.firstOrNull()?.reference?.update(\n',
    indent + '            "current_status", nextP,\n',
    indent + '            "current_trip_phase", nextP\n',
    indent + '        )\n',
    indent + '    }\n',
    indent + '    tripActionSuccess = if (returnReq) "Arrived! Return required." else "Arrived! Trip ready to complete."\n',
    indent + '}\n'
]

if "val docRef" in lines[start_line]:
    lines[start_line:end_line+1] = new_content
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Success")
else:
    print(f"Error: Could not find 'val docRef' at line {start_line+1}")
    print(f"Actual content: {lines[start_line]}")
    sys.exit(1)
