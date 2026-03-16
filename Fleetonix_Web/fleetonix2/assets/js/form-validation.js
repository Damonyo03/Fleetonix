/**
 * Fleettonix - Enhanced Form Validation
 * Provides real-time validation feedback and better error handling
 */

// Initialize form validation on page load
document.addEventListener('DOMContentLoaded', function() {
    // Add validation to all forms
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        enhanceFormValidation(form);
    });
});

function enhanceFormValidation(form) {
    // Email validation
    const emailInputs = form.querySelectorAll('input[type="email"]');
    emailInputs.forEach(input => {
        input.addEventListener('blur', function() {
            validateEmailField(this);
        });
        
        input.addEventListener('input', function() {
            if (this.classList.contains('error')) {
                validateEmailField(this);
            }
        });
    });
    
    // Phone validation
    const phoneInputs = form.querySelectorAll('input[type="tel"]');
    phoneInputs.forEach(input => {
        input.addEventListener('blur', function() {
            validatePhoneField(this);
        });
        
        input.addEventListener('input', function() {
            // Auto-format phone number
            if (this.value && !this.value.startsWith('+')) {
                const cleaned = this.value.replace(/\D/g, '');
                if (cleaned.length > 0) {
                    this.value = cleaned;
                }
            }
        });
    });
    
    // Password validation
    const passwordInputs = form.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
        if (input.minLength >= 16) {
            input.addEventListener('input', function() {
                validatePasswordField(this);
            });
        }
    });
    
    // Required field validation
    const requiredInputs = form.querySelectorAll('input[required], select[required], textarea[required]');
    requiredInputs.forEach(input => {
        input.addEventListener('blur', function() {
            validateRequiredField(this);
        });
    });
    
    // Form submission validation
    form.addEventListener('submit', function(e) {
        if (!validateForm(form)) {
            e.preventDefault();
            const firstError = form.querySelector('.error');
            if (firstError) {
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                firstError.focus();
            }
        }
    });
}

function validateEmailField(input) {
    const value = input.value.trim();
    const isValid = value === '' || validateEmail(value);
    
    if (!isValid && value !== '') {
        showFieldError(input, 'Please enter a valid email address');
        return false;
    } else {
        clearFieldError(input);
        return true;
    }
}

function validatePhoneField(input) {
    const value = input.value.trim();
    if (value === '') {
        clearFieldError(input);
        return true;
    }
    
    const isValid = validatePhone(value);
    
    if (!isValid) {
        showFieldError(input, 'Please enter a valid Philippine phone number (09XXXXXXXXX or +639XXXXXXXXX)');
        return false;
    } else {
        clearFieldError(input);
        return true;
    }
}

function validatePasswordField(input) {
    const value = input.value;
    const minLength = parseInt(input.minLength) || 16;
    
    if (value.length < minLength) {
        showFieldError(input, `Password must be at least ${minLength} characters long`);
        return false;
    }
    
    // Check password requirements
    const hasUpper = /[A-Z]/.test(value);
    const hasLower = /[a-z]/.test(value);
    const hasNumber = /[0-9]/.test(value);
    const hasSpecial = /[^A-Za-z0-9]/.test(value);
    
    const errors = [];
    if (!hasUpper) errors.push('uppercase letter');
    if (!hasLower) errors.push('lowercase letter');
    if (!hasNumber) errors.push('number');
    if (!hasSpecial) errors.push('special character');
    
    if (errors.length > 0) {
        showFieldError(input, `Password must contain: ${errors.join(', ')}`);
        return false;
    }
    
    clearFieldError(input);
    return true;
}

function validateRequiredField(input) {
    const value = input.value.trim();
    const isValid = value !== '';
    
    if (!isValid) {
        showFieldError(input, 'This field is required');
        return false;
    } else {
        clearFieldError(input);
        return true;
    }
}

function validateForm(form) {
    let isValid = true;
    
    // Validate all required fields
    const requiredInputs = form.querySelectorAll('input[required], select[required], textarea[required]');
    requiredInputs.forEach(input => {
        if (!validateRequiredField(input)) {
            isValid = false;
        }
    });
    
    // Validate email fields
    const emailInputs = form.querySelectorAll('input[type="email"]');
    emailInputs.forEach(input => {
        if (input.value && !validateEmailField(input)) {
            isValid = false;
        }
    });
    
    // Validate phone fields
    const phoneInputs = form.querySelectorAll('input[type="tel"]');
    phoneInputs.forEach(input => {
        if (input.value && !validatePhoneField(input)) {
            isValid = false;
        }
    });
    
    // Validate password fields
    const passwordInputs = form.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
        if (input.value && input.minLength >= 16 && !validatePasswordField(input)) {
            isValid = false;
        }
    });
    
    return isValid;
}

function showFieldError(input, message) {
    clearFieldError(input);
    
    input.classList.add('error');
    input.style.borderColor = '#ff6b6b';
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.textContent = message;
    errorDiv.style.color = '#ff6b6b';
    errorDiv.style.fontSize = '0.85rem';
    errorDiv.style.marginTop = '5px';
    errorDiv.style.display = 'block';
    
    input.parentElement.appendChild(errorDiv);
}

function clearFieldError(input) {
    input.classList.remove('error');
    input.style.borderColor = '';
    
    const errorDiv = input.parentElement.querySelector('.field-error');
    if (errorDiv) {
        errorDiv.remove();
    }
}

