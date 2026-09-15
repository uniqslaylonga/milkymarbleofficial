// public/customer/js/notifications.js

document.addEventListener('DOMContentLoaded', () => {
  loadCustomerNotifications();
});

function cleanItemTitle(rawLabel) {
  if (!rawLabel) return 'Custom Marble Cup';
  let clean = rawLabel
    .replace(/\s*\(\+.*?\)/g, '')
    .replace(/\s*\[\+.*?\]/g, '')
    .replace(/\s*\((8oz|12oz)\)/gi, '')
    .replace(/^(8oz|12oz)\s*/gi, '')
    .replace(/\s*\(.*?\)/g, '')
    .replace(/\s*\[.*?\]/g, '');
  return clean.replace(/\($/, '').trim() || rawLabel;
}

function resolveItemAssets(cleanTitle, size, toppingsStr) {
  const cleanLower = (cleanTitle || '').toLowerCase();
  const isLarge = (size !== '8oz');
  const folderSize = isLarge ? 'Large' : 'Small';

  const presets = {
    'chocolatey coffee noodly jelly': { image: 'images/Chocolatey Coffee Noodly Jelly.png', accent: '#664638' },
    'cheesy pandan cubes': { image: 'images/Cheesy Pandan Cubes.png', accent: '#8bb35c' },
    'bubbly coffee jelly': { image: 'images/Bubbly Coffee Jelly.png', accent: '#664638' },
    'strawberry string party': { image: 'images/Strawberry String Party.png', accent: '#f48a8e' }
  };

  for (const [pName, pData] of Object.entries(presets)) {
    if (cleanLower.includes(pName)) {
      return {
        is_custom: false,
        image: pData.image,
        flavor_img: pData.image,
        toppings_img: '',
        cup_img: '',
        accent_color: pData.accent
      };
    }
  }

  let flavor = 'Pandan';
  let accent = '#8bb35c';
  if (cleanLower.includes('strawberry')) {
    flavor = 'Strawberry';
    accent = '#f48a8e';
  } else if (cleanLower.includes('coffee')) {
    flavor = 'Coffee';
    accent = '#664638';
  }

  let jelly = 'cube';
  if (cleanLower.includes('spaghetti') || cleanLower.includes('string')) {
    jelly = 'spaghetti';
  } else if (cleanLower.includes('whole')) {
    jelly = 'whole';
  }

  const l1Path = `images/Layer 1/${folderSize} Flavors/${flavor} ${jelly}.png`;
  const l3Path = isLarge ? 'images/Layer 3/Large Cup.png' : 'images/Layer 3/Small Cup.png';

  let l2Path = '';
  const topLower = (toppingsStr || '').toLowerCase();
  const toppingMap = {
    'cheese': 'Cheese',
    'tapioca': 'Tapioca',
    'marshmallow': 'Mashmallow',
    'nuts': 'Nuts',
    'assorted sprinkles': 'Assorted Sprinkles',
    'choco sprinkles': 'Choco Sprinkles',
    'sprinkles': 'Assorted Sprinkles',
    'choco chips': 'Choco Chips',
    'chocolate chip': 'Choco Chips'
  };

  for (const [kw, fileBase] of Object.entries(toppingMap)) {
    if (topLower.includes(kw)) {
      l2Path = `images/Layer 2/${folderSize} Toppings/${fileBase}.png`;
      break;
    }
  }

  return {
    is_custom: true,
    image: l1Path,
    flavor_img: l1Path,
    toppings_img: l2Path,
    cup_img: l3Path,
    accent_color: accent
  };
}

async function loadCustomerNotifications() {
  const container = document.getElementById('notificationsListContainer');
  if (!container) return;

  const user = JSON.parse(localStorage.getItem('mm_user') || 'null');

  if (!user || !user.customer_id) {
    container.innerHTML = `
      <div class="notifications-empty-box">
        <i class="fa-regular fa-bell empty-bell-icon"></i>
        <h2 class="empty-title">No updates yet</h2>
        <p class="empty-sub">Log in to track your freshly layered sips and live order status!</p>
        <a href="customerlogin.html" class="btn-empty-action">Log In</a>
      </div>
    `;
    return;
  }

  try {
    const res = await fetch(`/api/orders?customer_id=${user.customer_id}`);
    const data = await res.json();
    const orders = data.orders || [];

    if (orders.length === 0) {
      container.innerHTML = `
        <div class="notifications-empty-box">
          <i class="fa-regular fa-bell empty-bell-icon"></i>
          <h2 class="empty-title">No updates yet</h2>
          <p class="empty-sub">Place an order to receive fresh updates here.</p>
          <a href="home.html#drinks" class="btn-empty-action">Order a Drink</a>
        </div>
      `;
      return;
    }

    const readNotifs = JSON.parse(localStorage.getItem('mm_read_notifs') || '[]');

    const notifsHTML = orders.map(order => {
      const rawItems = order.items || [];
      const firstRaw = rawItems[0] || {};
      const rawLabel = firstRaw.item_label || firstRaw.title || order.title || 'Custom Marble Cup';
      const size = rawLabel.includes('8oz') ? '8oz' : '12oz';

      let toppingsStr = '';
      const tMatch = rawLabel.match(/\(\+(.*?)\)/);
      if (tMatch) toppingsStr = tMatch[1];
      else if (firstRaw.toppings) toppingsStr = firstRaw.toppings;

      const cleanTitle = cleanItemTitle(rawLabel);
      const assets = resolveItemAssets(cleanTitle, size, toppingsStr);

      let rawStatus = (order.status || 'CONFIRMED').toUpperCase().replace(/_/g, ' ');
      let notifTitle = 'Order Confirmed!';
      let notifDesc = "We've received your order! Hang tight, your jelly cups will be prepared soon.";
      let actionBtnHTML = `<button class="view-details-btn" onclick="openOrderSummary('${item.order_id}')">View Details</button>`;

      if (rawStatus.includes('COMPLET')) {
        notifTitle = 'Order Complete! How was your sip?';
        notifDesc = 'Tell us what you think of your sips! Rate your drink and share the love.';
        actionBtnHTML = `<button type="button" class="btn-notif-action" onclick="window.location.href='orders.html'">Rate your Sips</button>`;
      } else if (rawStatus.includes('READY')) {
        notifTitle = 'Ready for Pick-up!';
        notifDesc = 'Your sweet cups are chilled and waiting for you at the counter!';
        actionBtnHTML = `<button type="button" class="btn-notif-action" onclick="window.location.href='orders.html'">View Details</button>`;
      } else if (rawStatus.includes('PREP')) {
        notifTitle = 'Prepping Your Sips!';
        notifDesc = "The Marble Bar is layering your sweet treats now. We'll let you know once ready!";
        actionBtnHTML = `<button type="button" class="btn-notif-action" onclick="window.location.href='orders.html'">View Details</button>`;
      }

      const dateObj = new Date(order.placed_at || Date.now());
      const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + 
        ' · ' + dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      const isRead = readNotifs.includes(String(order.id));

      return `
        <article class="notification-item-card ${isRead ? 'is-read' : ''}" onclick="markSingleNotifRead('${order.id}')">
          <div class="notif-thumb-wrapper" style="--thumb-accent: ${assets.accent_color};">
            ${assets.is_custom ? `
              <div class="orders-composite-thumb" style="width: 52px; height: 68px;">
                <img src="${assets.flavor_img}" class="cart-layer-flavor" alt="Flavor" onerror="this.style.display='none'">
                ${assets.toppings_img ? `<img src="${assets.toppings_img}" class="cart-layer-toppings" alt="Toppings" onerror="this.style.display='none'">` : ''}
                <img src="${assets.cup_img}" class="cart-layer-cup" alt="Cup">
              </div>
            ` : `
              <img src="${assets.image}" class="notif-thumb-img" alt="${cleanTitle}">
            `}
          </div>

          <div class="notif-details-col">
            <h2 class="notif-title">${notifTitle}</h2>
            <p class="notif-desc">${notifDesc}</p>
            <span class="notif-timestamp">${formattedDate}</span>
          </div>

          <div class="notif-action-col">
            ${actionBtnHTML}
          </div>
        </article>
      `;
    }).join('');

    container.innerHTML = notifsHTML;

  } catch (err) {
    container.innerHTML = `
      <div class="notifications-empty-box">
        <p style="color: #594A42; font-weight: 700;">Could not load notifications. Please refresh.</p>
      </div>
    `;
  }
}

window.markAllNotificationsAsRead = function() {
  const cards = document.querySelectorAll('.notification-item-card');
  cards.forEach(card => card.classList.add('is-read'));

  const user = JSON.parse(localStorage.getItem('mm_user') || '{}');
  fetch(`/api/orders?customer_id=${user.customer_id}`)
    .then(res => res.json())
    .then(data => {
      const ids = (data.orders || []).map(o => String(o.id));
      localStorage.setItem('mm_read_notifs', JSON.stringify(ids));
      const badge = document.getElementById('navNotifBadge');
      if (badge) badge.style.display = 'none';
    });
};

window.markSingleNotifRead = function(id) {
  let readNotifs = JSON.parse(localStorage.getItem('mm_read_notifs') || '[]');
  if (!readNotifs.includes(String(id))) {
    readNotifs.push(String(id));
    localStorage.setItem('mm_read_notifs', JSON.stringify(readNotifs));
  }
};