import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDoc, doc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initLayout } from "./modules/ui.js";

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../login.html';
        return;
    }

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.exists() ? userDoc.data() : { 
            full_name: user.displayName || user.email.split('@')[0],
            email: user.email,
            role: 'client'
        };
        
        const name = userData.full_name || user.email.split('@')[0];
        initLayout('Profile Settings', name);
        fillProfileForm(userData);

        initProfileUpdate();
        initPasswordChange();
    } catch (error) {
        console.error("Error loading profile:", error);
        initLayout('Profile Settings', user.email.split('@')[0]);
    }
});

function fillProfileForm(data) {
    if (data.company_name) document.getElementById('companyName').value = data.company_name;
    if (data.full_name) document.getElementById('fullName').value = data.full_name;
    if (data.phone || data.contact_number) document.getElementById('phone').value = data.phone || data.contact_number;
}

function initProfileUpdate() {
    const form = document.getElementById('profileForm');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        
        try {
            submitBtn.disabled = true;
            submitBtn.innerText = 'Updating...';

            // Use setDoc with merge: true to avoid "No document to update" error
            await setDoc(doc(db, "users", auth.currentUser.uid), {
                company_name: document.getElementById('companyName').value,
                full_name: document.getElementById('fullName').value,
                phone: document.getElementById('phone').value,
                updated_at: new Date()
            }, { merge: true });

            alert("Profile updated successfully!");
            initLayout('Profile Settings', document.getElementById('fullName').value);
        } catch (error) {
            console.error("Profile update error:", error);
            alert("Failed to update profile: " + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Save Profile Updates';
        }
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
            alert("Failed to update password. Check your current password and try again.");
        }
    };
}
