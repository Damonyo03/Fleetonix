package com.prototype.fleetonix

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

const val BASE_URL = "https://us-central1-fleetonix-14be4.cloudfunctions.net/"

object FleetonixApi {
    private val logging = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val client = OkHttpClient.Builder()
        .addInterceptor(logging)
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    private val retrofit = Retrofit.Builder()
        .baseUrl(BASE_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    val driverService: DriverApi = retrofit.create(DriverApi::class.java)
}

interface DriverApi {
    @POST("sendPasswordResetOTP")
    suspend fun forgotPassword(@Body request: ForgotPasswordRequest): ForgotPasswordResponse

    @POST("verifyPasswordResetOTP")
    suspend fun verifyForgotPasswordOTP(@Body request: DriverOTPVerifyRequest): DriverOTPResponse

    @POST("resetPasswordWithOTP")
    suspend fun resetPassword(@Body request: ResetPasswordRequest): ResetPasswordResponse

    @POST("reportAccident")
    suspend fun reportAccident(
        @Header("Authorization") authHeader: String? = null,
        @Query("session_token") sessionToken: String? = null,
        @Body request: AccidentReportRequest
    ): AccidentReportResponse

    @POST("reportVehicleIssue")
    suspend fun reportVehicleIssue(
        @Header("Authorization") authHeader: String? = null,
        @Query("session_token") sessionToken: String? = null,
        @Body request: VehicleIssueRequest
    ): VehicleIssueResponse
}
