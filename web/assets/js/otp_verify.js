/**
 * Fleetonix - OTP Verification Script
 * Handles OTP input auto-focus, countdown timer, and resend functionality
 */

(function() {
    const otpInputs = document.querySelectorAll('.otp-input, .otp-box');
    const countdownElement = document.getElementById('countdown') || document.getElementById('timer');
    const resendLink = document.getElementById('resendLink') || document.getElementById('resendOtpBtn');
    const otpForm = document.getElementById('otpForm') || document.getElementById('otpStep');
    const verifyBtn = document.getElementById('verifyOtpBtn') || (otpForm ? otpForm.querySelector('button[type="submit"]') : null);
    
    let countdownInterval;
    let timeLeft = 300; // 5 minutes in seconds

    function startTimer() {
        clearInterval(countdownInterval);
        timeLeft = 300;
        updateTimerDisplay();
        
        // Re-enable form/button
        if (verifyBtn) verifyBtn.disabled = false;
        if (resendLink) {
            resendLink.classList.add('disabled');
            resendLink.style.pointerEvents = 'none';
        }

        countdownInterval = setInterval(function() {
            timeLeft--;
            updateTimerDisplay();
            
            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                if (countdownElement) {
                    countdownElement.textContent = 'Expired';
                    countdownElement.style.color = 'var(--accent-red, #ff6b6b)';
                }
                // Disable form submission
                if (verifyBtn) verifyBtn.disabled = true;
                if (resendLink) {
                    resendLink.classList.remove('disabled');
                    resendLink.style.pointerEvents = 'auto';
                }
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        if (!countdownElement) return;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        countdownElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        countdownElement.style.color = ''; // Reset color
    }

    // Auto-focus and move to next input
    otpInputs.forEach((input, index) => {
        input.addEventListener('input', function(e) {
            // Only allow numbers
            this.value = this.value.replace(/[^0-9]/g, '');
            
            // Visual feedback
            if (this.value) {
                this.classList.add('has-value');
                this.style.borderColor = 'var(--accent-blue, #3b82f6)';
                this.style.boxShadow = '0 0 8px var(--glow-blue, rgba(59, 130, 246, 0.4))';
            } else {
                this.classList.remove('has-value');
                this.style.borderColor = '';
                this.style.boxShadow = '';
            }

            // Move to next input if value entered
            if (this.value && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
            
            // Auto-submit if all filled (optional convenience)
            checkAllFilled();
        });
        
        input.addEventListener('keydown', function(e) {
            // Move to previous input on backspace if current is empty
            if (e.key === 'Backspace' && !this.value && index > 0) {
                otpInputs[index - 1].focus();
            }
        });
        
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
            for (let i = 0; i < pastedData.length && (index + i) < otpInputs.length; i++) {
                otpInputs[index + i].value = pastedData[i];
                otpInputs[index + i].classList.add('has-value');
                otpInputs[index + i].style.borderColor = 'var(--accent-blue, #3b82f6)';
            }
            
            // Focus last filled input or next empty
            const nextEmpty = Array.from(otpInputs).findIndex((inp, idx) => idx >= index && !inp.value);
            if (nextEmpty !== -1) {
                otpInputs[nextEmpty].focus();
            } else {
                otpInputs[otpInputs.length - 1].focus();
            }
            checkAllFilled();
        });
    });

    function checkAllFilled() {
        const otpStr = Array.from(otpInputs).map(input => input.value).join('');
        if (otpStr.length === 6 && verifyBtn) {
            // Visual indicator that it's ready
            verifyBtn.classList.add('pulse');
        } else if (verifyBtn) {
            verifyBtn.classList.remove('pulse');
        }
    }
    
    // Form submission or Button Click - combine OTP inputs
    function combineOtp() {
        return Array.from(otpInputs).map(input => input.value).join('');
    }

    if (otpForm) {
        if (otpForm.tagName === 'FORM') {
            otpForm.addEventListener('submit', function(e) {
                const otpArray = combineOtp();
                if (otpArray.length !== 6) {
                    e.preventDefault();
                    // alert('Please enter all 6 digits of the OTP code');
                    return false;
                }
                
                // For standard forms, add a hidden input
                let hiddenInput = this.querySelector('input[name="otp_code"]');
                if (!hiddenInput) {
                    hiddenInput = document.createElement('input');
                    hiddenInput.type = 'hidden';
                    hiddenInput.name = 'otp_code';
                    this.appendChild(hiddenInput);
                }
                hiddenInput.value = otpArray;
                console.log("OTP Combined (Form):", otpArray);
            });
        }
    }

    // Always ensure the Verify button has the correct listener if it exists
    if (verifyBtn) {
        verifyBtn.addEventListener('click', function(e) {
            const otpArray = combineOtp();
            if (otpArray.length === 6) {
                console.log("OTP Combined (Button):", otpArray);
                // We can emit a custom event or set a global variable if needed
                window.lastCollectedOtp = otpArray;
            }
        });
    }

    // Handle Resend Click
    if (resendLink) {
        resendLink.addEventListener('click', function(e) {
            if (this.classList.contains('disabled')) {
                e.preventDefault();
                return;
            }
            
            // Start the timer again
            startTimer();
            console.log("OTP Resent - Timer Restarted");
            
            // The actual resend logic (API call) should be handled by the parent script 
            // or we can emit a custom event
            const event = new CustomEvent('otp-resend-triggered');
            document.dispatchEvent(event);
        });
    }
    
    // Initialize
    if (otpInputs.length > 0) {
        otpInputs[0].focus();
        startTimer();
    }
})();

