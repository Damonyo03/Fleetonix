/* eslint-disable */
// [STABILITY_HOTFIX_PRODUCTION_04-10_V3_MERGED]
/**
 * Fleetonix Core Functions - Consolidated Production Environment
 */

const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated, onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const axios = require("axios");
const crypto = require("crypto");
const { defineSecret } = require("firebase-functions/params");

// D2: Secret Definitions
// D2: Secret Definitions removed in favor of ENV bypass for CI/CD stability
// GMAIL_APP_PASSWORD is now handled via process.env.GMAIL_APP_PASSWORD

admin.initializeApp();

setGlobalOptions({ maxInstances: 10 });

// Shared Mail Transport
const getMailTransport = () => {
    if (!process.env.GMAIL_APP_PASSWORD) {
        logger.warn("CRITICAL: GMAIL_APP_PASSWORD is not set in environment variables. Emails will fail.");
    }
    return nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: "fleetonix.noreply@gmail.com",
            pass: process.env.GMAIL_APP_PASSWORD || "",
        },
    });
};

// RBAC Middleware
async function requireRole(req, res, allowedRoles = ["super_admin", "admin"]) {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return null;
  }
  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : null;
  if (!idToken) {
    res.status(401).json({ success: false, message: "Unauthorized: missing token" });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userDoc = await admin.firestore().collection("users").doc(decoded.uid).get();
    const data = userDoc.exists ? userDoc.data() : null;
    const role = data?.role || data?.user_type;
    
    if (!userDoc.exists || !allowedRoles.includes(role)) {
      res.status(403).json({ success: false, message: "Forbidden: insufficient role" });
      return null;
    }
    return { uid: decoded.uid, role, email: decoded.email };
  } catch (e) {
    res.status(401).json({ success: false, message: "Unauthorized: invalid token" });
    return null;
  }
}

/**
 * Premium HTML Template for OTP
 */
function getOTPHtmlTemplate(otp, email, isRegistration = false) {
  const title = isRegistration ? "Create Your Fleetonix Account" : "Password Reset Request";
  const subtitle = isRegistration ?
    "Welcome to Fleetonix! Use the verification code below to complete your registration." :
    "We received a request to reset your password. Use the verification code below to proceed.";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background-color: #0a0e27; color: #ffffff; }
        .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #1a1f3a; border-radius: 12px; border: 1px solid #2d3447; }
        .logo { display: block; width: 120px; margin: 0 auto 30px; border-radius: 12px; }
        .header { text-align: center; color: #ffffff; font-size: 24px; font-weight: 700; margin-bottom: 20px; letter-spacing: 0.5px; }
        .content { text-align: center; color: #b0b8c8; font-size: 16px; line-height: 1.6; margin-bottom: 30px; }
        .otp-container { background: #252b42; padding: 25px; border-radius: 12px; font-size: 32px; font-weight: 800; color: #00c9a7; letter-spacing: 12px; text-align: center; border: 1px solid #1e2338; box-shadow: 0 4px 15px rgba(0, 201, 167, 0.2); }
        .footer { text-align: center; margin-top: 40px; color: #6b7280; font-size: 13px; }
        .accent { color: #00d4ff; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="container">
        <img src="https://appfleetonix.web.app/img/logo.jpg" alt="Fleetonix" class="logo">
        <div class="header">${title}</div>
        <div class="content">
          Hello <span class="accent">${email}</span>,<br><br>
          ${subtitle}
          <br><br><span style="color: #ff6b6b;">This code will expire in 15 minutes.</span>
        </div>
        <div class="otp-container">${otp}</div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Fleetonix Fleet Management.
        </div>
      </div>
    </body>
    </html>
  `;
}

function getApprovalEmailTemplate(name) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        .email-body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; }
        .header { background: #00d4ff; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 30px; background: #fff; }
        .button { display: inline-block; padding: 12px 24px; background-color: #00d4ff; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
        .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
      </style>
    </head>
    <body style="background-color: #f4f7f6; padding: 20px;">
      <div class="email-body">
        <div class="header">
          <h1 style="margin:0;">Account Approved!</h1>
        </div>
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          <p>Great news! Your driver enrollment for <strong>Fleetonix</strong> has been officially approved and activated by the Super Admin.</p>
          <p>You now have full access to your driver dashboard. You can start accepting assignments and tracking your DTR immediately.</p>
          <div style="text-align: center;">
            <a href="#" class="button">Open Fleetonix App</a>
          </div>
          <p>If you have any questions, please contact your fleet supervisor.</p>
          <p>Welcome to the team!</p>
          <p>Best regards,<br>The Fleetonix Team</p>
        </div>
        <div class="footer">
          &copy; 2026 Fleetonix Logistics Systems. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;
}

// RESTORED: Password Reset Flows
exports.sendPasswordResetOTP = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "Email is required" });

  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    await admin.firestore().collection("otps").doc(userRecord.uid).set({
      email: email,
      hash: otpHash,
      attempts: 0,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      expires_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 15 * 60 * 1000)),
    });

    await getMailTransport().sendMail({
      from: '"Fleetonix System" <fleetonix.noreply@gmail.com>',
      to: email,
      subject: "Verification Code: " + otp,
      html: getOTPHtmlTemplate(otp, email),
    });

    res.json({ success: true, message: "OTP sent successfully", data: { userId: userRecord.uid } });
  } catch (error) {
    // Return a vague success to avoid email enumeration, but still log the real error
    logger.error("sendPasswordResetOTP error:", error.message);
    res.json({ success: false, message: "No account found with that email address." });
  }
});

exports.resetPasswordWithOTP = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const { userId, otp, newPassword, password } = req.body || {};
  const targetPassword = newPassword || password;

  if (!userId || !otp || !targetPassword) return res.status(400).json({ success: false, message: "Missing required fields" });

  try {
    const db = admin.firestore();
    let otpDoc = await db.collection("otps").doc(userId).get();
    let sourceCollection = "otps";

    // FALLBACK: If not found in 'otps', check 'registration_otps' (Admin-sent activation codes)
    if (!otpDoc.exists) {
        const userAuth = await admin.auth().getUser(userId);
        const email = userAuth.email.toLowerCase().trim();
        otpDoc = await db.collection("registration_otps").doc(email).get();
        sourceCollection = "registration_otps";
    }

    if (!otpDoc.exists) return res.status(404).json({ success: false, message: "Verification session not found. Please request a new code." });

    const data = otpDoc.data();
    const incomingHash = crypto.createHash("sha256").update(otp).digest("hex");

    // Support both 'hash' field and 'code' field for flexibility
    const isValid = (data.hash === incomingHash) || (data.code === otp) || (data.otp === otp);

    if (!isValid) {
      const newAttempts = (data.attempts || 0) + 1;
      if (newAttempts >= 5) {
          await db.collection(sourceCollection).doc(otpDoc.id).delete();
          return res.status(401).json({ success: false, message: "Too many failed attempts. Please request a new code." });
      }
      await db.collection(sourceCollection).doc(otpDoc.id).update({ attempts: newAttempts });
      return res.status(401).json({ success: false, message: `Invalid OTP code. ${5 - newAttempts} attempts remaining.` });
    }
    
    // Check expiration (Registration OTPs might use 'expires_at', otps uses 'expires_at')
    const expiry = data.expires_at?.toDate ? data.expires_at.toDate() : new Date(Date.now() + 1000000); // Default to safe far-future if missing
    if (expiry < new Date()) return res.status(401).json({ success: false, message: "The verification code has expired." });

    await admin.auth().updateUser(userId, { password: targetPassword });
    
    // If this was an activation OTP (registration), move status to pending_approval
    if (sourceCollection === "registration_otps") {
        await db.collection("users").doc(userId).update({
            status: "pending_approval",
            activated_at: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Also update driver status if applicable
        const driverDoc = await db.collection("drivers").doc(userId).get();
        if (driverDoc.exists) {
            await db.collection("drivers").doc(userId).update({
                status: "pending_approval"
            });
        }

        // AUDIT: Notify Admin for Approval (mirroring verifyAndActivateAccount)
        await db.collection("notifications").add({
            title: "New Enrollment Approval",
            message: `User ${userId} has set their password and is waiting for activation.`,
            type: "enrollment",
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            is_read: false,
            role: "admin"
        });
    }

    // Clean up the used OTP
    await db.collection(sourceCollection).doc(otpDoc.id).delete();

    res.json({ success: true, message: "Password updated successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Verification failed: " + error.message });
  }
});

// RESTORED: General Verify OTP (Used by legacy app versions)
exports.verifyOTP = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const { userId, otpCode } = req.body || {};
  if (!userId || !otpCode) return res.status(200).json({ success: false, message: "Missing fields" });

  try {
    let otpDoc = await admin.firestore().collection("otps").doc(userId).get();
    let sourceCollection = "otps";
    
    // FALLBACK: If not found in 'otps', check 'registration_otps' by email (new driver activation)
    if (!otpDoc.exists) {
        try {
            const userAuth = await admin.auth().getUser(userId);
            const email = userAuth.email.toLowerCase().trim();
            otpDoc = await admin.firestore().collection("registration_otps").doc(email).get();
            sourceCollection = "registration_otps";
        } catch (authError) {
            // User not found in Auth, doc remains !exists
        }
    }

    if (!otpDoc.exists) return res.json({ success: false, message: "Token expired or not found" });

    const data = otpDoc.data();
    const incomingHash = crypto.createHash("sha256").update(otpCode).digest("hex");
    
    // Support both 'hash' field and legacy fields 'code'/'otp'
    const isValid = (data.hash === incomingHash) || (data.code === otpCode) || (data.otp === otpCode);

    if (isValid) {
      // Fetch profile data...
      const userSnap = await admin.firestore().collection("users").doc(userId).get();
      const userData = userSnap.exists ? userSnap.data() : {};
      
      const driverSnap = await admin.firestore().collection("drivers").doc(userId).get();
      const driverData = driverSnap.exists ? driverSnap.data() : {};

      res.json({ 
        success: true, 
        message: "OTP verified",
        data: {
          session_token: `firebase_${userId}`,
          user: {
            id: userId,
            user_type: userData.user_type || userData.role || "driver",
            name: userData.full_name || userData.fullName,
            email: userData.email,
            phone: userData.phone
          },
          driver: {
            id: userId,
            profile_image_url: driverData.profile_image_url,
            car_details: driverData.car_details,
            car_color: driverData.car_color,
            vehicle_assigned: driverData.vehicle_assigned,
            vehicle_type: driverData.vehicle_type,
            plate_number: driverData.plate_number,
            current_mileage: driverData.current_mileage,
            current_status: driverData.current_status || "available"
          }
        }
      });
    } else {
      const newAttempts = (data.attempts || 0) + 1;
      if (newAttempts >= 5) {
          await admin.firestore().collection(sourceCollection).doc(otpDoc.id).delete();
          return res.json({ success: false, message: "Too many failed attempts. Please request a new code." });
      }
      await admin.firestore().collection(sourceCollection).doc(otpDoc.id).update({ attempts: newAttempts });
      res.json({ success: false, message: `Invalid OTP. ${5 - newAttempts} attempts remaining.` });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// MODERNIZED: Admin/Driver Registration & Activation
exports.sendRegistrationOTP = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "Email required" });

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    await admin.firestore().collection("registration_otps").doc(email.toLowerCase().trim()).set({
      email: email.toLowerCase().trim(),
      hash: otpHash,
      code: otp,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      expires_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 15 * 60 * 1000)),
    });

    await getMailTransport().sendMail({
      from: '"Fleetonix Activation" <fleetonix.noreply@gmail.com>',
      to: email,
      subject: "Activation Code: " + otp,
      html: getOTPHtmlTemplate(otp, email, true),
    });

    res.json({ success: true, message: "OTP sent" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

exports.adminCreateUser = onRequest({ cors: true }, async (req, res) => {
  const caller = await requireRole(req, res, ["super_admin", "admin"]);
  if (!caller) return;

  const { email, password, fullName, role } = req.body;
  const emailLower = email.toLowerCase().trim();

  try {
    const userRecord = await admin.auth().createUser({
      email: emailLower,
      password: password,
      displayName: fullName,
    });

    const userData = {
      full_name: fullName,
      email: emailLower,
      role: role,
      company_name: "Jettsan",
      status: "pending_verification",
      isFirstLogin: true,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    await admin.firestore().collection("users").doc(userRecord.uid).set(userData);

    if (role === "driver") {
        await admin.firestore().collection("drivers").doc(userRecord.uid).set({
            driver_name: fullName,
            driver_email: emailLower,
            current_status: "offline",
            status: "pending_verification",
            created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    await admin.firestore().collection("registration_otps").doc(emailLower).set({
        email: emailLower,
        hash: otpHash,
        attempts: 0,
        // REMOVED: Insecure plaintext 'code' field
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        expires_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    });

    await getMailTransport().sendMail({
        from: '"Fleetonix Activation" <fleetonix.noreply@gmail.com>',
        to: emailLower,
        subject: "Welcome to Fleetonix: Activation Code",
        html: getOTPHtmlTemplate(otp, emailLower, true),
    });

    res.json({ success: true, message: "Account created and OTP sent.", uid: userRecord.uid });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

exports.verifyAndActivateAccount = onRequest({ cors: true }, async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    let { email, otp, newPassword } = req.body;
    otp = String(otp || "").trim();
    const emailLower = email.toLowerCase().trim();

    try {
        const otpDoc = await admin.firestore().collection("registration_otps").doc(emailLower).get();
        if (!otpDoc.exists) return res.status(401).json({ success: false, message: "No verification session found." });

        const otpData = otpDoc.data();
        const incomingHash = crypto.createHash("sha256").update(otp).digest("hex");
        
        if (otpData.code !== otp && otpData.hash !== incomingHash) {
            return res.status(401).json({ success: false, message: "Invalid code." });
        }

        const userAuth = await admin.auth().getUserByEmail(emailLower);
        await admin.auth().updateUser(userAuth.uid, { password: newPassword });

        await admin.firestore().collection("users").doc(userAuth.uid).update({
            status: "pending_approval",
            activated_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        const driverSnap = await admin.firestore().collection("drivers").doc(userAuth.uid).get();
        if (driverSnap.exists) {
            await admin.firestore().collection("drivers").doc(userAuth.uid).update({
                status: "pending_approval"
            });
        }

        await admin.firestore().collection("registration_otps").doc(emailLower).delete();

        // AUDIT: Notify Admin for Approval
        await admin.firestore().collection("notifications").add({
            title: "New Enrollment Approval",
            message: `Driver ${emailLower} has verified their OTP and is waiting for account activation.`,
            type: "enrollment",
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            is_read: false,
            role: "admin"
        });

        res.json({ success: true, message: "Verification successful! Pending admin approval." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ALIAS for Android compatibility
exports.completeRegistration = exports.verifyAndActivateAccount;

exports.submitDriverApplication = onRequest({ cors: true }, async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    
    const { email, otp, fullName, phone, vehicleType, plateNumber } = req.body;
    if (!email || !otp || !fullName) return res.status(400).json({ success: false, message: "Missing required fields" });
    
    const emailLower = email.toLowerCase().trim();

    try {
        const db = admin.firestore();

        // 1. Validate OTP
        const otpDoc = await db.collection("registration_otps").doc(emailLower).get();
        if (!otpDoc.exists) return res.status(401).json({ success: false, message: "No verification session found." });

        const otpData = otpDoc.data();
        const incomingHash = crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
        if (otpData.code !== String(otp).trim() && otpData.hash !== incomingHash) {
            return res.status(401).json({ success: false, message: "Invalid OTP code." });
        }

        // 2. Check for a duplicate PENDING application (do NOT check Firebase Auth)
        const existingSnap = await db.collection("driver_applications")
            .where("email", "==", emailLower)
            .where("status", "==", "pending_approval")
            .limit(1).get();

        if (!existingSnap.empty) {
            return res.status(409).json({
                success: false,
                message: "An application for this email is already pending review. Please wait for admin approval."
            });
        }

        // 3. Save the application — NO Firebase Auth account created here
        await db.collection("driver_applications").add({
            full_name: fullName,
            email: emailLower,
            phone: phone || "",
            vehicle_type: vehicleType || "sedan",
            plate_number: plateNumber || "",
            status: "pending_approval",
            submitted_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 4. Delete OTP
        await db.collection("registration_otps").doc(emailLower).delete();

        // 5. Confirm email to the applicant (no credentials yet — admin will create the account)
        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <body style="font-family: Arial, sans-serif; background-color: #0a0e27; padding: 20px;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #1a1f3a; padding: 30px; border-radius: 12px; border: 1px solid #2d3447;">
                    <h2 style="color: #00d4ff; text-align: center;">Application Received!</h2>
                    <p style="color:#b0b8c8;">Hello <strong style="color:#fff;">${fullName}</strong>,</p>
                    <p style="color:#b0b8c8;">Your driver application has been successfully submitted and is now <strong style="color:#00c9a7;">Pending Admin Review</strong>.</p>
                    <p style="color:#b0b8c8;">Once approved, you will receive another email with your login credentials so you can access the Fleetonix system.</p>
                    <p style="color:#6b7280; font-size:12px; margin-top:30px;">If you did not submit this application, please ignore this email.</p>
                </div>
            </body>
            </html>
        `;
        await getMailTransport().sendMail({
            from: '"Fleetonix System" <fleetonix.noreply@gmail.com>',
            to: emailLower,
            subject: "Fleetonix: Application Received — Pending Review",
            html: emailHtml,
        });

        // 6. Notify Admin
        await db.collection("notifications").add({
            title: "New Driver Enrollment",
            message: `New driver application from ${fullName} (${emailLower}) is awaiting your review.`,
            type: "enrollment",
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            is_read: false,
            role: "admin"
        });

        res.json({ success: true, message: "Application submitted! We will email you once your account is ready." });
    } catch (error) {
        logger.error("submitDriverApplication error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
// RESTORED: Admin Delete with Archival
exports.adminDeleteUser = onRequest({ cors: true }, async (req, res) => {
    const caller = await requireRole(req, res, ["super_admin", "admin"]);
    if (!caller) return;
    const { uid, email } = req.body;
    if (!uid) return res.status(400).json({ success: false, message: "UID required" });

    try {
        const db = admin.firestore();
        const userSnap = await db.collection("users").doc(uid).get();
        if (!userSnap.exists) return res.status(404).json({ success: false, message: "User not found" });
        
        const userData = userSnap.data();
        const targetRole = userData.role || userData.user_type;

        // Security Guard: Regular admins can ONLY delete drivers
        if (caller.role !== 'super_admin' && targetRole !== 'driver') {
            return res.status(403).json({ success: false, message: "Forbidden: You can only delete Driver accounts." });
        }

        await db.collection("system_archives").doc(uid).set({
            uid: uid,
            email: email || userData?.email || "unknown",
            user_data: userData,
            archived_at: admin.firestore.FieldValue.serverTimestamp(),
            archived_by: caller.email,
            expires_at: admin.firestore.Timestamp.fromMillis(Date.now() + (30 * 24 * 60 * 60 * 1000))
        });

        await admin.auth().deleteUser(uid).catch(() => {});
        await db.collection("users").doc(uid).delete();
        await db.collection("drivers").doc(uid).delete();
        await db.collection("driver_locations").doc(uid).delete();
        
        res.json({ success: true, message: "User archived for 30 days." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// RESTORED: Scheduler/Trigger logic
exports.onScheduleUpdate = onDocumentUpdated("schedules/{docId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (before.trip_phase !== after.trip_phase) {
    const phase = after.trip_phase;
    const driver = after.driver_name || "Driver";
    const scheduleId = after.schedule_id || event.params.docId;

    let title = ""; let message = "";
    if (phase === "pickup") { title = "Trip Accepted"; message = `${driver} is on the way to pickup. (Schedule #${scheduleId})`; }
    else if (phase === "dropoff") { title = "Passenger Picked Up"; message = `${driver} picked up the passenger.`; }
    else if (phase === "completed") { title = "Trip Completed"; message = `${driver} successfully completed the trip.`; }

    if (title) {
      await admin.firestore().collection("activity").add({
        type: "system", title, message, timestamp: admin.firestore.FieldValue.serverTimestamp(),
        source: "schedules", doc_id: event.params.docId,
      });
    }
  }
});

// RESTORED: Full System Reset
exports.adminClearData = onRequest({ cors: true }, async (req, res) => {
  const caller = await requireRole(req, res, ["super_admin"]);
  if (!caller) return;

  try {
    const db = admin.firestore();
    const batchSize = 500;
    const cols = ["bookings", "schedules", "activity", "accidents", "vehicle_issues", "registration_otps", "otps", "dtr_logs", "vehicle_logs", "driver_locations", "trip_tickets", "otp_codes"];

    for (const col of cols) {
      const snap = await db.collection(col).get();
      for (let i = 0; i < snap.docs.length; i += batchSize) {
        const batch = db.batch();
        snap.docs.slice(i, i + batchSize).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }
    res.json({ success: true, message: "System cleared." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * AUTOMATED FLOW: Notify User on Approval
 */
exports.onUserStatusUpdated = onDocumentUpdated({
  document: "users/{uid}"
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  // Detect transition from 'pending_approval' to 'active'
  if (before.status !== "active" && after.status === "active") {
    logger.log(`User ${event.params.uid} activated. Sending approval email.`);
    
    try {
      const name = after.full_name || "Driver";
      const email = after.email;

      if (!email) {
        logger.error("No email found for user activation notification");
        return;
      }

      await getMailTransport().sendMail({
        from: '"Fleetonix System" <fleetonix.noreply@gmail.com>',
        to: email,
        subject: "Congratulations! Your Fleetonix Account is Active",
        html: getApprovalEmailTemplate(name)
      });
      
      logger.log(`Approval email successfully sent to ${email}`);
    } catch (error) {
      logger.error("Failed to send approval email:", error);
    }
  }
});
// === DTR AUTO-CLOCK OUT LOGIC ===

async function processStaleDTR(db, dtrDoc) {
    const data = dtrDoc.data();
    const driverId = data.driver_id;
    const dateStr = data.date; // e.g. "2026-04-20"

    // 1. Look for last completed trip ticket for this driver on this date
    const tripsSnap = await db.collection("trip_tickets")
        .where("driver_id", "==", driverId)
        .where("status", "==", "completed")
        .orderBy("completed_at", "desc")
        .limit(1)
        .get();

    let resolvedTimeOut = null;
    let fallbackUsed = false;

    if (!tripsSnap.empty) {
        const tripData = tripsSnap.docs[0].data();
        if (tripData.completed_at) {
            resolvedTimeOut = tripData.completed_at;
        }
    }

    // 2. Telemetry Fallback: if no completed trips, find last activity/location ping
    if (!resolvedTimeOut) {
        const activitySnap = await db.collection("activity")
            .where("driver_id", "==", driverId)
            .orderBy("timestamp", "desc")
            .limit(1)
            .get();
        
        if (!activitySnap.empty) {
            resolvedTimeOut = activitySnap.docs[0].data().timestamp;
            fallbackUsed = true;
        } else {
            // Absolute fallback to end of the day if no telemetry found
            const endOfDay = new Date(`${dateStr}T23:59:59Z`);
            resolvedTimeOut = admin.firestore.Timestamp.fromDate(endOfDay);
            fallbackUsed = true;
        }
    }

    // Convert timestamp to string formatted time if needed, or just store the timestamp.
    // Assuming time_in is a string like "08:00 AM", but let's store standard Date object or timestamp
    // and format it for the UI.
    const dateObj = resolvedTimeOut.toDate ? resolvedTimeOut.toDate() : new Date(resolvedTimeOut);
    const formattedTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    await dtrDoc.ref.update({
        time_out: formattedTime,
        status: "system_closed",
        resolved_at: admin.firestore.FieldValue.serverTimestamp(),
        fallback_used: fallbackUsed
    });

    return formattedTime;
}

// Scheduled Function (Runs Daily at 1:00 AM)
exports.autoResolveStaleDTRs = onSchedule("0 1 * * *", async (event) => {
    const db = admin.firestore();
    // Get today's date string
    const today = new Date().toISOString().split('T')[0];

    const staleSnap = await db.collection("dtr_logs")
        .where("time_out", "==", null)
        .where("date", "<", today)
        .get();

    if (staleSnap.empty) {
        logger.log("No stale DTR records found.");
        return;
    }

    let processedCount = 0;
    for (const doc of staleSnap.docs) {
        try {
            await processStaleDTR(db, doc);
            processedCount++;
        } catch (error) {
            logger.error(`Error processing DTR ${doc.id}:`, error);
        }
    }
    logger.log(`Successfully resolved ${processedCount} stale DTR records.`);
});

// Callable HTTP endpoint for Admin manual resolution of a specific driver's record
exports.resolveStaleDTR = onRequest({ cors: true }, async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    const caller = await requireRole(req, res, ["super_admin", "admin"]);
    if (!caller) return;

    const { logId } = req.body;
    if (!logId) return res.status(400).json({ success: false, message: "Missing logId" });

    try {
        const db = admin.firestore();
        const dtrDoc = await db.collection("dtr_logs").doc(logId).get();
        if (!dtrDoc.exists) {
            return res.status(404).json({ success: false, message: "DTR record not found." });
        }

        const resolvedTime = await processStaleDTR(db, dtrDoc);
        res.json({ success: true, message: `Record system_closed with time: ${resolvedTime}` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

exports.forceResetDTR = onRequest({ cors: true }, async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    const caller = await requireRole(req, res, ["super_admin", "admin"]);
    if (!caller) return;

    const { logId, manualTimeOut } = req.body;
    if (!logId || !manualTimeOut) return res.status(400).json({ success: false, message: "Missing fields" });

    try {
        const db = admin.firestore();
        await db.collection("dtr_logs").doc(logId).update({
            time_out: manualTimeOut,
            status: "manual_override",
            overridden_by: caller.email,
            resolved_at: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json({ success: true, message: "DTR manually overridden." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
