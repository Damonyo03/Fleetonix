/* eslint-disable */
// [STABILITY_HOTFIX_PRODUCTION_04-09_V2]
/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated, onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
// const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const axios = require("axios");
const crypto = require("crypto");
const { defineSecret } = require("firebase-functions/params");

// D2: Secret Definitions
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

admin.initializeApp();

// Shared Mail Transport for reusability
const getMailTransport = () => nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "fleetonix.noreply@gmail.com",
    pass: GMAIL_APP_PASSWORD.value(),
  },
});

// D1: Role-Based Access Control Middleware
async function requireRole(req, res, allowedRoles = ["super_admin"]) {
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
    const role = userDoc.data()?.role;
    if (!userDoc.exists || !allowedRoles.includes(role)) {
      res.status(403).json({ success: false, message: "Forbidden: insufficient role" });
      return null;
    }
    return { uid: decoded.uid, role };
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
          <span style="color: #ff6b6b;">This code will expire in 10 minutes.</span>
        </div>
        <div class="otp-container">${otp}</div>
        <div class="content" style="margin-top: 30px;">
          If you didn't request this, you can safely ignore this email.
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Fleetonix Fleet Management. All rights reserved.<br>
          This is an automated system message, please do not reply.
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Premium HTML Template for Account Verified / Welcome
 */
function getWelcomeHtmlTemplate(fullName, email) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background-color: #0a0e27; color: #ffffff; }
        .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #1a1f3a; border-radius: 12px; border: 1px solid #2d3447; }
        .logo { display: block; width: 120px; margin: 0 auto 30px; border-radius: 12px; }
        .header { text-align: center; color: #00c9a7; font-size: 24px; font-weight: 700; margin-bottom: 20px; letter-spacing: 0.5px; }
        .content { text-align: center; color: #b0b8c8; font-size: 16px; line-height: 1.6; margin-bottom: 30px; }
        .btn-container { text-align: center; margin-top: 30px; }
        .btn { background-color: #00d4ff; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block; }
        .footer { text-align: center; margin-top: 40px; color: #6b7280; font-size: 13px; }
        .accent { color: #00d4ff; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="container">
        <img src="https://appfleetonix.web.app/img/logo.jpg" alt="Fleetonix" class="logo">
        <div class="header">Account Verified!</div>
        <div class="content">
          Hello <span class="accent">${fullName}</span>,<br><br>
          Great news! Your Fleetonix account (<span class="accent">${email}</span>) has been officially verified and approved by the Super Administrator.<br><br>
          You are now free to use the application and access all features associated with your role.
        </div>
        <div class="btn-container">
          <a href="https://appfleetonix.web.app/login.html" class="btn">Access Dashboard</a>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Fleetonix Fleet Management. All rights reserved.<br>
          This is an automated system message, please do not reply.
        </div>
      </div>
    </body>
    </html>
  `;
}

setGlobalOptions({ maxInstances: 10 });

/// [LOCATION_SEARCH_PROXY_REMOVED]
// We now use Google Places API directly on the client (web/mobile) via address-autocomplete.js


/**
 * Send Password Reset OTP
 */
exports.sendPasswordResetOTP = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const { email } = req.body;
  if (!email) {
    res.status(400).json({ success: false, message: "Email is required" });
    return;
  }

  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    // Store OTP Hash with expiration (D3)
    await admin.firestore().collection("otps").doc(userRecord.uid).set({
      email: email,
      hash: otpHash,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      expires_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000)),
    });

    const mailOptions = {
      from: '"Fleetonix System" <fleetonix.noreply@gmail.com>',
      to: email,
      subject: "Verification Code: " + otp,
      html: getOTPHtmlTemplate(otp, email),
    };

    const transporter = getMailTransport();
    await transporter.sendMail(mailOptions);

    logger.info(`Generated password reset OTP for ${email}`);
    res.json({ success: true, message: "OTP sent successfully", data: { userId: userRecord.uid, email: email } });
  } catch (error) {
    logger.error("Error sending reset OTP", error);
    // Security: don't reveal if user exists unless explicitly needed
    res.json({ success: true, message: "If an account exists, an OTP has been sent." });
  }
});

/**
 * Reset Password with OTP
 */
exports.resetPasswordWithOTP = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const { userId, otp, newPassword, password } = req.body || {};
  const targetPassword = newPassword || password;

  if (!userId || !otp || !targetPassword) {
    res.status(400).json({ success: false, message: "Missing required fields" });
    return;
  }

  try {
    const otpDoc = await admin.firestore().collection("otps").doc(userId).get();
    if (!otpDoc.exists) {
      res.status(404).json({ success: false, message: "OTP not found or already used." });
      return;
    }

    const data = otpDoc.data();
    const incomingHash = crypto.createHash("sha256").update(otp).digest("hex");

    if (data.hash !== incomingHash) {
      res.status(401).json({ success: false, message: "Invalid OTP code." });
      return;
    }

    if (data.expires_at.toDate() < new Date()) {
      res.status(401).json({ success: false, message: "OTP has expired." });
      return;
    }

    // Update password via Auth
    await admin.auth().updateUser(userId, {
      password: targetPassword,
    });

    // Delete OTP document (safety)
    await admin.firestore().collection("otps").doc(userId).delete();

    res.json({ success: true, message: "Password updated successfully! Please login with your new password." });
  } catch (error) {
    logger.error("Error resetting password", error);
    res.status(500).json({ success: false, message: "Failed to reset password: " + error.message });
  }
});

/**
 * Verify Verification Code (General use)
 */
exports.verifyOTP = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const { userId, otpCode } = req.body || {};

  if (!userId || !otpCode) {
    logger.warn(`VerifyOTP called with missing fields: userId=${userId}, otpCode=${otpCode}`);
    res.status(200).json({ success: false, message: "Missing userId or otpCode" });
    return;
  }

  try {
    const doc = await admin.firestore().collection("otps").doc(userId).get();
    if (!doc.exists) {
      res.json({ success: false, message: "Token expired or not found" });
      return;
    }

    // Hash incoming OTP for comparison
    const incomingHash = crypto.createHash("sha256").update(otpCode).digest("hex");

    if (doc.data().hash === incomingHash) {
      logger.info(`OTP successfully verified for user: ${userId}`);
      res.json({ success: true, message: "OTP verified" });
    } else {
      logger.warn(`Invalid OTP attempt for user: ${userId}`);
      res.json({ success: false, message: "Invalid OTP" });
    }
  } catch (e) {
    logger.error(`Error in verifyOTP for user ${userId}:`, e);
    res.status(500).json({ success: false, message: "Internal Server Error: " + e.message });
  }
});

/**
 * Admin Create User
 */
exports.adminCreateUser = onRequest({ cors: true }, async (req, res) => {
  const caller = await requireRole(req, res, ["super_admin", "admin"]);
  if (!caller) return;

  const { email, password, fullName, role, companyName } = req.body;

  if (!email || !password || !fullName || !role) {
    res.status(400).json({ success: false, message: "Missing required fields: email, password, fullName, and role are required." });
    return;
  }

  // Role Restriction: 
  // 1. Only Super Admin can create other admins or super admins
  // 2. Regular Admins can ONLY create drivers
  if (caller.role !== "super_admin" && role !== "driver") {
    res.status(403).json({ success: false, message: `Forbidden: As an ${caller.role}, you can only create Driver accounts.` });
    return;
  }

  try {
    // Check if user already exists
    try {
      await admin.auth().getUserByEmail(email);
      res.status(400).json({ success: false, message: "User with this email already exists." });
      return;
    } catch (authError) {
      // User doesn't exist, proceed
    }

    // 1. Create Auth User
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: fullName,
    });

    // 2. Create Firestore Document in 'users' collection
    const userData = {
      full_name: fullName,
      email: email.toLowerCase().trim(),
      role: role,
      company_name: "Jettsan",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      user_type: role, // Compatibility for dual-schema
      status: "pending_verification", // Security Stage 1
    };

    await admin.firestore().collection("users").doc(userRecord.uid).set(userData);

    // 3. Special handling for drivers/clients collections
    if (role === "driver") {
      await admin.firestore().collection("drivers").doc(userRecord.uid).set({
        driver_name: fullName,
        driver_email: email.toLowerCase().trim(),
        current_status: "offline",
        status: "pending_verification", // Mirroring user status
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 4. Generate and Send Activation OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    await admin.firestore().collection("registration_otps").doc(email.toLowerCase().trim()).set({
      hash: otpHash,
      email: email.toLowerCase().trim(),
      uid: userRecord.uid,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      expires_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)), // 24h expiration for admin creation
    });

    const mailOptions = {
      from: '"Fleetonix Activation" <fleetonix.noreply@gmail.com>',
      to: email,
      subject: "Fleetonix Account Activation",
      html: getOTPHtmlTemplate(otp, email, true),
    };
    await getMailTransport().sendMail(mailOptions);

    logger.info(`Admin created new ${role}: ${email}. OTP sent for verification.`);
    res.json({ success: true, message: `New ${role} created. Activation OTP sent to ${email}.`, uid: userRecord.uid });
  } catch (error) {
    logger.error("Error creating user", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Verify OTP and Update Password (Step 2 of Admin-Created Users)
 */
exports.verifyAndActivateAccount = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const { email, otp, newPassword } = req.body || {};
  if (!email || !otp || !newPassword) {
    res.status(400).json({ success: false, message: "Missing required fields: email, otp, and newPassword are required." });
    return;
  }

  const emailLower = email.toLowerCase().trim();

  try {
    const otpDoc = await admin.firestore().collection("registration_otps").doc(emailLower).get();
    if (!otpDoc.exists) {
      res.status(400).json({ success: false, message: "Verification code not found or expired." });
      return;
    }

    const storedData = otpDoc.data();
    const incomingHash = crypto.createHash("sha256").update(otp).digest("hex");

    if (storedData.hash !== incomingHash) {
      res.status(400).json({ success: false, message: "Invalid verification code." });
      return;
    }

    // Use email to find user UID
    let uid = storedData.uid;
    if (!uid) {
      const userRec = await admin.auth().getUserByEmail(emailLower);
      uid = userRec.uid;
    }

    // 1. Update Password in Auth
    await admin.auth().updateUser(uid, {
      password: newPassword,
    });

    // 2. Update Status in Firestore
    await admin.firestore().collection("users").doc(uid).update({
      status: "pending_approval",
    });

    // 3. Update Drivers collection if applicable
    const driverSnap = await admin.firestore().collection("drivers").doc(uid).get();
    if (driverSnap.exists) {
      await admin.firestore().collection("drivers").doc(uid).update({
        status: "pending_approval"
      });
    }

    // 4. Cleanup OTP
    await admin.firestore().collection("registration_otps").doc(emailLower).delete();

    logger.info(`User ${emailLower} verified OTP and updated password. Status: pending_approval.`);
    res.json({ success: true, message: "Verification successful! Your account is now pending final Super Admin approval." });
  } catch (error) {
    logger.error("Error in verifyAndActivateAccount", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Admin Delete User
 */
exports.adminDeleteUser = onRequest({ cors: true }, async (req, res) => {
  const caller = await requireRole(req, res, ["super_admin"]);
  if (!caller) return;

  const { uid, email } = req.body;

  if (!uid) {
    res.status(400).json({ success: false, message: "User UID is required." });
    return;
  }

  try {
    const db = admin.firestore();
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : null;

    // Archive data
    const archiveData = {
      uid: uid,
      email: email || (userData ? userData.email : ""),
      user_data: userData,
      archived_at: admin.firestore.FieldValue.serverTimestamp(),
      archived_by: caller.email,
      // Calculation for 30-day expiration (in milliseconds)
      expires_at: admin.firestore.Timestamp.fromMillis(Date.now() + (30 * 24 * 60 * 60 * 1000))
    };

    await db.collection("system_archives").doc(uid).set(archiveData);

    // 1. Delete from Firebase Auth
    try {
      await admin.auth().deleteUser(uid);
      logger.info(`Admin deleted Auth user: ${uid}`);
    } catch (authError) {
      logger.warn(`Auth user ${uid} not found or already deleted:`, authError);
    }

    // 2. Clear Active Collections
    await db.collection("users").doc(uid).delete();
    await db.collection("drivers").doc(uid).delete();
    await db.collection("driver_locations").doc(uid).delete();

    if (email) {
      const emailLower = email.toLowerCase().trim();
      await db.collection("drivers").doc(emailLower).delete();
      await db.collection("driver_locations").doc(emailLower).delete();
    }

    // Notify system
    await db.collection("notifications").add({
      title: "User Archived",
      message: `Account for ${email || uid} has been moved to the Secure Vault. It will be purged in 30 days if not restored.`,
      type: "system",
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.info(`Admin successfully archived user: ${uid}`);
    res.json({ success: true, message: "User account archived to vault for 30 days." });
  } catch (error) {
    logger.error("Error archiving user", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Automated Activity Logger for Trip Phase changes
 */
exports.onScheduleUpdate = onDocumentUpdated("schedules/{docId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  // Only trigger if trip_phase changed
  if (before.trip_phase !== after.trip_phase) {
    const phase = after.trip_phase;
    const driver = after.driver_name || "Driver";
    const scheduleId = after.schedule_id || event.params.docId;

    let title = "";
    let message = "";

    if (phase === "pickup") {
      title = "Trip Accepted";
      message = `${driver} has accepted the booking and is on the way to pickup. (Schedule #${scheduleId})`;
    } else if (phase === "dropoff") {
      title = "Passenger Picked Up";
      message = `${driver} has picked up the passenger. (Schedule #${scheduleId})`;
    } else if (phase === "ready_to_complete") {
      title = "Passenger Dropped Off";
      message = `${driver} has dropped off the passenger at the destination. (Schedule #${scheduleId})`;
    } else if (phase === "completed") {
      title = "Trip Completed";
      message = `${driver} has successfully completed the trip. (Schedule #${scheduleId})`;
    }

    if (title) {
      await admin.firestore().collection("activity").add({
        type: "system",
        title: title,
        message: message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        source: "schedules",
        doc_id: event.params.docId,
      });
      logger.info(`Activity log created for phase: ${phase}`);
    }
  }
});

/**
 * Admin Data Clearing Function
 */
exports.adminClearData = onRequest({ cors: true }, async (req, res) => {
  const caller = await requireRole(req, res, ["super_admin"]);
  if (!caller) return;

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  logger.info("CRITICAL: adminClearData triggered for FULL SYSTEM RESET");

  try {
    const db = admin.firestore();
    const auth = admin.auth();

    // 1. Define ALL collections to wipe
    const allCollections = [
      "users", "drivers", "bookings", "schedules", "activity", "accidents",
      "vehicle_issues", "registration_otps", "otps",
      "dtr_logs", "vehicle_logs", "driver_locations", "trip_tickets", "otp_codes"
    ];
    // NOTE: accredited_companies is PRESERVED so registration works.

    // 2. Perform deletion in batches for every collection
    for (const col of allCollections) {
      const snap = await db.collection(col).get();
      const docs = snap.docs;

      // Delete in chunks of 500
      for (let i = 0; i < docs.length; i += 500) {
        const batch = db.batch();
        const chunk = docs.slice(i, i + 500);
        chunk.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
      logger.info(`Cleared collection: ${col}`);
    }

    // 3. Delete all Auth Users (EXCEPT THE NEW SUPER ADMIN)
    let users = await auth.listUsers(1000);
    while (users.users.length > 0) {
      const uids = users.users.map((u) => u.uid);
      await auth.deleteUsers(uids);
      logger.info(`Deleted batch of ${uids.length} Auth users.`);
      if (users.pageToken) {
        users = await auth.listUsers(1000, users.pageToken);
      } else {
        break;
      }
    }

    // 4. Create the requested Super Admin Account
    const adminEmail = "perezralph15@gmail.com";
    const adminPassword = "admin123";

    const userRecord = await auth.createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: "Super Admin",
      emailVerified: true
    });

    await db.collection("users").doc(userRecord.uid).set({
      full_name: "Super Admin",
      email: adminEmail,
      role: "super_admin",
      user_type: "super_admin",
      status: "active",
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.info("Admin cleared all data and restored super admin: " + adminEmail);
    res.json({
      success: true,
      message: "System reset successful. Super admin account restored.",
      admin_uid: userRecord.uid
    });
  } catch (error) {
    logger.error("Clear data error", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Send Registration OTP (CORS enabled)
 */
exports.sendRegistrationOTP = onRequest({ cors: true }, async (req, res) => {
  logger.info("sendRegistrationOTP called with Nodemailer config v2");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const { email, phone } = req.body || {};
  if (!email && !phone) {
    logger.warn("sendRegistrationOTP called with missing email AND phone.");
    res.status(400).json({ success: false, message: "Email or Phone is required" });
    return;
  }

  const target = (email || phone).toLowerCase().trim();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    if (email) {
      try {
        const userExists = await admin.auth().getUserByEmail(email.toLowerCase().trim());
        if (userExists) {
          logger.warn(`User ${email} already exists in Auth.`);
          res.status(400).json({ success: false, message: "This email is already registered." });
          return;
        }
      } catch (authError) {
        // User doesn't exist in Auth, which is good for registration
      }
    }

    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    await admin.firestore().collection("registration_otps").doc(target).set({
      hash: otpHash,
      email: email ? email.toLowerCase().trim() : null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      expires_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
    });

    if (email) {
      const mailOptions = {
        from: '"Fleetonix Verification" <fleetonix.noreply@gmail.com>',
        to: email,
        subject: "Verification Code: " + otp,
        html: getOTPHtmlTemplate(otp, email, true),
      };
      await getMailTransport().sendMail(mailOptions);
    } else {
      logger.info(`[SMS OTP] To: ${phone}, Code: ${otp}`);
    }

    res.json({ success: true, message: `Verification code sent to ${email ? 'email' : 'phone'}.` });
  } catch (error) {
    logger.error("Error in sendRegistrationOTP", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Complete Registration after OTP verification
 */
exports.completeRegistration = onRequest({ cors: true }, async (req, res) => {
  logger.info("completeRegistration called with Nodemailer config v2");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const { email, phone, otp, userData } = req.body || {};

  if ((!email && !phone) || !otp || !userData) {
    logger.warn(`completeRegistration missing fields: email=${email}, otp=${otp}, userData=${!!userData}`);
    res.status(400).json({ success: false, message: "Missing required fields: email/phone, otp, and userData are required." });
    return;
  }

  // Deep validation of userData
  if (!userData.password || !userData.full_name) {
    logger.warn(`completeRegistration: userData missing password or full_name`);
    res.status(400).json({ success: false, message: "userData must contain password and full_name." });
    return;
  }

  const target = (email || phone).toLowerCase().trim();

  try {
    const otpDoc = await admin.firestore().collection("registration_otps").doc(target).get();
    if (!otpDoc.exists) {
      res.status(400).json({ success: false, message: "OTP not found or expired." });
      return;
    }

    const storedData = otpDoc.data();
    const incomingHash = crypto.createHash("sha256").update(otp).digest("hex");

    if (storedData.hash !== incomingHash) {
      res.status(400).json({ success: false, message: "Invalid verification code." });
      return;
    }

    // 1. Create Auth User with error handling for existing users
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email: email.toLowerCase().trim(),
        password: userData.password,
        displayName: userData.full_name,
      });
      logger.info(`Auth user created for: ${email}`);
    } catch (authError) {
      if (authError.code === 'auth/email-already-exists') {
        res.status(400).json({ success: false, message: "This email is already registered." });
        return;
      }
      throw authError; // Rethrow other errors to be caught by the outer catch
    }

    const role = (userData.role && userData.role.toLowerCase() === "driver") ? "driver" : "driver"; // Default to driver, client removed

    await admin.firestore().collection("users").doc(userRecord.uid).set({
      full_name: userData.full_name,
      email: email.toLowerCase().trim(),
      phone: phone || userData.phone || "",
      company_name: "Jettsan",
      user_type: role,
      status: "pending_approval", // Default to pending for Super Admin approval
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`Firestore user doc created for: ${userRecord.uid}`);

    if (role === "driver") {
      await admin.firestore().collection("drivers").doc(userRecord.uid).set({
        driver_name: userData.full_name,
        driver_email: email.toLowerCase().trim(),
        current_status: "offline",
        status: "pending_approval",
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await admin.firestore().collection("registration_otps").doc(target).delete();
    res.json({ success: true, message: "Account created successfully!", uid: userRecord.uid });
  } catch (error) {
    logger.error("Error in completeRegistration", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Send Welcome Email upon Super Admin Approval
 */
exports.handleUserVerificationSuccess = onDocumentUpdated("users/{uid}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  // Trigger when status changes to 'active'
  if (before.status !== "active" && after.status === "active") {
    try {
      const mailOptions = {
        from: '"Fleetonix System" <fleetonix.noreply@gmail.com>',
        to: after.email,
        subject: "Account Verified - Welcome to Fleetonix",
        html: getWelcomeHtmlTemplate(after.full_name || "User", after.email),
      };

      const transporter = getMailTransport();
      await transporter.sendMail(mailOptions);
      logger.info(`Welcome email successfully sent to ${after.email}`);
    } catch (error) {
      logger.error(`Failed to send welcome email to ${after.email}:`, error);
    }
  }
});

/**
 * Scheduled Cleanup: Purge expired archives after 30 days
 * Runs daily at midnight
 * [DISABLED DUE TO IAM PERMISSIONS BLOCKER]
exports.cleanupExpiredArchives = require("firebase-functions/v2/scheduler").onSchedule("0 0 * * *", async (event) => {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  try {
    const expiredSnap = await db.collection("system_archives")
      .where("expires_at", "<=", now)
      .get();

    if (expiredSnap.empty) {
      logger.info("No expired archives to cleanup today.");
      return;
    }

    const docs = expiredSnap.docs;
    const BATCH_SIZE = 500;
    let purgedCount = 0;

    // Split into chunks of 500 to stay within Firestore WriteBatch limits (C6)
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const chunk = docs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      
      chunk.forEach(doc => {
        batch.delete(doc.ref);
        purgedCount++;
      });

      await batch.commit();
    }

    logger.info(`Successfully purged ${purgedCount} expired archive(s) in ${Math.ceil(purgedCount / BATCH_SIZE)} batch(es).`);
  } catch (error) {
    logger.error("Error cleaning up expired archives", error);
  }
});
*/

