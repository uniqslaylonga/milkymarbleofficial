document.addEventListener('DOMContentLoaded', () => {
  loadCartItems();
});

let loadedCartItems = [];

// Resolve cup asset paths and preset items[cite: 7]
function resolveCartAssets(title, flavor, variation, size, toppingsList) {
  const titleLower = (title || '').toLowerCase();
  const flavorLower = (flavor || title || '').toLowerCase();
  const varLower = (variation || '').toLowerCase();
  const isLarge = size !== '8oz';
  const folderSize = isLarge ? 'Large' : 'Small';

  // Preset drinks[cite: 7]
  const presets = {
    'chocolatey coffee noodly jelly': { image: 'images/Chocolatey Coffee Noodly Jelly.png', accent: '#664638' },
    'cheesy pandan cubes': { image: 'images/Cheesy Pandan Cubes.png', accent: '#8bb35c' },
    'bubbly coffee jelly': { image: 'images/Bubbly Coffee Jelly.png', accent: '#664638' },
    'strawberry string party': { image: 'images/Strawberry String Party.png', accent: '#f48a8e' }
  };

  for (const [pName, pData] of Object.entries(presets)) {
    if (titleLower.includes(pName)) {
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

  // Custom cup layers[cite: 7]
  let resolvedFlavor = 'Pandan';
  let accent = '#8bb35c';
  if (flavorLower.includes('strawberry') || titleLower.includes('strawberry')) {
    resolvedFlavor = 'Strawberry';
    accent = '#f48a8e';
  } else if (flavorLower.includes('coffee') || titleLower.includes('coffee')) {
    resolvedFlavor = 'Coffee';
    accent = '#664638';
  }

  let resolvedJelly = 'cube';
  if (varLower.includes('spaghetti') || titleLower.includes('spaghetti') || titleLower.includes('string')) {
    resolvedJelly = 'spaghetti';
  } else if (varLower.includes('whole') || titleLower.includes('whole')) {
    resolvedJelly = 'whole';
  }

  const l1Path = `images/Layer 1/${folderSize} Flavors/${resolvedFlavor} ${resolvedJelly}.png`;
  const l3Path = isLarge ? 'images/Layer 3/Large Cup.png' : 'images/Layer 3/Small Cup.png';

  // Custom toppings layer[cite: 7]
  let l2Path = '';
  const toppingsStr = (toppingsList || []).join(' ').toLowerCase();
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

  for (const [keyword, fileBase] of Object.entries(toppingMap)) {
    if (toppingsStr.includes(keyword)) {
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

// Fetch active customer cart items[cite: 7]
async function loadCartItems() {
  const cartList = document.getElementById('cartList');
  const user = JSON.parse(localStorage.getItem('mm_user') || 'null');

  if (!user || !user.customer_id) {
    cartList.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: #777; width: 100%;">
        <i class="fa-solid fa-basket-shopping" style="font-size: 3rem; color: #b8a69d; margin-bottom: 16px;"></i>
        <p style="font-size: 1.25rem; font-weight: 700; color: #4a3427; margin-bottom: 8px;">Your cart is empty</p>
        <p style="font-size: 0.95rem; margin-bottom: 20px;">Log in to view your sweet cup bag across devices!</p>
        <a href="login.html" style="display: inline-block; padding: 10px 24px; background: #F48A8E; color: #fff; text-decoration: none; border-radius: 99px; font-weight: 700;">Log In</a>
      </div>
    `;
    updateSelectAllCount(0);
    return;
  }

  try {
    const res = await fetch(`/api/cart?customer_id=${user.customer_id}`);
    const data = await res.json();
    loadedCartItems = data.items || [];

    if (loadedCartItems.length === 0) {
      cartList.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #777; width: 100%;">
          <i class="fa-solid fa-basket-shopping" style="font-size: 3rem; color: #b8a69d; margin-bottom: 16px;"></i>
          <p style="font-size: 1.25rem; font-weight: 700; color: #4a3427; margin-bottom: 8px;">Your cart is empty</p>
          <p style="font-size: 0.95rem; margin-bottom: 20px;">Looks like you haven't customized any cups yet.</p>
          <a href="home.html#drinks" style="display: inline-block; padding: 10px 24px; background: #664638; color: #fff; text-decoration: none; border-radius: 99px; font-weight: 600;">Build a Cup</a>
        </div>
      `;
      updateSelectAllCount(0);
      calculateCartTotals();
      return;
    }

    renderCartList(loadedCartItems);
    calculateCartTotals();
    updateSelectAllCount(loadedCartItems.length);

  } catch (err) {
    cartList.innerHTML = `<div style="text-align: center; padding: 40px; color: #d32f2f;">Could not load cart items. Please refresh.</div>`;
  }
}

// Render dynamic cart DOM elements[cite: 7]
function renderCartList(items) {
  const cartList = document.getElementById('cartList');
  cartList.innerHTML = items.map(item => {
    const toppingsArr = item.toppings ? item.toppings.split(',').map(t => t.trim()).filter(Boolean) : [];
    const assets = resolveCartAssets(item.title, item.flavor, item.variation, item.size, toppingsArr);

    return `
      <div class="cart-item-wrapper" 
           id="cart-item-${item.id}" 
           data-item-id="${item.id}" 
           data-unit-price="${item.unit_price}"
           data-is-custom="${assets.is_custom ? '1' : '0'}"
           data-flavor-img="${assets.flavor_img}"
           data-toppings-img="${assets.toppings_img}"
           data-cup-img="${assets.cup_img}"
           data-single-img="${assets.image}"
           data-accent-color="${assets.accent_color}">
        
        <label class="cart-checkbox-label">
          <input type="checkbox" class="cart-item-checkbox" ${item.is_selected ? 'checked' : ''} onchange="onItemSelectionChanged('${item.id}', this)">
          <span class="custom-check-mark"></span>
        </label>

        <div class="cart-item-card">
          <div class="cart-thumb-wrapper" style="--thumb-accent: ${assets.accent_color};">
            ${assets.is_custom ? `
              <div class="composite-cart-thumb">
                <img src="${assets.flavor_img}" alt="Flavor Layer" class="cart-layer-flavor" onerror="this.style.display='none'">
                ${assets.toppings_img ? `<img src="${assets.toppings_img}" alt="Toppings Layer" class="cart-layer-toppings" onerror="this.style.display='none'">` : ''}
                <img src="${assets.cup_img}" alt="Cup Outline" class="cart-layer-cup">
              </div>
            ` : `
              <img src="${assets.image}" alt="${item.title}" class="cart-single-thumb-img">
            `}
          </div>

          <div class="cart-details-column">
            <div class="cart-card-top">
              <div class="cart-specs-block">
                <h2 class="cart-item-title" data-title="${item.title}">${item.title}</h2>
                <div class="cart-specs-list">
                  <div class="cart-spec-line">Size: <span class="spec-val" data-size="${item.size || '12oz'}">${item.size || '12oz'}</span></div>
                  <div class="cart-spec-line">Flavor: <span class="spec-val">${item.flavor || 'Custom Mix'}</span></div>
                  <div class="cart-spec-line">Variation: <span class="spec-val">${item.variation || 'Custom Cut'}</span></div>
                  <div class="cart-spec-line">Toppings:</div>
                  <ul class="cart-toppings-ul">
                    ${toppingsArr.length > 0 ? toppingsArr.map(t => `<li>${t}</li>`).join('') : '<li>None</li>'}
                  </ul>
                </div>
              </div>

              <div class="cart-top-right">
                <button type="button" class="btn-delete-cart-item" title="Remove item" onclick="removeCartItem('${item.id}')">
                  <i class="fa-regular fa-trash-can"></i>
                </button>
                <div class="cart-unit-price">₱ ${parseFloat(item.unit_price).toFixed(2)}</div>
              </div>
            </div>

            <div class="cart-card-bottom">
              <div class="cart-qty-pill">
                <button type="button" class="qty-btn" onclick="updateItemQty('${item.id}', -1)">-</button>
                <span class="qty-val" id="qty-${item.id}">${item.quantity}</span>
                <button type="button" class="qty-btn" onclick="updateItemQty('${item.id}', 1)">+</button>
              </div>

              <div class="cart-line-total-box">
                <span class="total-label">Total Price:</span>
                <span class="total-val" id="line-total-${item.id}">₱ ${(item.unit_price * item.quantity).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Update quantity and synchronize with backend[cite: 7]
window.updateItemQty = function(itemId, delta) {
  const qtyEl = document.getElementById(`qty-${itemId}`);
  const lineTotalEl = document.getElementById(`line-total-${itemId}`);
  const wrapper = document.getElementById(`cart-item-${itemId}`);
  const cartList = document.getElementById('cartList');
  if (!qtyEl || !wrapper) return;

  let currentQty = parseInt(qtyEl.textContent) || 1;
  let newQty = currentQty + delta;
  if (newQty < 1) return;

  qtyEl.textContent = newQty;
  const unitPrice = parseFloat(wrapper.getAttribute('data-unit-price')) || 19.00;
  lineTotalEl.textContent = `₱ ${(unitPrice * newQty).toFixed(2)}`;

  calculateCartTotals();

  if (cartList && cartList.firstElementChild !== wrapper) {
    cartList.prepend(wrapper);
    wrapper.classList.remove('item-bump-new');
    void wrapper.offsetWidth;
    wrapper.classList.add('item-bump-new');
  }

  const user = JSON.parse(localStorage.getItem('mm_user') || 'null');

  fetch('/api/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'update_qty',
      id: itemId,
      quantity: newQty,
      customer_id: user?.customer_id
    })
  }).catch(err => console.error('Cart quantity sync error:', err));
};

// Update item selection toggle in database[cite: 7]
window.onItemSelectionChanged = function(itemId, checkbox) {
  calculateCartTotals();

  const user = JSON.parse(localStorage.getItem('mm_user') || 'null');

  fetch('/api/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'update_selection',
      id: itemId,
      is_selected: checkbox.checked,
      customer_id: user?.customer_id
    })
  }).catch(err => console.error('Selection sync error:', err));
};

// Remove single item from cart[cite: 7]
window.removeCartItem = function(itemId) {
  const itemEl = document.getElementById(`cart-item-${itemId}`);
  if (!itemEl) return;

  itemEl.remove();
  calculateCartTotals();

  const remaining = document.querySelectorAll('.cart-item-wrapper').length;
  updateSelectAllCount(remaining);

  const user = JSON.parse(localStorage.getItem('mm_user') || 'null');

  fetch('/api/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'delete',
      id: itemId,
      customer_id: user?.customer_id
    })
  }).catch(err => console.error('Item removal error:', err));
};

// Select or unselect all cart items[cite: 7]
window.toggleSelectAll = function(selectAll) {
  document.querySelectorAll('.cart-item-checkbox').forEach(cb => cb.checked = selectAll.checked);
  calculateCartTotals();
};

function updateSelectAllCount(count) {
  const el = document.getElementById('selectAllText');
  if (el) el.textContent = `Select All (${count})`;
}

// Calculate subtotal and selection summary[cite: 7]
function calculateCartTotals() {
  const wrappers = document.querySelectorAll('.cart-item-wrapper');
  let selectedCount = 0;
  let grandTotal = 0;

  wrappers.forEach(w => {
    const cb = w.querySelector('.cart-item-checkbox');
    const qty = parseInt(w.querySelector('.qty-val').textContent) || 1;
    const price = parseFloat(w.getAttribute('data-unit-price')) || 19.00;

    if (cb && cb.checked) {
      selectedCount++;
      grandTotal += (price * qty);
    }
  });

  document.getElementById('selectedCountText').textContent = selectedCount;
  document.getElementById('grandTotalText').textContent = `₱ ${grandTotal.toFixed(2)}`;

  const selectAll = document.getElementById('selectAllCheckbox');
  if (selectAll) {
    selectAll.checked = (selectedCount > 0 && selectedCount === wrappers.length);
  }
}

// Proceed to checkout: open the Order Summary modal on this same page[cite: 7]
window.openOrderSummaryFromCart = function() {
  const selectedCount = parseInt(document.getElementById('selectedCountText').textContent) || 0;
  if (selectedCount === 0) {
    Swal.fire({
      title: 'No Cups Selected',
      text: 'Please select at least one sweet cup to checkout.',
      icon: 'warning',
      confirmButtonText: 'Got It',
      customClass: {
        container: 'mm-cart-swal-container',
        popup: 'mm-cart-swal-modal',
        title: 'mm-cart-swal-title',
        htmlContainer: 'mm-cart-swal-body',
        confirmButton: 'mm-cart-btn-confirm'
      },
      buttonsStyling: false
    });
    return;
  }

  const selectedIds = Array.from(document.querySelectorAll('.cart-item-checkbox'))
    .filter(cb => cb.checked)
    .map(cb => {
      const wrapper = cb.closest('.cart-item-wrapper');
      return wrapper ? wrapper.getAttribute('data-item-id') : null;
    })
    .filter(Boolean);

  const selectedItems = loadedCartItems.filter(it => selectedIds.includes(String(it.id)));

  if (typeof renderOrderSummaryModal === 'function') {
    renderOrderSummaryModal(selectedItems);
  }
};