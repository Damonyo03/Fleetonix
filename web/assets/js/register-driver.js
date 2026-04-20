import { app } from "./firebase-init.js";
import { useEmulators } from "./firebase-config.js";

// Cloud Function URLs
const CLOUD_REGION = "us-central1";
const PROJECT_ID = "appfleetonix";
const getFunctionUrl = (functionName) => {
    if (useEmulators) {
        return `http://127.0.0.1:5001/${PROJECT_ID}/${CLOUD_REGION}/${functionName}`;
    }
    return `https://${CLOUD_REGION}-${PROJECT_ID}.cloudfunctions.net/${functionName}`;
};

document.addEventListener('DOMContentLoaded', () => {
    const steps = [
        document.getElementById('step-1'),
        document.getElementById('step-2'),
        document.getElementById('step-3'),
        document.getElementById('step-success')
    ];
    const dots = [
        document.getElementById('dot-1'),
        document.getElementById('dot-2'),
        document.getElementById('dot-3')
    ];
    
    const alertBox = document.getElementById('alertBox');
    const alertMsg = document.getElementById('alertMsg');
    const alertIcon = document.getElementById('alertIcon');
    
    // Form inputs
    const regEmail = document.getElementById('regEmail');
    const regOTP = document.getElementById('regOTP');
    const displayEmail = document.getElementById('displayEmail');
    const regName = document.getElementById('regName');
    const regPhone = document.getElementById('regPhone');
    const regVehicleType = document.getElementById('regVehicleType');
    const regPlate = document.getElementById('regPlate');
    
    // Buttons
    const btnSendOTP = document.getElementById('btnSendOTP');
    const btnVerifyOTP = document.getElementById('btnVerifyOTP');
    const btnSubmitProfile = document.getElementById('btnSubmitProfile');
    const btnBackToEmail = document.getElementById('btnBackToEmail');
    
    let currentEmail = '';
    
    function showAlert(message, type = 'error') {
        alertMsg.textContent = message;
        alertBox.className = 'alert show';
        if (type === 'error') {
            alertBox.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
            alertBox.style.border = '1px solid rgba(255, 107, 107, 0.3)';
            alertBox.style.color = '#ff6b6b';
            alertIcon.className = 'fas fa-exclamation-circle';
        } else {
            alertBox.style.backgroundColor = 'rgba(0, 201, 167, 0.1)';
            alertBox.style.border = '1px solid rgba(0, 201, 167, 0.3)';
            alertBox.style.color = 'var(--accent-teal)';
            alertIcon.className = 'fas fa-check-circle';
        }
    }
    
    function hideAlert() {
        alertBox.className = 'alert';
    }
    
    function showStep(index) {
        steps.forEach(step => step.classList.remove('active'));
        if (steps[index]) steps[index].classList.add('active');
        
        dots.forEach((dot, i) => {
            if (i < index) {
                dot.className = 'step-dot completed';
                dot.innerHTML = '<i class="fas fa-check"></i>';
            } else if (i === index) {
                dot.className = 'step-dot active';
                dot.textContent = i + 1;
            } else {
                dot.className = 'step-dot';
                dot.textContent = i + 1;
            }
        });
    }
    
    // Set loading state on buttons
    function setLoading(btn, isLoading, originalText) {
        if (isLoading) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            btn.disabled = true;
            btn.style.opacity = '0.7';
        } else {
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }

    // Step 1: Request OTP
    btnSendOTP.addEventListener('click', async () => {
        hideAlert();
        const email = regEmail.value.trim().toLowerCase();
        
        if (!email || !email.includes('@')) {
            showAlert('Please enter a valid email address.');
            return;
        }
        
        setLoading(btnSendOTP, true, 'Send Verification Code');
        
        try {
            const response = await fetch(getFunctionUrl('sendRegistrationOTP'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            });
            
            const data = await response.json();
            
            if (data.success) {
                currentEmail = email;
                displayEmail.textContent = email;
                showStep(1);
            } else {
                showAlert(data.message || 'Failed to send OTP. Please try again.');
            }
        } catch (error) {
            console.error('Error sending OTP:', error);
            showAlert('Network error. Please try again later.');
        } finally {
            setLoading(btnSendOTP, false, 'Send Verification Code');
        }
    });
    
    // Step 2: Verify OTP
    btnVerifyOTP.addEventListener('click', () => {
        hideAlert();
        const otp = regOTP.value.trim();
        
        if (otp.length < 6) {
            showAlert('Please enter the 6-digit code.');
            return;
        }
        
        // We actually verify OTP during the final submission to save a backend call and avoid orphaned accounts,
        // but for UX, we just move to the next step. The backend will validate both.
        // Or we could do a pre-check, but let's just proceed to profile for simplicity.
        showStep(2);
    });
    
    btnBackToEmail.addEventListener('click', (e) => {
        e.preventDefault();
        showStep(0);
    });
    
    // Step 3: Submit Profile
    btnSubmitProfile.addEventListener('click', async () => {
        hideAlert();
        
        const fullName = regName.value.trim();
        const phone = regPhone.value.trim();
        const otp = regOTP.value.trim();
        const vehicleType = regVehicleType.value;
        const plateNumber = regPlate.value.trim();
        
        if (!fullName) {
            showAlert('Please enter your full name.');
            return;
        }
        
        setLoading(btnSubmitProfile, true, 'Submit Application');
        
        try {
            const response = await fetch(getFunctionUrl('submitDriverApplication'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: currentEmail,
                    otp: otp,
                    fullName: fullName,
                    phone: phone,
                    vehicleType: vehicleType,
                    plateNumber: plateNumber
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showStep(3); // Success screen
            } else {
                if (data.message.includes('OTP')) {
                    showAlert(data.message);
                    showStep(1); // Go back to OTP step
                } else {
                    showAlert(data.message);
                }
            }
        } catch (error) {
            console.error('Error submitting application:', error);
            showAlert('Network error. Please try again later.');
        } finally {
            setLoading(btnSubmitProfile, false, 'Submit Application');
        }
    });
});
