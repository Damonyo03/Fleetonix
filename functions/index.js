/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

const axios = require("axios");
const nodemailer = require("nodemailer");

// SMTP Configuration (User to update with real credentials)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "fleetonix.system@gmail.com",
    pass: "YOUR_APP_PASSWORD",
  },
});

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
      
      if (ncrKeywords.some(kw => displayName.includes(kw))) {
        regionCategory = "NCR";
      } else if (displayName.includes("Pampanga") || displayName.includes("Angeles") || displayName.includes("San Fernando")) {
        regionCategory = "Pampanga";
      } else if (["Cavite", "Laguna", "Batangas", "Quezon", "Tagaytay"].some(kw => displayName.includes(kw))) {
        regionCategory = "South Luzon";
      }

      let fullAddress = displayName;
      if (houseNumber && street) {
        const components = [address.suburb, address.city, address.town, address.state, address.postcode, address.country]
          .filter(c => c);
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

  const { email } = req.body;
  if (!email) {
    res.status(400).json({ success: false, message: "Email is required" });
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
      expires_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000))
    });

    // Send Email
    const mailOptions = {
      from: "Fleetonix System <fleetonix.system@gmail.com>",
      to: email,
      subject: "Fleetonix Password Reset OTP",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2>Password Reset Request</h2>
          <p>You requested to reset your Fleetonix password. Use the 6-digit code below to proceed:</p>
          <div style="background: #f4f4f4; padding: 15px; font-size: 24px; font-weight: bold; text-align: center; border-radius: 8px; letter-spacing: 5px;">
            ${otp}
          </div>
          <p>This code will expire in 5 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `,
    };

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
exports.resetPasswordWithOTP = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  const { userId, otp, newPassword } = req.body;
  if (!userId || !otp || !newPassword) {
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
    if (data.otp !== otp) {
      res.status(401).json({ success: false, message: "Invalid OTP code." });
      return;
    }

    if (data.expires_at.toDate() < new Date()) {
      res.status(401).json({ success: false, message: "OTP has expired." });
      return;
    }

    // Update password via Auth
    await admin.auth().updateUser(userId, {
      password: newPassword
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
exports.verifyOTP = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  const { userId, otpCode } = req.body;
  if (!userId || !otpCode) {
    res.json({ success: false, message: "Missing fields" });
    return;
  }
  try {
    const doc = await admin.firestore().collection("otps").doc(userId).get();
    if (doc.exists && doc.data().otp === otpCode) {
      res.json({ success: true, message: "OTP verified" });
    } else {
      res.json({ success: false, message: "Invalid OTP" });
    }
  } catch (e) { res.json({ success: false, message: e.message }); }
});
