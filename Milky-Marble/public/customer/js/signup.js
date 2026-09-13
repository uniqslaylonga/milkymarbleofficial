document.addEventListener('DOMContentLoaded', () => {
  let currentStep = 1;

  // Form DOM elements
  const signupForm = document.getElementById('signupForm');
  const steps = document.querySelectorAll('.form-step');
  const dots = document.querySelectorAll('.step-dot');
  const serverError = document.getElementById('server-error-msg');
  const submitBtn = document.getElementById('submitBtn');

  // Input fields
  const fullnameInput = document.getElementById('fullname');
  const usernameInput = document.getElementById('username');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirm_password');

  // Error containers
  const fullnameError = document.getElementById('fullname-error');
  const usernameError = document.getElementById('username-error');
  const emailError = document.getElementById('email-error');
  const passwordError = document.getElementById('password-error');
  const confirmPasswordError = document.getElementById('confirm-password-error');

  // Advance step or submit on Enter key press
  signupForm.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (currentStep < 3) {
        if (validateStep(currentStep)) {
          goToStep(currentStep + 1);
        }
      } else {
        handleFinalSubmit();
      }
    }
  });

  // Next step navigation trigger
  document.querySelectorAll('[data-next]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (validateStep(currentStep)) {
        goToStep(currentStep + 1);
      }
    });
  });

  // Previous step navigation trigger
  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      goToStep(currentStep - 1);
    });
  });

  // Switch visible form step and update step indicators
  function goToStep(stepNumber) {
    currentStep = stepNumber;

    steps.forEach((step) => {
      const stepIndex = parseInt(step.getAttribute('data-step'), 10);
      step.hidden = stepIndex !== currentStep;
    });

    dots.forEach((dot) => {
      const dotIndex = parseInt(dot.getAttribute('data-dot'), 10);
      dot.classList.toggle('active', dotIndex <= currentStep);
    });

    clearServerError();
  }

  // Validate fields for steps 1 and 2
  function validateStep(step) {
    let isValid = true;

    if (step === 1) {
      if (!fullnameInput.value.trim()) {
        showFieldError(fullnameError, fullnameInput, 'Full name is required.');
        isValid = false;
      } else {
        clearFieldError(fullnameError, fullnameInput);
      }

      if (!usernameInput.value.trim()) {
        showFieldError(usernameError, usernameInput, 'Username is required.');
        isValid = false;
      } else if (usernameInput.value.trim().length < 3) {
        showFieldError(usernameError, usernameInput, 'Username must be at least 3 characters.');
        isValid = false;
      } else {
        clearFieldError(usernameError, usernameInput);
      }
    }

    if (step === 2) {
      const emailVal = emailInput.value.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailVal) {
        showFieldError(emailError, emailInput, 'Email address is required.');
        isValid = false;
      } else if (!emailRegex.test(emailVal)) {
        showFieldError(emailError, emailInput, 'Please enter a valid email address.');
        isValid = false;
      } else {
        clearFieldError(emailError, emailInput);
      }
    }

    return isValid;
  }

  // Validate passwords on final step
  function validateStep3() {
    let isValid = true;
    const pass = passwordInput.value;
    const confirmPass = confirmPasswordInput.value;

    if (!pass) {
      showFieldError(passwordError, passwordInput, 'Password is required.');
      isValid = false;
    } else if (pass.length < 6) {
      showFieldError(passwordError, passwordInput, 'Password must be at least 6 characters.');
      isValid = false;
    } else {
      clearFieldError(passwordError, passwordInput);
    }

    if (!confirmPass) {
      showFieldError(confirmPasswordError, confirmPasswordInput, 'Please confirm your password.');
      isValid = false;
    } else if (pass !== confirmPass) {
      showFieldError(confirmPasswordError, confirmPasswordInput, 'Passwords do not match.');
      isValid = false;
    } else {
      clearFieldError(confirmPasswordError, confirmPasswordInput);
    }

    return isValid;
  }

  function showFieldError(elem, input, msg) {
    if (elem) elem.innerText = msg;
    if (input) input.style.borderColor = '#ea7b82';
  }

  function clearFieldError(elem, input) {
    if (elem) elem.innerText = '';
    if (input) input.style.borderColor = '';
  }

  function showServerError(msg) {
    if (serverError) {
      serverError.innerText = msg;
      serverError.style.display = 'block';
    }
  }

  function clearServerError() {
    if (serverError) {
      serverError.innerText = '';
      serverError.style.display = 'none';
    }
  }

  // Toggle password field input visibility
  document.querySelectorAll('.toggle-password').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      const eyeOpen = btn.querySelector('.eye-open');
      const eyeClosed = btn.querySelector('.eye-closed');

      if (input.type === 'password') {
        input.type = 'text';
        if (eyeOpen) eyeOpen.style.display = 'block';
        if (eyeClosed) eyeClosed.style.display = 'none';
      } else {
        input.type = 'password';
        if (eyeOpen) eyeOpen.style.display = 'none';
        if (eyeClosed) eyeClosed.style.display = 'block';
      }
    });
  });

  // Submit form trigger handlers
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleFinalSubmit();
  });

  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleFinalSubmit();
    });
  }

  // Submit registration payload to Express backend
  async function handleFinalSubmit() {
    if (!validateStep3()) return;

    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerText = 'Creating account...';
    clearServerError();

    const payload = {
      fullname: fullnameInput.value.trim(),
      username: usernameInput.value.trim(),
      email: emailInput.value.trim(),
      password: passwordInput.value
    };

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || 'Signup failed. Please try again.');
      }

      // Persist user session to localStorage for auto-login
      localStorage.setItem('mm_user', JSON.stringify(result.user));

      // Redirect directly to home portal
      window.location.href = 'home.html?login=success';
    } catch (err) {
      showServerError(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }
});