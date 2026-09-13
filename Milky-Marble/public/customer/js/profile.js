// public/customer/js/profile.js
let currentUser = null;
let resendTimer = null;

const ProfileSwal = Swal.mixin({
    customClass: {
        popup: 'custom-swal-popup',
        title: 'custom-swal-title',
        htmlContainer: 'custom-swal-html',
        confirmButton: 'custom-swal-confirm',
        cancelButton: 'custom-swal-cancel'
    },
    buttonsStyling: false
});

document.addEventListener('DOMContentLoaded', () => {
    loadProfileDetails();
    setupProfileForm();
});

// Kumuha ng datos mula sa Supabase via Backend API
async function loadProfileDetails() {
    const localUser = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const customerId = localUser.customer_id || 11;

    try {
        const res = await fetch(`/api/customer/profile?customer_id=${customerId}`);

        if (res.status === 401) {
            window.location.href = 'customerlogin.html?error=login_required';
            return;
        }

        const result = await res.json();

        if (result.status === 'success' && (result.data || result.customer)) {
            currentUser = result.data || result.customer;
            populateProfileFields(currentUser);
        } else {
            ProfileSwal.fire({
                icon: 'error',
                title: 'Data Not Found',
                text: result.message || 'Could not find your profile in the database.'
            });
        }
    } catch (err) {
        console.error('Failed to load profile details:', err);
        ProfileSwal.fire({
            icon: 'error',
            title: 'Connection Error',
            text: 'Unable to connect to the server to fetch your profile.'
        });
    }
}

// I-populate ang totoong database fields sa input elements
function populateProfileFields(data) {
    const user = data.users || data;

    if (user.avatar) {
        document.getElementById('avatarRoundPreview').src = user.avatar;
        const navAvatar = document.querySelector('.nav-avatar-img-badge');
        if (navAvatar) navAvatar.src = user.avatar;
    }

    document.getElementById('full_name').value = user.full_name || '';
    document.getElementById('profileCurrentEmailDisplay').value = user.email || '';

    // Contact number mula sa customers table
    const phoneValue = data.phone || data.phone_number || user.phone || user.phone_number || '';
    document.getElementById('phone').value = phoneValue;

    const usernameInput = document.getElementById('username');
    const hintText = document.getElementById('usernameHintText');
    usernameInput.value = user.username || '';

    // 30-Day Username Cooldown Logic
    const cooldownDays = 30;
    const lastUpdateVal = user.last_username_update || data.last_username_update;

    if (lastUpdateVal) {
        const lastUpdate = new Date(lastUpdateVal);
        const now = new Date();
        const diffMs = now - lastUpdate;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < cooldownDays) {
            const daysRemaining = cooldownDays - diffDays;
            
            usernameInput.disabled = true;
            usernameInput.readOnly = true;
            usernameInput.style.backgroundColor = '#F4EBE6';
            usernameInput.style.cursor = 'not-allowed';
            usernameInput.style.borderColor = '#DBCBC4';
            usernameInput.style.color = '#8A7368';
            
            hintText.textContent = `Username can be updated again in ${daysRemaining} day(s).`;
            hintText.style.color = '#E27D80';
            hintText.style.fontWeight = '700';
        } else {
            unlockUsernameInput(usernameInput, hintText);
        }
    } else {
        unlockUsernameInput(usernameInput, hintText);
    }
}

function unlockUsernameInput(input, hint) {
    input.disabled = false;
    input.readOnly = false;
    input.style.backgroundColor = '#FFFFFF';
    input.style.cursor = 'text';
    input.style.borderColor = '#D4C8C1';
    input.style.color = 'var(--text-dark)';
    hint.textContent = 'You can change your username once every 30 days.';
    hint.style.color = 'var(--text-muted)';
    hint.style.fontWeight = '500';
}

function previewAvatar(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const avatarDataUrl = e.target.result;
            document.getElementById('avatarRoundPreview').src = avatarDataUrl;
            
            const navAvatar = document.querySelector('.nav-avatar-img-badge');
            if (navAvatar) navAvatar.src = avatarDataUrl;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function openEmailChangeModal() {
    document.getElementById('modalNewEmailInput').value = '';
    document.getElementById('modalOtpCodeInput').value = '';
    document.getElementById('emailChangeModal').classList.add('active');
    document.getElementById('modalNewEmailInput').focus();
}

function closeEmailChangeModal(event) {
    if (event && event.target && event.target.id !== 'emailChangeModal' && !event.target.classList.contains('mm-email-modal-close')) {
        return;
    }
    document.getElementById('emailChangeModal').classList.remove('active');
}

function startResendCooldown(seconds) {
    const btn = document.getElementById('btnSendEmailCode');
    btn.disabled = true;
    let remaining = seconds;
    btn.innerText = `Resend (${remaining}s)`;

    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(resendTimer);
            btn.disabled = false;
            btn.innerText = 'Send Code';
        } else {
            btn.innerText = `Resend (${remaining}s)`;
        }
    }, 1000);
}

async function handleSendEmailOtp() {
    const newEmail = document.getElementById('modalNewEmailInput').value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!newEmail || !emailRegex.test(newEmail)) {
        ProfileSwal.fire({
            icon: 'warning',
            title: 'Valid Email Needed',
            text: 'Please enter a valid new email address before requesting a code.'
        });
        return;
    }

    const sendBtn = document.getElementById('btnSendEmailCode');
    sendBtn.disabled = true;
    sendBtn.innerText = 'Sending...';

    ProfileSwal.fire({
        title: 'Sending Code...',
        text: 'Please wait while we generate and send your verification code.',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const res = await fetch('/api/customer/email-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_email: newEmail })
        });
        const data = await res.json();

        if (data.status === 'success') {
            startResendCooldown(60);
            ProfileSwal.fire({
                icon: 'success',
                title: 'Code Sent!',
                text: data.message || 'Verification code sent to your email.',
                timer: 2500,
                showConfirmButton: false
            });
            document.getElementById('modalOtpCodeInput').focus();
        } else {
            sendBtn.disabled = false;
            sendBtn.innerText = 'Send Code';
            ProfileSwal.fire({
                icon: 'error',
                title: 'Could Not Send',
                text: data.message || 'Failed to send confirmation code.'
            });
        }
    } catch {
        startResendCooldown(60);
        ProfileSwal.fire({
            icon: 'info',
            title: 'Code Generated',
            text: 'Demo verification code: 123456',
            timer: 3500,
            showConfirmButton: true
        });
        document.getElementById('modalOtpCodeInput').value = '123456';
    }
}

// I-verify ang OTP at i-save ang bagong email sa Supabase
async function handleVerifySaveEmail() {
    const newEmail = document.getElementById('modalNewEmailInput').value.trim();
    const otpCode  = document.getElementById('modalOtpCodeInput').value.trim();

    if (!newEmail) {
        ProfileSwal.fire({ icon: 'warning', title: 'Missing Email', text: 'Please enter your new email address.' });
        return;
    }

    if (otpCode.length !== 6) {
        ProfileSwal.fire({ icon: 'warning', title: 'Invalid Code', text: 'Please enter the complete 6-digit confirmation code.' });
        return;
    }

    ProfileSwal.fire({
        title: 'Updating Email...',
        text: 'Verifying code and saving to database...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    const localUser = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const customerId = localUser.customer_id || 11;

    try {
        const res = await fetch('/api/customer/email-otp/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customer_id: customerId,
                new_email: newEmail,
                otp_code: otpCode
            })
        });
        const data = await res.json();

        if (!res.ok || data.status !== 'success') {
            ProfileSwal.fire({
                icon: 'error',
                title: 'Verification Failed',
                text: data.message || 'Invalid or expired confirmation code.'
            });
            return;
        }

        // Tagumpay na na-save sa Supabase
        document.getElementById('emailChangeModal').classList.remove('active');
        document.getElementById('profileCurrentEmailDisplay').value = newEmail;

        localUser.email = newEmail;
        localStorage.setItem('mm_user', JSON.stringify(localUser));

        ProfileSwal.fire({
            icon: 'success',
            title: 'Email Updated!',
            text: 'Your email address has been successfully updated in the database.'
        });
    } catch {
        ProfileSwal.fire({
            icon: 'error',
            title: 'Server Error',
            text: 'An error occurred while connecting to the server.'
        });
    }
}

function setupProfileForm() {
    const form = document.getElementById('profileForm');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fullName = document.getElementById('full_name').value.trim();
        const username = document.getElementById('username').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const avatarSrc = document.getElementById('avatarRoundPreview').src;

        if (!fullName) {
            ProfileSwal.fire({ icon: 'warning', title: 'Missing Field', text: 'Full name is required.' });
            return;
        }

        if (phone) {
            const phMobileRegex = /^09\d{9}$/;
            if (!phMobileRegex.test(phone)) {
                ProfileSwal.fire({
                    icon: 'warning',
                    title: 'Invalid Contact Number',
                    text: 'Contact number must be an 11-digit number starting with 09 (e.g. 09123456789).'
                });
                return;
            }
        }

        ProfileSwal.fire({
            title: 'Saving Profile...',
            text: 'Validating and updating your details in database...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        const localUser = JSON.parse(localStorage.getItem('mm_user') || '{}');
        const customerId = localUser.customer_id || 11;

        try {
            const res = await fetch('/api/customer/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customer_id: customerId,
                    full_name: fullName,
                    username: username,
                    phone_number: phone,
                    avatar: avatarSrc
                })
            });
            const data = await res.json();

            if (!res.ok || data.status !== 'success') {
                ProfileSwal.fire({
                    icon: 'error',
                    title: 'Update Failed',
                    text: data.message || 'Could not update profile details.'
                });
                return;
            }

            localUser.full_name = fullName;
            localUser.username = username;
            localUser.phone = phone;
            localUser.phone_number = phone;
            localUser.avatar = avatarSrc;
            localStorage.setItem('mm_user', JSON.stringify(localUser));

            const navAvatar = document.querySelector('.nav-avatar-img-badge');
            if (navAvatar) navAvatar.src = avatarSrc;

            ProfileSwal.fire({
                icon: 'success',
                title: 'Saved!',
                text: data.message || 'Profile changes saved successfully!',
                confirmButtonText: 'Got It'
            }).then(() => {
                loadProfileDetails();
            });

        } catch (err) {
            ProfileSwal.fire({
                icon: 'error',
                title: 'Server Error',
                text: 'Could not connect to the server. Please check your connection.'
            });
        }
    });
}