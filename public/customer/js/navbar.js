// public/customer/js/navbar.js

document.addEventListener('DOMContentLoaded', () => {
  injectNavbarDropdownStyles();
  initNavbarState();
  initNavbarSearch();
  initMobileBottomNav();
  initScrollSpyNav();
  setupGlobalAvatarUpload();
});

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function injectNavbarDropdownStyles() {
  if (document.getElementById('mm-navbar-dropdown-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'mm-navbar-dropdown-styles';
  styleEl.innerHTML = `
    .nav-notif-wrapper {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .nav-icon-btn.active,
    #navNotifBell.active {
      background-color: #F48A8E !important;
      color: #FFFFFF !important;
      border-radius: 50% !important;
    }
    .nav-icon-btn.active i,
    #navNotifBell.active i {
      color: #FFFFFF !important;
    }
    .nav-notif-dropdown {
      position: absolute;
      top: calc(100% + 14px);
      right: -18px;
      width: 360px;
      background: #FFF5F4;
      border: 2px solid #FCE1DD;
      border-radius: 26px;
      padding: 22px 20px 18px;
      box-shadow: 0 16px 42px rgba(89, 74, 66, 0.22);
      display: none;
      flex-direction: column;
      gap: 12px;
      z-index: 999999;
      box-sizing: border-box;
      font-family: 'Urbanist', sans-serif;
    }
    .nav-notif-wrapper:hover .nav-notif-dropdown,
    .nav-notif-wrapper.active .nav-notif-dropdown {
      display: flex !important;
    }
    .notif-dropdown-title {
      font-family: 'Bootzy TM', 'Urbanist', sans-serif !important;
      font-size: 20px;
      font-weight: 800;
      color: #594A42;
      margin: 0 0 2px 0;
      letter-spacing: 0.5px;
    }
    .notif-dropdown-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 280px;
      overflow-y: auto;
    }
    .dropdown-notif-item {
      background: #FFFFFF;
      border-radius: 18px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(89, 74, 66, 0.03);
      transition: transform 0.15s ease, background-color 0.15s ease;
    }
    .dropdown-notif-item:hover {
      transform: translateY(-1px);
      background: #FFFBFB;
    }
    .dropdown-item-thumb {
      position: relative;
      width: 48px;
      height: 58px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      flex-shrink: 0;
    }
    .dropdown-item-thumb::after {
      content: "";
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 42px;
      height: 22px;
      background: var(--thumb-accent, #F48A8E);
      border-radius: 9px;
      z-index: 1;
      opacity: 0.95;
    }
    .dropdown-item-thumb img {
      position: relative;
      max-height: 52px;
      max-width: 100%;
      object-fit: contain;
      z-index: 2;
      margin-bottom: 2px;
    }
    .dropdown-item-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .dropdown-item-title {
      font-family: 'Bootzy TM', 'Urbanist', sans-serif !important;
      font-size: 13.5px;
      font-weight: 800;
      color: #594A42;
      margin: 0;
      line-height: 1.25;
    }
    .dropdown-item-sub {
      font-size: 11.5px;
      font-weight: 600;
      color: #7C4F38;
      margin: 0;
      line-height: 1.3;
    }
    .notif-dropdown-footer {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 4px;
    }
    .btn-dropdown-view-all {
      flex: 1;
      background: #F48A8E;
      color: #ffffff !important;
      text-align: center;
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 800;
      padding: 9px 0;
      border-radius: 99px;
      transition: opacity 0.15s ease;
    }
    .btn-dropdown-view-all:hover {
      opacity: 0.92;
    }
    .btn-dropdown-mark-read {
      flex: 1.4;
      background: #FFFFFF;
      border: 1.5px solid #FCE1DD;
      color: #594A42;
      font-size: 13px;
      font-weight: 800;
      padding: 9px 0;
      border-radius: 99px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-dropdown-mark-read:hover {
      background: #F48A8E;
      color: #FFFFFF;
      border-color: #F48A8E;
    }
  `;
  document.head.appendChild(styleEl);
}

function initNavbarState() {
  const user = JSON.parse(localStorage.getItem('mm_user') || 'null');
  const userSlot = document.getElementById('navUserSlot');
  const notifContainer = document.getElementById('navNotifContainer');
  const navOrders = document.getElementById('nav-orders');
  const mNavOrders = document.getElementById('m-nav-orders');
  const cartBadge = document.getElementById('navCartCount');

  const currentPath = window.location.pathname.toLowerCase();
  const pageAttr = document.querySelector('.navbar-wrapper')?.getAttribute('data-current-page');
  const isNotifPage = currentPath.includes('notifications') || pageAttr === 'notifications';

  let cartQuery = '';
  if (user && user.customer_id) {
    cartQuery = `customer_id=${encodeURIComponent(user.customer_id)}`;
  } else {
    const guestId = sessionStorage.getItem('mm_guest_session_id');
    if (guestId) {
      cartQuery = `session_id=${encodeURIComponent(guestId)}`;
    }
  }

  if (cartQuery && cartBadge) {
    fetch(`/api/cart/count?${cartQuery}`)
      .then(res => res.json())
      .then(data => {
        const count = parseInt(data.count, 10) || 0;
        cartBadge.innerText = count;
        cartBadge.style.display = count > 0 ? 'inline-block' : 'none';
      })
      .catch(() => {});
  }

  // REGISTERED CUSTOMER STATE
  if (user && (user.customer_id || user.user_id || user.id)) {
    const displayName = escapeHtml(user.full_name || user.username || 'Customer');

    // Sinusuri lahat ng posibleng column names para sa profile image
    let rawAvatar = user.avatar || user.profile_picture || user.avatar_url || user.photo_url || user.image || '';
    if (rawAvatar && !rawAvatar.startsWith('http') && !rawAvatar.startsWith('/')) {
      rawAvatar = '/' + rawAvatar;
    }
    const avatarUrl = rawAvatar ? escapeHtml(rawAvatar) : 'images/account.png';

    if (userSlot) {
      userSlot.innerHTML = `
        <div class="nav-profile-dropdown-wrapper" id="navProfileDropdown">
          <div class="nav-avatar-trigger" id="navAvatarTrigger" tabindex="0" role="button" aria-haspopup="true" aria-expanded="false">
            <img id="navAvatarImgDisplay" src="${avatarUrl}" alt="User Avatar" class="nav-avatar-img-badge" onerror="this.src='images/account.png'">
          </div>
          <div class="nav-profile-menu" id="navProfileMenu">
            <div class="profile-dropdown-header">
              <div style="position: relative; width: 64px; height: 64px; margin: 0 auto 10px; border-radius: 50%; overflow: hidden; border: 2.5px solid #F48A8E; background: #FFF5F4;">
                <img id="dropdownAvatarImgDisplay" src="${avatarUrl}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='images/account.png'">
              </div>
              <span class="dropdown-greeting">SIGNED IN AS</span>
              <span class="dropdown-username">${displayName}</span>
            </div>
            <hr class="dropdown-separator">
            <a href="profile.html" class="profile-dropdown-link">
              <i class="fa-regular fa-user"></i>
              <span>My Profile</span>
            </a>
            <a href="accountSettings.html" class="profile-dropdown-link">
              <i class="fa-solid fa-sliders"></i>
              <span>Account Settings</span>
            </a>
            <hr class="dropdown-separator">
            <a href="javascript:void(0)" class="profile-dropdown-link logout-accent" onclick="handleNavbarLogout(event)">
              <i class="fa-solid fa-arrow-right-from-bracket"></i>
              <span>Logout</span>
            </a>
          </div>
        </div>
      `;

      setupDropdownToggle();
    }

    if (navOrders) {
      navOrders.href = 'orders.html';
      navOrders.onclick = null;
    }
    if (mNavOrders) {
      mNavOrders.href = 'orders.html';
      mNavOrders.onclick = null;
    }

    if (notifContainer) {
      notifContainer.innerHTML = `
        <div class="nav-notif-wrapper" id="navNotifWrapper">
          <a href="notifications.html" class="nav-icon-btn ${isNotifPage ? 'active' : ''}" title="Notifications" id="navNotifBell">
            <i class="fa-regular fa-bell"></i>
          </a>

          <div class="nav-notif-dropdown" id="navNotifDropdown">
            <h3 class="notif-dropdown-title">Sweet Updates</h3>
            <div class="notif-dropdown-list" id="notifDropdownList">
              <div style="padding: 14px; text-align: center; color: #7C4F38; font-size: 13px;">
                <i class="fa-solid fa-spinner fa-spin"></i> Loading sweet updates...
              </div>
            </div>
            <div class="notif-dropdown-footer">
              <a href="notifications.html" class="btn-dropdown-view-all">View All</a>
              <button type="button" class="btn-dropdown-mark-read" onclick="markAllNotificationsAsRead(event)">Mark All as Read</button>
            </div>
          </div>
        </div>
      `;

      loadNavbarDropdownNotifs(user.customer_id);
    }
  } else {
    // GUEST STATE
    if (userSlot) {
      userSlot.innerHTML = `
        <a href="javascript:void(0)" class="nav-avatar-btn" title="Log In / Sign Up" onclick="handleGuestAccountPrompt(event)">
          <i class="fa-solid fa-user"></i>
        </a>
      `;
    }

    if (navOrders) {
      navOrders.href = 'orders.html';
      navOrders.onclick = null;
    }
    if (mNavOrders) {
      mNavOrders.href = 'orders.html';
      mNavOrders.onclick = null;
    }

    if (notifContainer) {
      notifContainer.innerHTML = `
        <a href="javascript:void(0)" class="nav-icon-btn ${isNotifPage ? 'active' : ''}" title="Notifications" onclick="handleGuestRestricted('notifications')">
          <i class="fa-regular fa-bell"></i>
        </a>
      `;
    }
  }
}

function setupGlobalAvatarUpload() {
  let fileInput = document.getElementById('globalAvatarFileInput');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'globalAvatarFileInput';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
  }
  fileInput.onchange = handleGlobalAvatarFileSelect;
}

window.triggerNavbarAvatarUpload = function() {
  const fileInput = document.getElementById('globalAvatarFileInput');
  if (fileInput) fileInput.click();
};

async function handleGlobalAvatarFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const localUser = JSON.parse(localStorage.getItem('mm_user') || '{}');
  const userId = localUser.user_id || localUser.id;
  const customerId = localUser.customer_id;

  const formData = new FormData();
  formData.append('profile_picture', file);
  if (userId) formData.append('user_id', userId);
  if (customerId) formData.append('customer_id', customerId);

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'Updating Photo...',
      text: 'Saving to your profile in the database...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
  }

  try {
    const res = await fetch('/api/customer/profile/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    const result = await res.json();

    if (res.ok && result.status === 'success') {
      const newAvatarUrl = result.avatar;

      const navAvatar = document.getElementById('navAvatarImgDisplay');
      const dropAvatar = document.getElementById('dropdownAvatarImgDisplay');
      const profileAvatar = document.getElementById('profileAvatarImg');
      if (navAvatar) navAvatar.src = newAvatarUrl;
      if (dropAvatar) dropAvatar.src = newAvatarUrl;
      if (profileAvatar) profileAvatar.src = newAvatarUrl;

      localUser.avatar = newAvatarUrl;
      localUser.profile_picture = newAvatarUrl;
      localStorage.setItem('mm_user', JSON.stringify(localUser));

      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'success',
          title: 'Photo Updated!',
          text: 'Saved successfully to database!',
          timer: 1800,
          showConfirmButton: false
        });
      }
    } else {
      throw new Error(result.message || 'Failed to save avatar.');
    }
  } catch (err) {
    console.error('Avatar upload failed:', err);
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'error',
        title: 'Upload Error',
        text: err.message || 'Could not save profile image.'
      });
    }
  } finally {
    event.target.value = '';
  }
}

function loadNavbarDropdownNotifs(customerId) {
  const listEl = document.getElementById('notifDropdownList');
  if (!listEl) return;

  fetch(`/api/orders?customer_id=${encodeURIComponent(customerId)}`)
    .then(res => res.json())
    .then(data => {
      const orders = data.orders || [];

      if (orders.length === 0) {
        listEl.innerHTML = `
          <div style="padding: 16px; text-align: center; color: #7C4F38; font-size: 13px; font-weight: 600;">
            No updates yet. Place an order to see updates here!
          </div>
        `;
        return;
      }

      const recentOrders = orders.slice(0, 3);

      listEl.innerHTML = recentOrders.map(order => {
        const rawItems = order.items || [];
        const rawLabel = (rawItems[0] && (rawItems[0].item_label || rawItems[0].title)) || order.title || 'Custom Cup';
        
        let accent = '#8bb35c';
        let img = 'images/Cheesy Pandan Cubes.png';

        if (rawLabel.toLowerCase().includes('coffee')) {
          accent = '#664638';
          img = 'images/Chocolatey Coffee Noodly Jelly.png';
        } else if (rawLabel.toLowerCase().includes('strawberry')) {
          accent = '#f48a8e';
          img = 'images/Strawberry String Party.png';
        }

        let rawStatus = (order.status || 'CONFIRMED').toUpperCase().replace(/_/g, ' ');
        let title = 'Order Confirmed!';
        let sub = 'Your order has been recorded and will be prepared soon.';

        if (rawStatus.includes('COMPLET')) {
          title = 'Order Complete!';
          sub = 'How was your sip? Tell us what you think of your drink.';
        } else if (rawStatus.includes('PREP')) {
          title = 'Prepping Your Sips!';
          sub = 'The Marble Bar is preparing your cup right now.';
        } else if (rawStatus.includes('READY')) {
          title = 'Ready for Pick-up!';
          sub = 'Your sweet cup is chilled and ready for pick-up!';
        }

        return `
          <div class="dropdown-notif-item" onclick="window.location.href='notifications.html'">
            <div class="dropdown-item-thumb" style="--thumb-accent: ${accent};">
              <img src="${img}" alt="Drink">
            </div>
            <div class="dropdown-item-text">
              <h4 class="dropdown-item-title">${title}</h4>
              <p class="dropdown-item-sub">${sub}</p>
            </div>
          </div>
        `;
      }).join('');
    })
    .catch(() => {
      listEl.innerHTML = `
        <div style="padding: 14px; text-align: center; color: #7C4F38; font-size: 13px;">
          Could not load updates.
        </div>
      `;
    });
}

window.markAllNotificationsAsRead = function(event) {
  if (event) event.stopPropagation();

  const user = JSON.parse(localStorage.getItem('mm_user') || 'null');
  if (!user || !user.customer_id) return;

  fetch(`/api/orders?customer_id=${encodeURIComponent(user.customer_id)}`)
    .then(res => res.json())
    .then(data => {
      const allIds = (data.orders || []).map(o => String(o.id));
      localStorage.setItem('mm_read_notifs', JSON.stringify(allIds));

      document.querySelectorAll('.notification-item-card, .notif-row-card').forEach(card => {
        card.classList.add('is-read');
      });
    });
};

function setupDropdownToggle() {
  const trigger = document.getElementById('navAvatarTrigger');
  const dropdown = document.getElementById('navProfileDropdown');
  if (!trigger || !dropdown) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('active');
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });
}

function initNavbarSearch() {
  const navWrapper = document.querySelector('.navbar-wrapper');
  const searchBox = document.getElementById('globalNavSearchBox');
  const searchInput = document.getElementById('globalNavSearchInput');
  const searchBtn = document.getElementById('globalNavSearchBtn');

  if (!searchInput || !searchBox || !searchBtn) return;

  const currentPath = window.location.pathname.toLowerCase();
  const isHomePage = currentPath.endsWith('home.html') || currentPath === '/';
  const isOrdersPage = currentPath.endsWith('orders.html');

  function handleSearchExecution() {
    const query = searchInput.value.trim();
    const isMobile = window.innerWidth <= 860;

    if (isMobile && !searchBox.classList.contains('expanded')) {
      searchBox.classList.add('expanded');
      if (navWrapper) navWrapper.classList.add('search-expanded');
      searchInput.focus();
      return;
    }

    if (isMobile && !query) {
      searchBox.classList.remove('expanded');
      if (navWrapper) navWrapper.classList.remove('search-expanded');
      return;
    }

    if (isOrdersPage && typeof window.filterOrdersList === 'function') {
      window.filterOrdersList(query);
    } else if (isHomePage) {
      if (typeof window.filterDrinks === 'function') {
        window.filterDrinks(query);
      }
      const drinksSection = document.getElementById('drinks');
      if (drinksSection) {
        drinksSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      window.location.href = 'home.html?search=' + encodeURIComponent(query) + '#drinks';
    }
  }

  searchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleSearchExecution();
  });

  searchInput.addEventListener('input', function() {
    if (isOrdersPage && typeof window.filterOrdersList === 'function') {
      window.filterOrdersList(this.value);
    } else if (isHomePage && typeof window.filterDrinks === 'function') {
      window.filterDrinks(this.value);
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchExecution();
    }
  });
}

function handleGuestRestricted(type) {
  const isOrders = type === 'orders';
  const modalTitle = isOrders ? 'Track Your Sips' : 'Sweet Updates';
  const modalText = isOrders
    ? 'Order history is tied to customer accounts. Sign in to review your past favorites, check pickup schedules, and reorder!'
    : 'Sign in to receive real-time order alerts, prep updates, and exclusive seasonal drink drops!';

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: modalTitle,
      text: modalText,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Log In',
      cancelButtonText: 'Keep Browsing',
      reverseButtons: true,
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
      buttonsStyling: false
    }).then((result) => {
      if (result.isConfirmed) {
        window.location.href = 'customerlogin.html';
      }
    });
  } else {
    window.location.href = 'customerlogin.html';
  }
}

window.handleGuestAccountPrompt = function(event, targetUrl = 'login.html') {
  if (event) event.preventDefault();

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'warning',
      title: 'Leave & Create Account?',
      html: 'Your current drink customizations and unsaved changes will be lost if you leave to create an account now.<br><br>Would you like to sign up now or keep building your drink?',
      showCancelButton: true,
      confirmButtonText: 'Sign Up Now',
      cancelButtonText: 'Sign Up Later',
      reverseButtons: true,
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
      buttonsStyling: false
    }).then((result) => {
      if (result.isConfirmed) {
        window.location.href = targetUrl;
      }
    });
  } else {
    if (confirm('Your changes will be lost if you leave to create an account. Sign up now?')) {
      window.location.href = targetUrl;
    }
  }
};

async function executeLogout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Accept': 'application/json' }
    });
  } catch (err) {
    console.warn('Backend logout request failed, clearing local state:', err);
  } finally {
    localStorage.removeItem('mm_user');
    window.location.href = 'customerlogin.html?logged_out=1';
  }
}

function handleNavbarLogout(event) {
  if (event) event.preventDefault();

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'Log out?',
      text: 'Are you sure you want to end your session?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Logout',
      cancelButtonText: 'Stay',
      reverseButtons: true,
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
      buttonsStyling: false
    }).then((result) => {
      if (result.isConfirmed) {
        executeLogout();
      }
    });
  } else {
    if (confirm('Are you sure you want to logout?')) {
      executeLogout();
    }
  }
}

function initMobileBottomNav() {
  const mobileNavLinks = document.querySelectorAll('.mobile-bottom-nav .nav-pill-link');
  mobileNavLinks.forEach((link) => {
    link.addEventListener('click', () => {
      if (typeof window.closeProductModal === 'function') {
        window.closeProductModal();
      }
      document.querySelectorAll('[class*="modal-backdrop"].active').forEach((backdrop) => {
        backdrop.classList.remove('active');
      });
      document.body.style.overflow = '';
    });
  });
}

function initScrollSpyNav() {
  const sections = Array.from(document.querySelectorAll('main.content-wrapper > .page-section[id]'));
  if (!sections.length) return;

  const navLinks = document.querySelectorAll('.nav-pill-link[data-nav]');
  if (!navLinks.length) return;

  const sectionToNavId = (section) =>
    section.id === 'orders-preview' ? 'orders' : section.id;

  function setActiveNav(navId) {
    navLinks.forEach((link) => {
      link.classList.toggle('active', link.dataset.nav === navId);
    });
  }

  function getNavbarOffset() {
    const navbar = document.querySelector('.navbar-wrapper');
    return (navbar ? navbar.offsetHeight : 0) + 24;
  }

  let suppressUntil = 0;
  function suppressFor(ms) {
    suppressUntil = Date.now() + ms;
  }

  navLinks.forEach((link) => {
    const isHashLink = (link.getAttribute('href') || '').startsWith('#');
    if (!isHashLink) return;

    link.addEventListener('click', () => {
      setActiveNav(link.dataset.nav);
      suppressFor(700);
    });
  });

  (function syncInitialHash() {
    const hashId = window.location.hash.replace('#', '');
    if (!hashId) return;
    const target = sections.find((s) => s.id === hashId);
    if (!target) return;

    setActiveNav(sectionToNavId(target));
    suppressFor(1600);

    function resync() {
      const y = Math.max(0, target.offsetTop - getNavbarOffset() + 24);
      if (Math.abs(window.scrollY - y) > 2) {
        window.scrollTo({ top: y, behavior: 'auto' });
      }
    }

    [0, 50, 150, 350, 600, 900, 1300].forEach((ms) => setTimeout(resync, ms));
  })();

  let ticking = false;

  function updateActiveSection() {
    ticking = false;
    if (Date.now() < suppressUntil) return;

    const scrollPos = window.scrollY + getNavbarOffset();
    const atBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 2);

    let current = sections[0];
    if (atBottom) {
      current = sections[sections.length - 1];
    } else {
      for (const section of sections) {
        if (section.offsetTop <= scrollPos) {
          current = section;
        }
      }
    }

    setActiveNav(sectionToNavId(current));
  }

  function onScrollOrResize() {
    if (!ticking) {
      window.requestAnimationFrame(updateActiveSection);
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize);
  updateActiveSection();
}