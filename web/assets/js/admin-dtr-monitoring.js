import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, orderBy, limit, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const dtrLogsBody = document.getElementById('dtrLogsBody');
const dateFilter = document.getElementById('dateFilter');
const rangeFilter = document.getElementById('rangeFilter');
let currentUserData = null;

// Cache for geocoded addresses to minimize API costs
const addressCache = new Map();
const GOOGLE_MAPS_API_KEY = firebaseConfig.apiKey;

// Set default date to today
const today = new Date().toISOString().split('T')[0];
if (dateFilter) dateFilter.value = today;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    currentUserData = userDoc.exists() ? userDoc.data() : { role: 'admin' };
    document.getElementById('adminDisplayName').textContent = currentUserData.full_name || "Administrator";

    initDTRLogs();
});

window.initDTRLogs = function() {
    if (!dtrLogsBody) return;

    const selectedDate = dateFilter.value;
    const rangeType = rangeFilter ? rangeFilter.value : 'day';

    // Parse base selected date limits
    const filterDate = new Date(selectedDate);
    let startLimit = new Date(filterDate);
    let endLimit = new Date(filterDate);

    if (rangeType === 'month') {
        startLimit.setDate(1);
        endLimit = new Date(startLimit.getFullYear(), startLimit.getMonth() + 1, 0);
    } else if (rangeType === 'week') {
        const dayOfWeek = startLimit.getDay(); // 0 is Sunday
        startLimit.setDate(startLimit.getDate() - dayOfWeek);
        endLimit.setDate(startLimit.getDate() + 6);
    }
    // Set absolute time boundaries
    startLimit.setHours(0, 0, 0, 0);
    endLimit.setHours(23, 59, 59, 999);

    let baseQuery = collection(db, "dtr_logs");
    let q = query(baseQuery, orderBy("timestamp", "desc"), limit(500));

    onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs;
        
        const filteredDocs = docs.filter(doc => {
            if (!doc.data().timestamp) return false;
            const logTime = doc.data().timestamp.toDate().getTime();
            return logTime >= startLimit.getTime() && logTime <= endLimit.getTime();
        });

        renderLogs(filteredDocs);
    });
}

function renderLogs(docs) {
    if (docs.length === 0) {
        dtrLogsBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">No records found for this date range.</td></tr>';
        document.getElementById('countClockIn').textContent = 0;
        document.getElementById('countClockOut').textContent = 0;
        document.getElementById('countUniqueDrivers').textContent = 0;
        document.getElementById('countActiveShifts').textContent = 0;
        window.currentDtrExportData = [];
        return;
    }
    
    let clockIns = 0;
    let clockOuts = 0;
    let uniqueDrivers = new Set();
    
    // For export payload parsing
    const exportDataset = [];

    const htmlMap = docs.map(d => {
        const log = d.data();
        const logId = d.id;
        const timestamp = log.timestamp ? log.timestamp.toDate() : new Date();
        const timeString = log.timestamp ? timestamp.toLocaleString() : 'N/A';
        const actionLabel = log.action === 'time_in' ? 'Time In' : 'Time Out';
        
        if (log.action === 'time_in') clockIns++;
        if (log.action === 'time_out') clockOuts++;
        if (log.driver_name) uniqueDrivers.add(log.driver_name);
        
        // Use human-readable GPS name if available, fallback to coordinates string
        let gpsText = log.location_name || log.address || 'Unknown Location';
        const rawCoords = (log.latitude && log.longitude) ? `${log.latitude},${log.longitude}` : null;

        if (gpsText === 'Unknown Location' && rawCoords) {
            gpsText = `<span id="addr-${logId}" class="address-placeholder" data-lat="${log.latitude}" data-lng="${log.longitude}">
                <a href="https://www.google.com/maps?q=${log.latitude},${log.longitude}" target="_blank" class="gps-link">
                    <i class="fas fa-map-marker-alt"></i> ${Number(log.latitude).toFixed(4)}, ${Number(log.longitude).toFixed(4)}
                </a>
            </span>`;
            
            // Trigger async geocode
            resolveAddress(logId, log.latitude, log.longitude);
        }

        exportDataset.push({
            "Driver Name": log.driver_name || 'Driver',
            "Contractor": "Jettsan",
            "Action Status": log.is_overtime ? `${actionLabel} (OT)` : actionLabel,
            "Precision Timestamp": timeString,
            "GPS Location": typeof gpsText === 'string' && gpsText.includes('<a') ? `${Number(log.latitude).toFixed(4)}, ${Number(log.longitude).toFixed(4)}` : gpsText,
            "Audit Notes": log.notes || ''
        });
        
        let systemStatusHtml = '';
        if (log.status === 'system_closed') {
            systemStatusHtml = `<span class="status-badge" style="background: var(--accent-orange); color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 0.75rem;">System Closed</span>`;
            if (log.time_out) {
                systemStatusHtml += `<div style="font-size: 0.75rem; color: var(--accent); margin-top: 4px; cursor: pointer; text-decoration: underline;" onclick="promptForceReset('${logId}')" title="Click to manually edit time out">Out: ${log.time_out}</div>`;
            } else {
                systemStatusHtml += `<br><button onclick="promptForceReset('${logId}')" class="btn btn-secondary" style="font-size: 0.7rem; padding: 4px 8px; margin-top: 5px;">Force Reset</button>`;
            }
        } else if (log.status === 'manual_override') {
            systemStatusHtml = `<span class="status-badge" style="background: var(--accent-purple); color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 0.75rem;">Manual Override</span>`;
            if (log.time_out) {
                systemStatusHtml += `<div style="font-size: 0.75rem; color: var(--accent); margin-top: 4px; cursor: pointer; text-decoration: underline;" onclick="promptForceReset('${logId}')" title="Click to manually edit time out">Out: ${log.time_out}</div>`;
            } else {
                systemStatusHtml += `<br><button onclick="promptForceReset('${logId}')" class="btn btn-secondary" style="font-size: 0.7rem; padding: 4px 8px; margin-top: 5px;">Force Reset</button>`;
            }
        } else if (log.action === 'time_in' && !log.time_out) {
            // Check if it's stale (older than today)
            const logDateStr = log.date || (timestamp && timestamp.toISOString().split('T')[0]);
            const todayStr = new Date().toISOString().split('T')[0];
            if (logDateStr && logDateStr < todayStr) {
                systemStatusHtml = `<span class="status-badge" style="background: var(--accent-red); color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 0.75rem;">Stale Record</span>`;
                systemStatusHtml += `<br><button onclick="autoResolveDTR('${logId}')" class="btn btn-primary" style="font-size: 0.7rem; padding: 4px 8px; margin-top: 5px; margin-right: 5px;">Auto Resolve</button>`;
                systemStatusHtml += `<button onclick="promptForceReset('${logId}')" class="btn btn-secondary" style="font-size: 0.7rem; padding: 4px 8px; margin-top: 5px;" title="Manually input time out">Manual</button>`;
            } else {
                systemStatusHtml = `<span style="color: var(--accent-green); font-size: 0.8rem;">Active Shift</span>`;
                systemStatusHtml += `<br><button onclick="promptForceReset('${logId}')" class="btn btn-secondary" style="font-size: 0.7rem; padding: 4px 8px; margin-top: 5px;">Force Time Out</button>`;
            }
        } else {
            systemStatusHtml = `<span style="color: var(--text-muted); font-size: 0.8rem;">Normal</span>`;
        }

        return `
            <tr>
                <td style="font-weight: 600;">${log.driver_name || 'Driver'}</td>
                <td><span style="font-size: 0.85em; color: var(--text-muted);">Jettsan</span></td>
                <td>
                    <span class="status-pill status-${log.action}">${actionLabel}</span>
                    ${log.is_overtime ? '<span class="ot-badge">OVERTIME</span>' : ''}
                </td>
                <td>${timeString}</td>
                <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${typeof gpsText === 'string' && !gpsText.includes('<a') ? gpsText : ''}">${gpsText}</td>
                <td>${systemStatusHtml}</td>
            </tr>
        `;
    }).join('');
    
    // Bind data array
    dtrLogsBody.innerHTML = htmlMap;
    window.currentDtrExportData = exportDataset;
    
    // Update metric cards
    document.getElementById('countClockIn').textContent = clockIns;
    document.getElementById('countClockOut').textContent = clockOuts;
    document.getElementById('countUniqueDrivers').textContent = uniqueDrivers.size;
    document.getElementById('countActiveShifts').textContent = Math.max(0, clockIns - clockOuts);
}

if (dateFilter) dateFilter.addEventListener('change', initDTRLogs);
if (rangeFilter) rangeFilter.addEventListener('change', initDTRLogs);

/**
 * ── Reverse Geocoding Core ─────────────────────────────────────────────
 */
async function resolveAddress(logId, lat, lng) {
    const coordsKey = `${lat},${lng}`;
    
    // 1. Check Cache
    if (addressCache.has(coordsKey)) {
        updateAddressUI(logId, addressCache.get(coordsKey));
        return;
    }

    try {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`);
        const data = await response.json();
        
        if (data.status === 'OK' && data.results.length > 0) {
            const address = data.results[0].formatted_address;
            addressCache.set(coordsKey, address);
            updateAddressUI(logId, address);
        } else {
            console.warn("Geocode status:", data.status);
        }
    } catch (error) {
        console.error("Geocoding failed:", error);
    }
}

function updateAddressUI(logId, address) {
    const el = document.getElementById(`addr-${logId}`);
    if (el) {
        el.innerHTML = `<span title="${address}" style="cursor:help;">${address}</span>`;
    }
}

/**
 * ── DTR Resolution Actions ─────────────────────────────────────────────
 */
const CLOUD_REGION = "us-central1";
const PROJECT_ID = "appfleetonix";
// Assume useEmulators is false for production admin panel, or fetch it if needed.
const useEmulators = false; 
const getFunctionUrl = (functionName) => {
    if (useEmulators) {
        return `http://127.0.0.1:5001/${PROJECT_ID}/${CLOUD_REGION}/${functionName}`;
    }
    return `https://${CLOUD_REGION}-${PROJECT_ID}.cloudfunctions.net/${functionName}`;
};

window.autoResolveDTR = async function(logId) {
    if (!confirm("Are you sure you want the system to auto-resolve this stale record by checking their last trip/GPS ping?")) return;

    try {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch(getFunctionUrl('resolveStaleDTR'), {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ logId })
        });
        
        const data = await response.json();
        if (data.success) {
            alert(data.message);
        } else {
            alert("Failed to auto-resolve: " + data.message);
        }
    } catch (error) {
        console.error("Auto-resolve error:", error);
        alert("Network error occurred.");
    }
};

window.promptForceReset = async function(logId) {
    const manualTime = prompt("Enter the correct Time Out (e.g. '05:30 PM'):");
    if (!manualTime) return;

    try {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch(getFunctionUrl('forceResetDTR'), {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ logId, manualTimeOut: manualTime })
        });
        
        const data = await response.json();
        if (data.success) {
            alert("Record successfully updated.");
        } else {
            alert("Update failed: " + data.message);
        }
    } catch (error) {
        console.error("Force reset error:", error);
        alert("Network error occurred.");
    }
};
