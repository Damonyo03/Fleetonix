package com.prototype.fleetonix

import com.google.gson.annotations.SerializedName

// Login Models
data class DriverLoginRequest(
    val email: String,
    val password: String? = null
)

data class DriverLoginResponse(
    val success: Boolean,
    val message: String,
    val data: DriverLoginData? = null
)

data class DriverLoginData(
    @SerializedName("session_token") val sessionToken: String? = null,
    val user: DriverUser? = null,
    val driver: DriverProfile? = null
)

data class DriverUser(
    val id: String? = null,
    @SerializedName("user_type") val userType: String? = null,
    val name: String? = null,
    val email: String? = null
)

data class DriverProfile(
    val id: String? = null,
    @SerializedName("license_number") val licenseNumber: String? = null,
    @SerializedName("vehicle_assigned") val vehicleAssigned: String? = null,
    @SerializedName("vehicle_type") val vehicleType: String? = null,
    @SerializedName("plate_number") val plateNumber: String? = null,
    @SerializedName("current_mileage") val currentMileage: Double? = null,
    @SerializedName("current_status") val currentStatus: String? = null
)

// Feed Models
data class DriverFeedResponse(
    val success: Boolean,
    val message: String,
    val schedules: List<DriverSchedule> = emptyList()
)

data class DriverFeedData(
    val count: Int? = null,
    val schedules: List<DriverSchedule> = emptyList()
)

data class DriverSchedule(
    val docId: String? = null,
    @SerializedName("schedule_id") val scheduleId: Int? = null,
    @SerializedName("trip_id") val tripId: String? = null,
    @SerializedName("scheduled_date") val scheduled_date: String? = null,
    @SerializedName("scheduled_time") val scheduled_time: String? = null,
    @SerializedName("trip_phase") val trip_phase: String? = null, // "pending", "pickup", "dropoff", "return_pickup", "ready_to_complete", "completed"
    val status: String? = null, // "pending", "started", "in_progress", "completed", "cancelled"
    @SerializedName("pickup_location") val pickup_location: DriverScheduleLocation? = null,
    @SerializedName("dropoff_location") val dropoff_location: DriverScheduleLocation? = null,
    @SerializedName("return_to_pickup") val return_to_pickup: Boolean? = null,
    @SerializedName("return_pickup_time") val return_pickup_time: String? = null,
    @SerializedName("total_km_travelled") val total_km_travelled: Double? = null,
    @SerializedName("completed_at") val completed_at: Any? = null,
    @SerializedName("client_phone") val client_phone: String? = null,
    @SerializedName("client_name") val client_name: String? = null,
    @SerializedName("client_email") val client_email: String? = null,
    val client: DriverClientInfo? = null
)

data class DriverScheduleLocation(
    val latitude: Double? = null,
    val longitude: Double? = null,
    val text: String? = null,
    val address: String? = null
)

data class DriverClientInfo(
    val name: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val company: String? = null
)

// Location Models
data class DriverLocationRequest(
    val latitude: Double,
    val longitude: Double,
    val speed: Float? = null,
    val heading: Float? = null,
    val accuracy: Float? = null,
    @SerializedName("schedule_id") val scheduleId: Int? = null,
    @SerializedName("doc_id") val docId: String? = null
)

data class DriverLocationResponse(
    val success: Boolean,
    val message: String,
    val data: DriverLocationData? = null
)

data class DriverLocationData(
    @SerializedName("driver_id") val driverId: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val timestamp: String? = null
)

// Trip Models
data class DriverTripRequest(
    @SerializedName("schedule_id") val scheduleId: Int? = null,
    @SerializedName("doc_id") val docId: String? = null
)

data class DriverTripResponse(
    val success: Boolean,
    val message: String,
    val data: DriverTripData? = null
)

data class DriverTripData(
    @SerializedName("schedule_id") val scheduleId: Int? = null,
    @SerializedName("booking_id") val bookingId: Int? = null,
    val status: String? = null,
    @SerializedName("started_at") val startedAt: String? = null,
    @SerializedName("completed_at") val completedAt: String? = null
)

// OTP Models
data class DriverOTPResponse(
    val success: Boolean,
    val message: String,
    val data: DriverOTPData? = null
)

data class DriverOTPData(
    @SerializedName("user_id") val userId: String? = null,
    val email: String? = null,
    val message: String? = null
)

data class DriverOTPVerifyRequest(
    @SerializedName("user_id") val userId: String,
    @SerializedName("otp_code") val otpCode: String
)

// Forgot Password Models
data class ForgotPasswordRequest(
    val email: String
)

data class ForgotPasswordResponse(
    val success: Boolean,
    val message: String,
    val data: ForgotPasswordData? = null
)

data class ForgotPasswordData(
    @SerializedName("user_id") val userId: String? = null,
    val email: String? = null,
    val otp: String? = null
)

data class ResetPasswordRequest(
    @SerializedName("user_id") val userId: String,
    val otp: String,
    val password: String,
    @SerializedName("confirm_password") val confirmPassword: String? = null
)

data class ResetPasswordResponse(
    val success: Boolean,
    val message: String
)

// Incident Report Models
data class AccidentReportRequest(
    @SerializedName("driver_email") val driverEmail: String,
    @SerializedName("schedule_id") val scheduleId: Int? = null,
    @SerializedName("firebase_schedule_id") val firebaseScheduleId: String? = null,
    val latitude: Double,
    val longitude: Double,
    val description: String? = null
)

data class AccidentReportResponse(
    val success: Boolean,
    val message: String,
    val data: AccidentReportData? = null
)

data class AccidentReportData(
    @SerializedName("accident_id") val accidentId: String? = null,
    @SerializedName("driver_id") val driverId: String? = null,
    @SerializedName("reported_at") val reportedAt: String? = null
)

data class VehicleIssueRequest(
    @SerializedName("driver_email") val driverEmail: String,
    @SerializedName("schedule_id") val scheduleId: Int? = null,
    @SerializedName("firebase_schedule_id") val firebaseScheduleId: String? = null,
    @SerializedName("issue_type") val issueType: String,
    val description: String,
    val latitude: Double,
    val longitude: Double
)

data class VehicleIssueResponse(
    val success: Boolean,
    val message: String,
    val data: VehicleIssueData? = null
)

data class VehicleIssueData(
    @SerializedName("issue_id") val issueId: String? = null,
    @SerializedName("driver_id") val driverId: String? = null,
    @SerializedName("reported_at") val reportedAt: String? = null
)
