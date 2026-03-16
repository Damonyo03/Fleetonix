/**
 * Fleettonix - OTP Verification Script
 * Handles OTP input auto-focus and countdown timer
 */

(function() {
    const otpInputs = document.querySelectorAll('.otp-input');
    const countdownElement = document.getElementById('countdown');
    const resendLink = document.getElementById('resendLink');
    
    // Auto-focus and move to next input
    otpInputs.forEach((input, index) => {
        input.addEventListener('input', function(e) {
            // Only allow numbers
            this.value = this.value.replace(/[^0-9]/g, '');
            
            // Move to next input if value entered
            if (this.value && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
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
            }
            // Focus last filled input or next empty
            const nextEmpty = Array.from(otpInputs).findIndex((inp, idx) => idx >= index && !inp.value);
            if (nextEmpty !== -1) {
                otpInputs[nextEmpty].focus();
            } else {
                otpInputs[otpInputs.length - 1].focus();
            }
        });
    });
    
    // Countdown timer (5 minutes = 300 seconds)
    let timeLeft = 300; // 5 minutes in seconds
    const countdownInterval = setInterval(function() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        countdownElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            countdownElement.textContent = 'Expired';
            countdownElement.style.color = 'var(--accent-red, #ff6b6b)';
            // Disable form submission
            document.getElementById('otpForm').querySelector('button[type="submit"]').disabled = true;
            resendLink.style.pointerEvents = 'auto';
        } else {
            timeLeft--;
        }
    }, 1000);
    
    // Form submission - combine OTP inputs
    document.getElementById('otpForm').addEventListener('submit', function(e) {
        const otpArray = Array.from(otpInputs).map(input => input.value).join('');
        if (otpArray.length !== 6) {
            e.preventDefault();
            alert('Please enter all 6 digits of the OTP code');
            return false;
        }
        
        // Add hidden input with combined OTP
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = 'otp_code';
        hiddenInput.value = otpArray;
        this.appendChild(hiddenInput);
    });
    
    // Focus first input on load
    otpInputs[0].focus();
})();

