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
    @SerializedName("plate_number") val plateNumber: String? = null,
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
    @SerializedName("booking_id") val bookingId: Int? = null,
    @SerializedName("schedule_status") val scheduleStatus: String? = null,
    @SerializedName("trip_phase") val tripPhase: String? = null,
    @SerializedName("scheduled_date") val scheduledDate: String? = null,
    @SerializedName("scheduled_time") val scheduledTime: String? = null,
    @SerializedName("started_at") val startedAt: String? = null,
    @SerializedName("completed_at") val completedAt: String? = null,
    @SerializedName("estimated_arrival_time") val estimatedArrivalTime: String? = null,
    @SerializedName("actual_arrival_time") val actualArrivalTime: String? = null,
    val pickup: DriverScheduleLocation? = null,
    val dropoff: DriverScheduleLocation? = null,
    @SerializedName("return_to_pickup") val returnToPickup: Boolean? = null,
    @SerializedName("return_pickup_time") val returnPickupTime: String? = null,
    val passengers: Int? = null,
    @SerializedName("special_instructions") val specialInstructions: String? = null,
    @SerializedName("booking_status") val bookingStatus: String? = null,
    val client: DriverClientInfo? = null
)

data class DriverScheduleLocation(
    val address: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null
)

data class DriverClientInfo(
    val company: String? = null,
    val name: String? = null,
    val phone: String? = null,
    val email: String? = null
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
