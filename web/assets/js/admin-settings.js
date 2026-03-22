import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDoc, doc, collection, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initLayout } from "./modules/ui.js";

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const name = userDoc.exists() ? userDoc.data().full_name : user.email.split('@')[0];
    initLayout('Settings', name);

    initPasswordChange();
    initClearDataFeature();
});

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
            alert("Failed to update password. Check your current password and try again.");
        }
    };
}

function initClearDataFeature() {
    const clearBtn = document.getElementById('clearDataBtn');
    if (!clearBtn) return;

    clearBtn.onclick = async () => {
        const verify = confirm(
            "WARNING: This will permanently delete all bookings, schedules, and activity logs.\n\nAre you sure you want to proceed? A backup will be downloaded automatically."
        );
        if (!verify) return;

        clearBtn.disabled = true;
        clearBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        try {
            const COLLECTIONS = ["schedules", "bookings", "activity", "accidents", "vehicle_issues"];
            const backup = {};

            // Step 1: Backup — read all data first
            for (const col of COLLECTIONS) {
                const snap = await getDocs(collection(db, col));
                backup[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }

            // Step 2: Download backup JSON before deleting anything
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
            const anchor = document.createElement('a');
            anchor.setAttribute("href", dataStr);
            anchor.setAttribute("download", `fleetonix_backup_${new Date().toISOString().split('T')[0]}.json`);
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();

            // Step 3: Delete all docs in batches (max 500 per Firestore batch)
            for (const col of COLLECTIONS) {
                const snap = await getDocs(collection(db, col));
                const docs = snap.docs;
                for (let i = 0; i < docs.length; i += 500) {
                    const batch = writeBatch(db);
                    docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
            }

            alert("System cleared successfully. Your backup file has been downloaded.");
            window.location.reload();

        } catch (error) {
            console.error("Data clearing failed:", error);
            alert("Failed to clear data: " + error.message);
        } finally {
            clearBtn.disabled = false;
            clearBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Clear All Transactional Data';
        }
    };
}
