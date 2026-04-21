import { auth, db } from "./firebase-init.js";
import { updatePassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('changePasswordForm');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const btnSubmit = document.getElementById('btnSubmit');
    const alertBox = document.getElementById('alertBox');
    const alertMsg = document.getElementById('alertMsg');

    function showAlert(message) {
        alertMsg.textContent = message;
        alertBox.style.display = 'flex';
    }

    // Toggle Password Visibility Logic
    const initToggle = (toggleId, inputId) => {
        const toggle = document.getElementById(toggleId);
        const input = document.getElementById(inputId);
        if (!toggle || !input) return;

        toggle.onclick = () => {
            const isPass = input.type === 'password';
            input.type = isPass ? 'text' : 'password';
            toggle.classList.toggle('fa-eye', !isPass);
            toggle.classList.toggle('fa-eye-slash', isPass);
        };
    };

    initToggle('toggleNewPassword', 'newPassword');
    initToggle('toggleConfirmPassword', 'confirmPassword');

    // Ensure the user is actually authenticated
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'login.html';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        alertBox.style.display = 'none';

        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (newPassword !== confirmPassword) {
            showAlert("Passwords do not match.");
            return;
        }

        const user = auth.currentUser;
        if (!user) {
            showAlert("Session expired. Please log in again.");
            return;
        }

        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        btnSubmit.disabled = true;

        try {
            // Update password in Firebase Auth
            await updatePassword(user, newPassword);

            // Update user document in Firestore to remove the requiresPasswordChange flag
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
                requiresPasswordChange: false
            });

            // Check if they are still pending approval or a driver
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                const userData = userSnap.data();
                if (userData.status === 'pending_approval') {
                    // Sign them out and redirect to login to show the "Pending Approval" message
                    await signOut(auth);
                    window.location.href = 'login.html?activation=pending_approval';
                    return;
                } else if (userData.role === 'driver' || userData.user_type === 'driver') {
                    window.location.href = 'driver-app-download.html';
                    return;
                }
            }

            // If active and an admin, redirect to dashboard
            window.location.href = 'admin/dashboard.html';
        } catch (error) {
            console.error("Error updating password:", error);
            if (error.code === 'auth/requires-recent-login') {
                showAlert("Please log out and log back in before changing your password.");
            } else {
                showAlert("Failed to update password. Please try again.");
            }
            btnSubmit.innerHTML = 'Update Password';
            btnSubmit.disabled = false;
        }
    });
});
