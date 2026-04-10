/* eslint-disable */
// [STABILITY_HOTFIX_PRODUCTION_04-10_V3_MERGED]
/**
 * Fleetonix Core Functions - Consolidated Production Environment
 */

const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated, onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
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
const getMailTransport = () => nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "fleetonix.noreply@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD || "",
  },
});

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
      otp: otp, // Added to support Android app direct Firestore read
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      expires_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 15 * 60 * 1000)),
    });

    await getMailTransport().sendMail({
      from: '"Fleetonix System" <fleetonix.noreply@gmail.com>',
      to: email,
      subject: "Verification Code: " + otp,
      html: getOTPHtmlTemplate(otp, email),
    });

    res.json({ success: true, message: "OTP sent successfully" });
  } catch (error) {
    res.json({ success: true, message: "If an account exists, an OTP has been sent." });
  }
});

exports.resetPasswordWithOTP = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const { userId, otp, newPassword, password } = req.body || {};
  const targetPassword = newPassword || password;

  if (!userId || !otp || !targetPassword) return res.status(400).json({ success: false, message: "Missing required fields" });

  try {
    const otpDoc = await admin.firestore().collection("otps").doc(userId).get();
    if (!otpDoc.exists) return res.status(404).json({ success: false, message: "OTP not found or already used." });

    const data = otpDoc.data();
    const incomingHash = crypto.createHash("sha256").update(otp).digest("hex");

    if (data.hash !== incomingHash) return res.status(401).json({ success: false, message: "Invalid OTP code." });
    if (data.expires_at.toDate() < new Date()) return res.status(401).json({ success: false, message: "OTP has expired." });

    await admin.auth().updateUser(userId, { password: targetPassword });
    await admin.firestore().collection("otps").doc(userId).delete();

    res.json({ success: true, message: "Password updated successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed: " + error.message });
  }
});

// RESTORED: General Verify OTP (Used by legacy app versions)
exports.verifyOTP = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const { userId, otpCode } = req.body || {};
  if (!userId || !otpCode) return res.status(200).json({ success: false, message: "Missing fields" });

  try {
    const doc = await admin.firestore().collection("otps").doc(userId).get();
    if (!doc.exists) return res.json({ success: false, message: "Token expired" });

    const incomingHash = crypto.createHash("sha256").update(otpCode).digest("hex");
    if (doc.data().hash === incomingHash) {
      res.json({ success: true, message: "OTP verified" });
    } else {
      res.json({ success: false, message: "Invalid OTP" });
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
        code: otp,
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
