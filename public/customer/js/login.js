document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const usernameError = document.getElementById('username-error');
  const passwordError = document.getElementById('password-error');
  const serverError = document.getElementById('server-error-msg');
  const submitBtn = document.getElementById('submitBtn');

  // SweetAlert modal wrapper
  function showSweetAlert(options) {
    if (typeof Swal === 'undefined') return Promise.resolve({ isConfirmed: false });

    return Swal.fire({
      target: document.body,
      customClass: {
        container: 'mm-swal-container-top',
        popup: 'mm-swal-popup',
        title: 'mm-swal-title',
        htmlContainer: 'mm-swal-html',
        actions: 'mm-swal-actions',
        confirmButton: 'mm-swal-confirm-btn',
        cancelButton: 'mm-swal-cancel-btn'
      },
      buttonsStyling: false,
      ...options
    });
  }

  // Toggle password input visibility
  document.querySelectorAll('.toggle-password').forEach((btn) => {
    btn.addEventListener('click', () => {
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

  // Handle post-logout query parameters
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('logged_out') === '1') {
    showSweetAlert({
      title: 'Logged Out!',
      text: 'You have been safely logged out. See you again soon!',
      icon: 'success',
      confirmButtonText: 'Sweet'
    });
    cleanUrl();
  }

  // Clean URL parameters without reloading
  function cleanUrl() {
    const clean = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({ path: clean }, '', clean);
  }

  // Toggle input field error message state
  function setFieldError(input, errorEl, message) {
    if (errorEl) errorEl.textContent = message;
    if (input) input.closest('.input-wrap').classList.toggle('has-error', !!message);
  }

  // Handle login submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let valid = true;
    const userInput = usernameInput.value.trim();
    const passInput = passwordInput.value;

    if (!userInput) {
      setFieldError(usernameInput, usernameError, 'Please enter your username or email.');
      valid = false;
    } else {
      setFieldError(usernameInput, usernameError, '');
    }

    if (!passInput) {
      setFieldError(passwordInput, passwordError, 'Please enter your password.');
      valid = false;
    } else {
      setFieldError(passwordInput, passwordError, '');
    }

    if (!valid) {
      showSweetAlert({
        title: 'Missing Fields',
        text: 'Please enter both your username/email and password to continue.',
        icon: 'warning',
        confirmButtonText: 'Got It'
      });
      return;
    }

    const originalBtn = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerText = 'Logging in...';
    if (serverError) serverError.style.display = 'none';

    try {
      // Authenticate against Express backend
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_or_email: userInput,
          password: passInput
        })
      });

      const textData = await response.text();
      let result;

      try {
        result = JSON.parse(textData);
      } catch (parseErr) {
        throw new Error(`Server error (${response.status}): Expected JSON response.`);
      }

      if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || 'Invalid username or password.');
      }

      // Persist authenticated customer payload
      localStorage.setItem('mm_user', JSON.stringify(result.user));

      // Redirect to home dashboard
      window.location.href = 'home.html?login=success';

    } catch (err) {
      if (serverError) {
        serverError.textContent = err.message;
        serverError.style.display = 'block';
      }
      showSweetAlert({
        title: 'Login Failed',
        text: err.message,
        icon: 'error',
        confirmButtonText: 'Try Again'
      });
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtn;
    }
  });

  // Initialize Google OAuth client
  if (typeof google !== 'undefined') {
    google.accounts.id.initialize({
      client_id: "661579582958-k9te98cv15osgvqeojgshcvvvdguatfc.apps.googleusercontent.com",
      callback: handleGoogleCredentialResponse,
      auto_select: false
    });

    const hiddenDiv = document.getElementById('googleButtonHidden');
    if (hiddenDiv) {
      google.accounts.id.renderButton(hiddenDiv, {
        type: 'standard',
        shape: 'rectangular',
        theme: 'outline',
        text: 'signin_with',
        size: 'large'
      });
    }
  }

  // Handle Google OAuth callback
  async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) return;

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.message || 'Google sign-in failed.');
      }

      localStorage.setItem('mm_user', JSON.stringify(data.user));
      window.location.href = 'home.html?login=success';
    } catch (err) {
      showSweetAlert({
        title: 'Google Sign-In Error',
        text: err.message,
        icon: 'error',
        confirmButtonText: 'OK'
      });
    }
  }
});