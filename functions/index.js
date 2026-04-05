/* eslint-disable */
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
const {onDocumentUpdated, onDocumentCreated, onDocumentDeleted} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const axios = require("axios");

admin.initializeApp();

// Initialize Nodemailer
const mailTransport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "fleetonix.noreply@gmail.com",
    pass: "uhaugdxsaycurjxl",
  },
});

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

setGlobalOptions({maxInstances: 10});

// LocationIQ API Token (from legacy PHP script)
const LOCATIONIQ_TOKEN = "pk.0b57c3a80ea3c7893de95270b2a3ad50";

/**
 * Address Search Proxy for LocationIQ
 * Replaces legacy PHP api/address_search.php
 */
exports.addressSearch = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") {
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
exports.sendPasswordResetOTP = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") {
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

    // Send Email via Nodemailer
    const mailOptions = {
      from: '"Fleetonix System" <fleetonix.noreply@gmail.com>',
      to: email,
      subject: "Verification Code: " + otp,
      html: getOTPHtmlTemplate(otp, email),
    };
    await mailTransport.sendMail(mailOptions);

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
exports.resetPasswordWithOTP = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const {userId, otp, newPassword, password} = req.body || {};
  const targetPassword = newPassword || password;
  
  if (!userId || !otp || !targetPassword) {
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
      password: targetPassword,
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
exports.verifyOTP = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const {userId, otpCode} = req.body || {};
  
  if (!userId || !otpCode) {
    logger.warn(`VerifyOTP called with missing fields: userId=${userId}, otpCode=${otpCode}`);
    res.status(200).json({success: false, message: "Missing userId or otpCode"});
    return;
  }

  try {
    const doc = await admin.firestore().collection("otps").doc(userId).get();
    if (doc.exists && doc.data().otp === otpCode) {
      logger.info(`OTP successfully verified for user: ${userId}`);
      res.json({success: true, message: "OTP verified"});
    } else {
      logger.warn(`Invalid OTP attempt for user: ${userId}`);
      res.json({success: false, message: "Invalid OTP"});
    }
  } catch (e) {
    logger.error(`Error in verifyOTP for user ${userId}:`, e);
    res.status(500).json({success: false, message: "Internal Server Error: " + e.message});
  }
});

/**
 * Admin Create User
 * Safely creates a new Auth user and Firestore document without logging out the admin.
 */
exports.adminCreateUser = onRequest({ cors: true }, async (req, res) => {
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
      accredited_company_id: req.body.accredited_company_id || "",
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
        accredited_company_id: req.body.accredited_company_id || "", // FIXED: Ensuring trigger picks this up
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
 * Admin Delete User
 * Safely removes a user from Firebase Auth and Firestore.
 */
exports.adminDeleteUser = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const {uid, email} = req.body;

  if (!uid) {
    res.status(400).json({success: false, message: "User UID is required."});
    return;
  }

  try {
    // 1. Delete from Firebase Auth
    try {
      await admin.auth().deleteUser(uid);
      logger.info(`Admin deleted Auth user: ${uid}`);
    } catch (authError) {
      logger.warn(`Auth user ${uid} not found or already deleted:`, authError);
      // Proceed to firestore deletion anyway to be safe
    }

    // 2. Delete from Users Collection
    await admin.firestore().collection("users").doc(uid).delete();

    // 3. Special handling for drivers collection (using email as ID per legacy schema)
    if (email) {
      const emailLower = email.toLowerCase().trim();
      await admin.firestore().collection("drivers").doc(emailLower).delete();
      await admin.firestore().collection("driver_locations").doc(emailLower).delete();
    } else {
      // Try to find driver by UID if email not provided
      const driverSnap = await admin.firestore().collection("drivers").doc(uid).get();
      if (driverSnap.exists) {
        const d = driverSnap.data();
        if (d.driver_email) {
          await admin.firestore().collection("driver_locations").doc(d.driver_email.toLowerCase().trim()).delete();
        }
        await admin.firestore().collection("drivers").doc(uid).delete();
      }
    }

    // 4. Create System Notification
    await admin.firestore().collection("notifications").add({
      type: "system",
      title: "User Account Purged",
      message: `Super Admin permanently deleted user account: ${email || uid}`,
      status: "unread",
      priority: "high",
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.info(`Admin successfully purged user: ${uid}`);
    res.json({success: true, message: "User account purged successfully."});
  } catch (error) {
    logger.error("Error deleting user", error);
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
exports.adminClearData = onRequest({ cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

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
    res.status(500).json({success: false, message: error.message});
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

    await admin.firestore().collection("registration_otps").doc(target).set({
      otp: otp,
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
      await mailTransport.sendMail(mailOptions);
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
    if (storedData.otp !== otp) {
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

    const role = (userData.role && userData.role.toLowerCase() === "driver") ? "driver" : "client";

    await admin.firestore().collection("users").doc(userRecord.uid).set({
      full_name: userData.full_name,
      email: email.toLowerCase().trim(),
      phone: phone || userData.phone || "",
      company_name: userData.company_name || "",
      accredited_company_id: userData.accredited_company_id || "",
      user_type: role,
      status: "active",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`Firestore user doc created for: ${userRecord.uid}`);

    if (role === "driver") {
      await admin.firestore().collection("drivers").doc(email.toLowerCase().trim()).set({
        driver_name: userData.full_name,
        driver_email: email.toLowerCase().trim(),
        accredited_company_id: userData.accredited_company_id || "", // FIXED: Ensuring trigger picks this up
        current_status: "offline",
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
 * AUTOMATED COUNTERS: Driver triggers for accredited_companies list
 */

// 1. Increment total_drivers on company list
exports.onDriverCreated = onDocumentCreated("drivers/{driverId}", async (event) => {
  const data = event.data.data();
  const companyId = data.accredited_company_id;
  
  if (companyId) {
    const companyRef = admin.firestore().collection("accredited_companies").doc(companyId);
    try {
      await admin.firestore().runTransaction(async (t) => {
        const doc = await t.get(companyRef);
        if (doc.exists) {
          const currentCount = doc.data().total_drivers || 0;
          t.update(companyRef, { total_drivers: currentCount + 1, updated_at: admin.firestore.FieldValue.serverTimestamp() });
        }
      });
      logger.info(`Automated: Incremented total_drivers for company ${companyId}`);
    } catch (e) {
      logger.error(`Error incrementing driver count for company ${companyId}`, e);
    }
  }
});

// 2. Decrement total_drivers on company list
exports.onDriverDeleted = onDocumentDeleted("drivers/{driverId}", async (event) => {
  const data = event.data.data();
  const companyId = data.accredited_company_id;
  
  if (companyId) {
    const companyRef = admin.firestore().collection("accredited_companies").doc(companyId);
    try {
      await admin.firestore().runTransaction(async (t) => {
        const doc = await t.get(companyRef);
        if (doc.exists) {
          const currentCount = doc.data().total_drivers || 0;
          const newCount = Math.max(0, currentCount - 1);
          t.update(companyRef, { total_drivers: newCount, updated_at: admin.firestore.FieldValue.serverTimestamp() });
        }
      });
      logger.info(`Automated: Decremented total_drivers for company ${companyId}`);
    } catch (e) {
      logger.error(`Error decrementing driver count for company ${companyId}`, e);
    }
  }
});

// 3. Update total_drivers when company changes for a driver
exports.onDriverCompanyUpdated = onDocumentUpdated("drivers/{driverId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (before.accredited_company_id !== after.accredited_company_id) {
    const oldId = before.accredited_company_id;
    const newId = after.accredited_company_id;
    const db = admin.firestore();

    if (oldId) {
      const oldRef = db.collection("accredited_companies").doc(oldId);
      await db.runTransaction(async (t) => {
        const doc = await t.get(oldRef);
        if (doc.exists) t.update(oldRef, { total_drivers: Math.max(0, (doc.data().total_drivers || 0) - 1) });
      });
    }

    if (newId) {
      const newRef = db.collection("accredited_companies").doc(newId);
      await db.runTransaction(async (t) => {
        const doc = await t.get(newRef);
        if (doc.exists) t.update(newRef, { total_drivers: (doc.data().total_drivers || 0) + 1 });
      });
    }
    logger.info(`Automated: Migrated driver count from ${oldId} to ${newId}`);
  }
});
