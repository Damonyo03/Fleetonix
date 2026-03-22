/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const {Resend} = require("resend");

admin.initializeApp();

// Initialize Resend
const resend = new Resend("re_MQPM73xJ_6TuEnNX5Sow8Wudfr1zpRpN6");

/**
 * Premium HTML Template for OTP
 */
function getOTPHtmlTemplate(otp, email) {
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
        <div class="header">Password Reset Request</div>
        <div class="content">
          Hello <span class="accent">${email}</span>,<br><br>
          We received a request to reset your password. Use the verification code below to proceed. 
          <span style="color: #ff6b6b;">This code will expire in 5 minutes.</span>
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

setGlobalOptions({maxInstances: 10});

const axios = require("axios");

// LocationIQ API Token (from legacy PHP script)
const LOCATIONIQ_TOKEN = "pk.0b57c3a80ea3c7893de95270b2a3ad50";

/**
 * Address Search Proxy for LocationIQ
 * Replaces legacy PHP api/address_search.php
 */
exports.addressSearch = onRequest(async (req, res) => {
  // Enable CORS
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "GET");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  const query = req.query.q || "";
  const limit = parseInt(req.query.limit || "10");

  if (query.length < 2) {
    res.json([]);
    return;
  }

  try {
    const url = `https://us1.locationiq.com/v1/autocomplete.php?key=${LOCATIONIQ_TOKEN}&q=${encodeURIComponent(query)}&limit=${limit}&dedupe=1&normalizecity=1&countrycodes=ph`;

    const response = await axios.get(url, {
      headers: {
        "Accept-Encoding": "gzip",
      },
    });

    if (response.status !== 200 || !response.data) {
      res.json([]);
      return;
    }

    const results = response.data.map((entry) => {
      const address = entry.address || {};
      const houseNumber = address.house_number || "";
      const street = address.road || address.neighbourhood || "";
      const city = address.city || address.town || address.municipality || address.county || "";
      const province = address.state || address.region || address.province || "";
      const zipCode = address.postcode || "";

      let regionCategory = "Philippines";
      const displayName = entry.display_name || "";
      const ncrKeywords = ["Metro Manila", "NCR", "Manila", "Makati", "Quezon City", "Pasig", "Taguig", "Mandaluyong", "Pasay", "Parañaque", "Las Piñas", "Muntinlupa", "Marikina", "Caloocan", "Malabon", "Navotas", "Valenzuela", "San Juan"];

      if (ncrKeywords.some((kw) => displayName.includes(kw))) {
        regionCategory = "NCR";
      } else if (displayName.includes("Pampanga") || displayName.includes("Angeles") || displayName.includes("San Fernando")) {
        regionCategory = "Pampanga";
      } else if (["Cavite", "Laguna", "Batangas", "Quezon", "Tagaytay"].some((kw) => displayName.includes(kw))) {
        regionCategory = "South Luzon";
      }

      let fullAddress = displayName;
      if (houseNumber && street) {
        const components = [address.suburb, address.city, address.town, address.state, address.postcode, address.country]
            .filter((c) => c);
        fullAddress = `${houseNumber} ${street}, ${components.join(", ")}`;
      }

      return {
        address: fullAddress,
        place_name: displayName,
        lat: parseFloat(entry.lat),
        lng: parseFloat(entry.lon),
        region: regionCategory,
        province: province || regionCategory,
        city: city,
        house_number: houseNumber,
        street: street,
        zip_code: zipCode,
      };
    });

    res.json(results);
  } catch (error) {
    logger.error("LocationIQ API Error", error);
    res.json([]);
  }
});

/**
 * Send Password Reset OTP
 */
exports.sendPasswordResetOTP = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  const {email} = req.body;
  if (!email) {
    res.status(400).json({success: false, message: "Email is required"});
    return;
  }

  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with expiration
    await admin.firestore().collection("otps").doc(userRecord.uid).set({
      email: email,
      otp: otp,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      expires_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000)),
    });

    // Send Email via Resend
    const {data, error} = await resend.emails.send({
      from: "Fleetonix System <noreply@fleetonixapp.com>",
      to: [email],
      subject: "Verification Code: " + otp,
      html: getOTPHtmlTemplate(otp, email),
    });

    if (error) {
      logger.error("Resend Error:", error);
      throw new Error(error.message);
    }

    logger.info(`Generated password reset OTP for ${email}`);
    res.json({success: true, message: "OTP sent successfully", data: {userId: userRecord.uid, email: email}});
  } catch (error) {
    logger.error("Error sending reset OTP", error);
    // Security: don't reveal if user exists unless explicitly needed
    res.json({success: true, message: "If an account exists, an OTP has been sent."});
  }
});

/**
 * Reset Password with OTP
 */
exports.resetPasswordWithOTP = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  const {userId, otp, newPassword} = req.body;
  if (!userId || !otp || !newPassword) {
    res.status(400).json({success: false, message: "Missing required fields"});
    return;
  }

  try {
    const otpDoc = await admin.firestore().collection("otps").doc(userId).get();
    if (!otpDoc.exists) {
      res.status(404).json({success: false, message: "OTP not found or already used."});
      return;
    }

    const data = otpDoc.data();
    if (data.otp !== otp) {
      res.status(401).json({success: false, message: "Invalid OTP code."});
      return;
    }

    if (data.expires_at.toDate() < new Date()) {
      res.status(401).json({success: false, message: "OTP has expired."});
      return;
    }

    // Update password via Auth
    await admin.auth().updateUser(userId, {
      password: newPassword,
    });

    // Delete OTP document (safety)
    await admin.firestore().collection("otps").doc(userId).delete();

    res.json({success: true, message: "Password updated successfully! Please login with your new password."});
  } catch (error) {
    logger.error("Error resetting password", error);
    res.status(500).json({success: false, message: "Failed to reset password: " + error.message});
  }
});

/**
 * Verify Verification Code (General use)
 */
exports.verifyOTP = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  const {userId, otpCode} = req.body;
  if (!userId || !otpCode) {
    res.json({success: false, message: "Missing fields"});
    return;
  }
  try {
    const doc = await admin.firestore().collection("otps").doc(userId).get();
    if (doc.exists && doc.data().otp === otpCode) {
      res.json({success: true, message: "OTP verified"});
    } else {
      res.json({success: false, message: "Invalid OTP"});
    }
  } catch (e) {
    res.json({success: false, message: e.message});
  }
});

/**
 * Admin Create User
 * Safely creates a new Auth user and Firestore document without logging out the admin.
 */
exports.adminCreateUser = onRequest(async (req, res) => {
  // CORS configuration
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const {email, password, fullName, role, companyName} = req.body;

  if (!email || !password || !fullName || !role) {
    res.status(400).json({success: false, message: "Missing required fields: email, password, fullName, and role are required."});
    return;
  }

  try {
    // Check if user already exists
    try {
      await admin.auth().getUserByEmail(email);
      res.status(400).json({success: false, message: "User with this email already exists."});
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
      company_name: companyName || "",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      user_type: role, // Compatibility for dual-schema
    };

    await admin.firestore().collection("users").doc(userRecord.uid).set(userData);

    // 3. Special handling for drivers/clients collections
    if (role === "driver") {
      await admin.firestore().collection("drivers").doc(email.toLowerCase().trim()).set({
        driver_name: fullName,
        driver_email: email.toLowerCase().trim(),
        current_status: "offline",
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    logger.info(`Admin created new ${role}: ${email}`);
    res.json({success: true, message: `New ${role} created successfully.`, uid: userRecord.uid});
  } catch (error) {
    logger.error("Error creating user", error);
    res.status(500).json({success: false, message: error.message});
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
 * Securely deletes transaction data and returns a backup
 */
exports.adminClearData = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const db = admin.firestore();
    const collections = ["schedules", "bookings", "activity", "accidents", "vehicle_issues"];
    const backup = {};

    // 1. Fetch data for backup
    for (const col of collections) {
      const snap = await db.collection(col).get();
      backup[col] = snap.docs.map((d) => ({id: d.id, ...d.data()}));
    }

    // 2. Perform deletion in batches
    for (const col of collections) {
      const snap = await db.collection(col).get();
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    logger.info("Admin cleared all transactional data");
    res.json({
      success: true,
      message: "Data cleared successfully. Backup attached.",
      backup: backup,
    });
  } catch (error) {
    logger.error("Clear data error", error);
    res.status(500).json({success: false, message: error.message});
  }
});
