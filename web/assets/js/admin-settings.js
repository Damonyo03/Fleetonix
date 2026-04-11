import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDoc, doc, collection, getDocs, writeBatch, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initLayout } from "./modules/ui.js";

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : { role: 'admin' };
    const name = userData.full_name || user.email.split('@')[0];
    initLayout('Settings', name);

    // Super Admin restriction for Maintenance
    const maintenanceSection = document.getElementById('maintenanceSection');
    if (maintenanceSection && (userData.role === 'super_admin' || userData.user_type === 'super_admin')) {
        maintenanceSection.style.display = 'block';
    }

    initMfaToggle(user.uid);
    initPasswordChange();
    initClearDataFeature();
    initRestoreFeature();
});

function initMfaToggle(uid) {
    const toggle = document.getElementById('mfaToggle');
    if (!toggle) return;

    // Load current state
    getDoc(doc(db, "users", uid)).then(snap => {
        if (snap.exists() && snap.data().mfa_enabled) {
            toggle.checked = true;
        }
    });

    toggle.onchange = async () => {
        await updateDoc(doc(db, "users", uid), { mfa_enabled: toggle.checked });
        alert(`MFA has been ${toggle.checked ? 'ENABLED' : 'DISABLED'}. This will take effect on next login.`);
    };
}

function initPasswordChange() {
    const form = document.getElementById('passwordForm');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const currentPass = document.getElementById('currentPassword').value;
        const newPass = document.getElementById('newPassword').value;
        const confirmPass = document.getElementById('confirmPassword').value;

        if (newPass !== confirmPass) {
            alert("New passwords do not match.");
            return;
        }

        const user = auth.currentUser;
        const credential = EmailAuthProvider.credential(user.email, currentPass);

        try {
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPass);
            alert("Password updated successfully!");
            form.reset();
        } catch (error) {
            console.error("Password update error:", error);
            alert("Failed to update password. Check your current password.");
        }
    };
}

function initClearDataFeature() {
    const clearBtn = document.getElementById('clearDataBtn');
    if (!clearBtn) return;

    clearBtn.onclick = async () => {
        const verify = confirm("WARNING: This will permanently delete all bookings, schedules, and tickets.\n\nA backup will be downloaded first. Proceed?");
        if (!verify) return;

        clearBtn.disabled = true;
        clearBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing Backup...';

        try {
            const COLLECTIONS = ["schedules", "bookings", "activity", "driver_activity", "driver_locations", "notifications", "accidents", "trip_tickets", "dtr_logs", "incidents"];
            const backup = { version: "1.0", timestamp: new Date().toISOString(), data: {} };

            for (const col of COLLECTIONS) {
                const snap = await getDocs(collection(db, col));
                backup.data[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
            const anchor = document.createElement('a');
            anchor.setAttribute("href", dataStr);
            anchor.setAttribute("download", `fleetonix_factory_backup_${new Date().toISOString().split('T')[0]}.json`);
            anchor.click();

            // Perform wipe
            for (const col of COLLECTIONS) {
                const snap = await getDocs(collection(db, col));
                const docs = snap.docs;
                for (let i = 0; i < docs.length; i += 500) {
                    const batch = writeBatch(db);
                    docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
            }

            alert("Factory reset complete. System is now clear.");

            // Final log
            await addDoc(collection(db, "activity"), {
                type: 'security',
                title: 'Factory Reset Performed',
                message: `Admin initiated a full system reset and wiped all operational data.`,
                timestamp: serverTimestamp()
            });

            window.location.reload();
        } catch (error) {
            alert("Reset failed: " + error.message);
        } finally {
            clearBtn.disabled = false;
        }
    };
}

function initRestoreFeature() {
    const restoreBtn = document.getElementById('restoreDataBtn');
    const fileInput = document.getElementById('restoreFileInput');
    if (!restoreBtn || !fileInput) return;

    restoreBtn.onclick = () => fileInput.click();

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const backup = JSON.parse(event.target.result);
                if (!backup.data || typeof backup.data !== 'object') throw new Error("Invalid backup format.");

                const confirmRestore = confirm(`Found backup from ${backup.timestamp}.\n\nThis will restore operational data. Duplicate records will be overwritten. Proceed?`);
                if (!confirmRestore) return;

                restoreBtn.disabled = true;
                restoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restoring Database...';

                for (const [colName, docs] of Object.entries(backup.data)) {
                    if (!Array.isArray(docs)) continue;
                    
                    for (let i = 0; i < docs.length; i += 400) {
                        const batch = writeBatch(db);
                        docs.slice(i, i + 400).forEach(d => {
                            const { id, ...data } = d;
                            // Convert back timestamps if they were serialized
                            const cleanData = {};
                            for (const key in data) {
                                if (data[key] && data[key].seconds) {
                                    cleanData[key] = data[key]; // Firestore handles plain objects with seconds/nanoseconds sometimes
                                } else {
                                    cleanData[key] = data[key];
                                }
                            }
                            batch.set(doc(db, colName, id), cleanData);
                        });
                        await batch.commit();
                    }
                }

                alert("System restoration successful!");
                window.location.reload();
            } catch (err) {
                alert("Restore failed: " + err.message);
                console.error(err);
            } finally {
                restoreBtn.disabled = false;
                restoreBtn.innerHTML = '<i class="fas fa-file-import"></i> Restore from JSON Backup';
            }
        };
        reader.readAsText(file);
    };
}

