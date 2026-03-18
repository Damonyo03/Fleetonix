$filePath = "c:\Users\user\Downloads\Projects\Fleetonix\Fleetonix_Android_App\Fleetonix\app\src\main\java\com\prototype\fleetonix\DriverDashboard.kt"
$data = [System.IO.File]::ReadAllText($filePath)

# Update ACCEPT BOOKING
$acceptOld = 'db\.collection\("schedules"\)\.document\(docId\)\.update\(\r?\n\s*"status", "accepted",\r?\n\s*"trip_phase", "pickup",\r?\n\s*"accepted_at", FieldValue\.serverTimestamp\(\)\r?\n\s*\)\.await\(\)'
$acceptNew = 'db.collection("schedules").document(docId).update(
                                                         "status", "accepted",
                                                         "trip_phase", "pickup",
                                                         "accepted_at", FieldValue.serverTimestamp()
                                                     ).await()

                                                     acceptedAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
                                                     val startTripIntent = Intent(context, LocationService::class.java).apply {
                                                         action = LocationService.ACTION_START_TRIP
                                                     }
                                                     context.startService(startTripIntent)
                                                     totalDistanceMetres = 0f'

$data = $data -replace $acceptOld, $acceptNew

# Update ACCEPT BOOKING for driver_email as well
$acceptDriverOld = '"current_status", "on_schedule",\r?\n\s*"current_trip_id", docId,\r?\n\s*"current_trip_phase", "pickup"'
$acceptDriverNew = '"current_status", "on_schedule",
                                                             "current_trip_id", docId,
                                                             "current_trip_phase", "pickup",
                                                             "accepted_at", acceptedAt'

$data = $data -replace $acceptDriverOld, $acceptDriverNew

# Update CONFIRM PICKUP
$pickupOld = 'db\.collection\("schedules"\)\.document\(docId\)\.update\(\r?\n\s*"trip_phase", "dropoff",\r?\n\s*"picked_up_at", FieldValue\.serverTimestamp\(\)\r?\n\s*\)\.await\(\)'
$pickupNew = 'db.collection("schedules").document(docId).update(
                                                         "trip_phase", "dropoff",
                                                         "picked_up_at", FieldValue.serverTimestamp()
                                                     ).await()

                                                     pickedUpAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))'

$data = $data -replace $pickupOld, $pickupNew

# Update CONFIRM PICKUP for driver doc sync
$pickupDriverOld = 'driverDocRef\?\.update\("current_trip_phase", "dropoff"\)'
$pickupDriverNew = 'driverDocRef?.update(
                                                         "current_trip_phase", "dropoff",
                                                         "picked_up_at", pickedUpAt
                                                     )'

$data = $data -replace $pickupDriverOld, $pickupDriverNew

# Update COMPLETE TRIP
$completeOld = '(?s)onClick = \{.*?val docId = nextSchedule\.docId \?: return@Button.*?isCompletingTrip = true.*?driverDocRef\?\.update\(\s*"current_status", "available",\s*"current_trip_id", "",\s*"current_trip_phase", "completed"\s*\).*?\},'
$completeNew = 'onClick = {
                                             completedAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
                                             showTripTicket = true
                                         },'

$data = $data -replace $completeOld, $completeNew

[System.IO.File]::WriteAllText($filePath, $data)
