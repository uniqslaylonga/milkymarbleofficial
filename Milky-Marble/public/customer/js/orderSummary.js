// public/customer/js/orderSummary.js
let currentOrderSummaryItems = [];
let currentSubtotal = 0.0;
let appliedPromoDiscount = 0.0;
let appliedLoyaltyDiscount = 0.0;
let selectedPaymentMethod = '';
let availableLoyaltyPoints = 0.0;
let lastPlacedOrderData = null;

let currentRecipient = {
  name: 'Valued Customer',
  email: 'customer@gmail.com'
};

document.addEventListener('DOMContentLoaded', () => {
  loadRecipientInfoFromSession();
  handlePaymongoReturn();
});

// ==========================================
// HANDLE RETURN FROM PAYMONGO QR PH CHECKOUT
// ==========================================
async function handlePaymongoReturn() {
  const params = new URLSearchParams(window.location.search);
  const paymentState = params.get('payment');
  const orderId = params.get('order_id');
  if (!paymentState || !orderId) return;

  // Clean the URL so a refresh doesn't re-trigger this
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);

  if (paymentState === 'cancelled') {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'info',
        title: 'Payment Cancelled',
        text: 'Your QR Ph payment was cancelled. Your order is saved as Pending Payment — you can retry from your Orders page.'
      });
    }
    return;
  }

  if (paymentState !== 'success') return;

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'Confirming your payment...',
      text: 'Please wait while we verify your QR Ph payment with PayMongo.',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
  }

  // Poll briefly — the webhook is usually instant, but we retry in case it lags.
  let order = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(`/api/payments/paymongo/status/${orderId}`);
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        order = data.order;
        if (order.status === 'PAID_VERIFIED') break;
      }
    } catch (err) {
      console.warn('Payment status check failed:', err);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  if (order && order.status === 'PAID_VERIFIED') {
    lastPlacedOrderData = {
      ...order,
      items: (order.order_items || []).map(it => ({
        title: it.item_label,
        quantity: it.quantity,
        unit_price: it.unit_price
      })),
      total_amount: order.total_amount,
      pickup_date: (order.pickup_instructions || '').split('|')[0].replace('Pick-up:', '').trim()
    };

    if (typeof loadRecentOrders === 'function') loadRecentOrders();

    if (typeof Swal !== 'undefined') {
      Swal.fire({
        target: document.body,
        icon: 'success',
        title: 'Payment Successful!',
        html: `
          <p style="color: #7C4F38; font-size: 14px; margin-bottom: 8px;">Order No: <strong>${order.order_number}</strong></p>
          <div style="background: #FFF5F4; border-radius: 12px; padding: 10px; margin: 10px 0; font-weight: 800; color: #594A42;">
            🎉 Paid via PayMongo QR Ph — Total: ₱ ${Number(order.total_amount).toFixed(2)}
          </div>
          <button type="button" class="btn-download-receipt" onclick="downloadReceiptPDF()" style="margin-top: 10px; padding: 8px 18px; font-weight: 800; border-radius: 99px; border: 1.5px solid #FCE1DD; background: #FFF; color: #F48A8E; cursor: pointer;">
            <i class="fa-solid fa-file-arrow-down"></i> Download Receipt (PDF)
          </button>
        `,
        confirmButtonText: 'Got It!',
        customClass: {
          container: 'mm-order-swal-container',
          popup: 'custom-swal-popup',
          title: 'custom-swal-title',
          htmlContainer: 'custom-swal-html',
          confirmButton: 'custom-swal-confirm'
        },
        buttonsStyling: false
      });
    }
  } else if (typeof Swal !== 'undefined') {
    Swal.fire({
      target: document.body,
      icon: 'warning',
      title: 'Still Processing',
      text: 'We could not confirm your payment yet. If GCash/your bank already deducted the amount, check your Orders page shortly — it updates automatically once confirmed.',
      customClass: {
        container: 'mm-order-swal-container',
        popup: 'custom-swal-popup',
        title: 'custom-swal-title',
        htmlContainer: 'custom-swal-html',
        confirmButton: 'custom-swal-confirm'
      },
      buttonsStyling: false
    });
  }
}

function loadRecipientInfoFromSession() {
  const localUser = JSON.parse(localStorage.getItem('mm_user') || '{}');
  if (localUser.full_name || localUser.username) {
    currentRecipient.name = localUser.full_name || localUser.username;
  }
  if (localUser.email) {
    currentRecipient.email = localUser.email;
  }
  renderRecipientDetails();
}

function renderRecipientDetails() {
  const wrapper = document.getElementById('recipientDetailsWrapper');
  if (!wrapper) return;

  wrapper.innerHTML = `
    <div class="recipient-input-card" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #FFFDFD; border: 1.5px solid #FCE1DD; border-radius: 16px;">
      <div class="recipient-display-col" style="display: flex; flex-direction: column; gap: 3px;">
        <div style="font-size: 13.5px; color: #594A42;"><strong>Name:</strong> ${currentRecipient.name}</div>
        <div style="font-size: 13.5px; color: #594A42;"><strong>Email:</strong> ${currentRecipient.email}</div>
      </div>
      <button type="button" class="btn-edit-recipient" onclick="openRecipientModal()" title="Edit Details" style="background: none; border: none; color: #F48A8E; font-size: 17px; cursor: pointer;">
        <i class="fa-regular fa-pen-to-square"></i>
      </button>
    </div>
  `;
}

// ==========================================
// RENDER ORDER SUMMARY MODAL
// ==========================================
window.renderOrderSummaryModal = async function(items = []) {
  currentOrderSummaryItems = items;
  appliedPromoDiscount = 0.0;
  appliedLoyaltyDiscount = 0.0;
  selectedPaymentMethod = '';

  loadRecipientInfoFromSession();

  // Reset payment method buttons - no default selection; customer must choose
  document.querySelectorAll('.payment-method-pill').forEach(btn => {
    btn.classList.remove('active');
  });
  const paymentReq = document.getElementById('paymentRequiredMsg');
  if (paymentReq) paymentReq.style.display = 'none';

  // Reset promo code inputs
  const promoInput = document.getElementById('promoCodeInput');
  if (promoInput) promoInput.value = '';
  const promoMsg = document.getElementById('promoAppliedMsg');
  if (promoMsg) promoMsg.style.display = 'none';

  // Kuhanin ang loyalty points mula sa Supabase
  await syncCustomerLoyaltyPoints();

  // Reset Loyalty Points Toggle
  const togglePoints = document.getElementById('toggleUseLoyaltyPoints');
  if (togglePoints) togglePoints.checked = false;
  const loyaltyRow = document.getElementById('summaryLoyaltyDiscountRow');
  if (loyaltyRow) loyaltyRow.style.display = 'none';

  setNextDefaultPickupDate();

  // Render bawat Cup item sa modal
  const cupsList = document.getElementById('summaryCupsList');
  if (cupsList) {
    cupsList.innerHTML = items.map(item => {
      const lineTotal = (item.unit_price || 15.00) * (item.quantity || 1);
      const thumbSrc = item.image || item.flavor_img || 'images/1.jpg';

      return `
        <div class="summary-cup-item" style="display: flex; align-items: center; justify-content: space-between; background: #FFF4F2; border-radius: 18px; padding: 12px 16px; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <img src="${thumbSrc}" alt="Cup" style="width: 50px; height: 50px; object-fit: contain;" onerror="this.src='images/1.jpg'">
            <div style="display: flex; flex-direction: column;">
              <h4 style="font-size: 14.5px; font-weight: 800; color: #594A42; margin: 0;">${item.size || '12oz'} ${item.title}</h4>
              <span style="font-size: 12px; font-weight: 600; color: #7C4F38;">${item.toppings || ''} ${item.addons || ''}</span>
              <span style="display: inline-block; width: fit-content; background: #F48A8E; color: #fff; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 99px; margin-top: 4px;">${item.quantity || 1}x</span>
            </div>
          </div>
          <div style="font-size: 17px; font-weight: 800; color: #594A42;">₱ ${lineTotal.toFixed(2)}</div>
        </div>
      `;
    }).join('');
  }

  currentSubtotal = items.reduce((sum, it) => sum + ((it.unit_price || 15.00) * (it.quantity || 1)), 0);
  updateSummaryTotals();

  const modal = document.getElementById('orderSummaryModal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

window.closeOrderSummaryModal = function() {
  const modal = document.getElementById('orderSummaryModal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
};

// ==========================================
// LOYALTY POINTS LOGIC & CALCULATIONS
// ==========================================
async function syncCustomerLoyaltyPoints() {
  const localUser = JSON.parse(localStorage.getItem('mm_user') || '{}');
  const customerId = localUser.customer_id || 11;

  try {
    const res = await fetch(`/api/customer/profile?customer_id=${customerId}`);
    const result = await res.json();

    if (res.ok && result.status === 'success') {
      const data = result.data || result.customer || {};
      availableLoyaltyPoints = parseFloat(data.loyalty_points || 0);

      const formattedPts = availableLoyaltyPoints.toFixed(1);
      const pesoEquiv = (availableLoyaltyPoints * 1.0).toFixed(2);

      const availableSubtext = document.getElementById('summaryLoyaltyAvailable');
      if (availableSubtext) {
        availableSubtext.innerText = `Available: ${formattedPts} pts (₱${pesoEquiv})`;
      }

      const ptsHeader = document.getElementById('displayLoyaltyPoints');
      const pesoHeader = document.getElementById('displayLoyaltyPeso');
      if (ptsHeader) ptsHeader.innerText = `${formattedPts} pts`;
      if (pesoHeader) pesoHeader.innerText = `(₱${pesoEquiv})`;
    }
  } catch (err) {
    console.warn('Could not sync points in order summary:', err);
  }
}

window.handleToggleLoyaltyPoints = function(isChecked) {
  const loyaltyRow = document.getElementById('summaryLoyaltyDiscountRow');
  const loyaltyDisplay = document.getElementById('summaryLoyaltyDiscount');

  if (isChecked) {
    if (availableLoyaltyPoints <= 0) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'info',
          title: 'No Points Available',
          text: 'You have 0 loyalty points. Complete orders to earn points (every ₱10 = 0.1 pts)!'
        });
      }
      document.getElementById('toggleUseLoyaltyPoints').checked = false;
      appliedLoyaltyDiscount = 0.0;
      if (loyaltyRow) loyaltyRow.style.display = 'none';
      updateSummaryTotals();
      return;
    }

    const maxDiscountAllowed = availableLoyaltyPoints * 1.0;
    const remainingToDiscount = Math.max(0, currentSubtotal - appliedPromoDiscount);
    appliedLoyaltyDiscount = Math.min(remainingToDiscount, maxDiscountAllowed);

    if (loyaltyRow) loyaltyRow.style.display = 'flex';
    if (loyaltyDisplay) loyaltyDisplay.innerText = `- ₱ ${appliedLoyaltyDiscount.toFixed(2)}`;
  } else {
    appliedLoyaltyDiscount = 0.0;
    if (loyaltyRow) loyaltyRow.style.display = 'none';
  }

  updateSummaryTotals();
};

function updateSummaryTotals() {
  const subtotalEl = document.getElementById('summarySubtotal');
  const promoEl = document.getElementById('summaryDiscount');
  const finalEl = document.getElementById('summaryFinalTotal');

  if (subtotalEl) subtotalEl.innerText = `₱ ${currentSubtotal.toFixed(2)}`;
  if (promoEl) promoEl.innerText = `- ₱ ${appliedPromoDiscount.toFixed(2)}`;

  const finalTotal = Math.max(0, currentSubtotal - appliedPromoDiscount - appliedLoyaltyDiscount);
  if (finalEl) finalEl.innerText = `₱ ${finalTotal.toFixed(2)}`;
}

// ==========================================
// PAYMENT METHOD & PICKUP DATE VALIDATION
// ==========================================
window.selectPaymentMethod = function(btnElement) {
  document.querySelectorAll('.payment-method-pill').forEach(b => b.classList.remove('active'));
  btnElement.classList.add('active');
  selectedPaymentMethod = btnElement.getAttribute('data-payment-value') || btnElement.innerText.trim();

  const paymentReq = document.getElementById('paymentRequiredMsg');
  if (paymentReq) paymentReq.style.display = 'none';
};

function setNextDefaultPickupDate() {
  const input = document.getElementById('pickupDateInput');
  if (!input) return;

  const date = new Date();
  date.setDate(date.getDate() + 1);

  while (date.getDay() !== 1 && date.getDay() !== 2 && date.getDay() !== 4) {
    date.setDate(date.getDate() + 1);
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  input.value = `${yyyy}-${mm}-${dd}`;
}

window.validatePickupDate = function(input) {
  const dateReq = document.getElementById('dateRequiredMsg');
  const dateErr = document.getElementById('dateErrorMsg');
  if (dateReq) dateReq.style.display = 'none';
  if (dateErr) dateErr.style.display = 'none';

  if (!input.value) return;

  const selected = new Date(input.value);
  const day = selected.getUTCDay();

  if (day !== 1 && day !== 2 && day !== 4) {
    if (dateErr) dateErr.style.display = 'block';
    input.value = '';
  }
};

window.openDatePicker = function() {
  const input = document.getElementById('pickupDateInput');
  if (input) {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.focus();
    }
  }
};

// ==========================================
// PROMO CODE APPLICATION
// ==========================================
window.applyPromo = function() {
  const input = document.getElementById('promoCodeInput');
  const msg = document.getElementById('promoAppliedMsg');
  const code = (input.value || '').trim().toUpperCase();

  if (!code) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({ icon: 'warning', title: 'Empty Promo', text: 'Please enter a promo code first.' });
    }
    return;
  }

  if (code === 'MILKY10') {
    appliedPromoDiscount = currentSubtotal * 0.10;
    if (msg) {
      msg.innerText = '10% discount promo applied!';
      msg.style.display = 'block';
      msg.style.color = '#2e7d32';
    }
  } else {
    appliedPromoDiscount = 0.0;
    if (msg) {
      msg.innerText = 'Invalid promo code.';
      msg.style.display = 'block';
      msg.style.color = '#d32f2f';
    }
  }

  const isPointsToggled = document.getElementById('toggleUseLoyaltyPoints')?.checked || false;
  if (isPointsToggled) {
    handleToggleLoyaltyPoints(true);
  } else {
    updateSummaryTotals();
  }
};

// ==========================================
// RECIPIENT EDIT MODAL
// ==========================================
window.openRecipientModal = function() {
  document.getElementById('inputRecipientName').value = currentRecipient.name;
  document.getElementById('inputRecipientEmail').value = currentRecipient.email;
  document.getElementById('recipientEditModal').classList.add('active');
};

window.closeRecipientModal = function() {
  document.getElementById('recipientEditModal').classList.remove('active');
};

window.saveRecipientDetails = function(event) {
  event.preventDefault();
  const nameVal = document.getElementById('inputRecipientName').value.trim();
  const emailVal = document.getElementById('inputRecipientEmail').value.trim();

  if (!nameVal || !emailVal) return;

  currentRecipient.name = nameVal;
  currentRecipient.email = emailVal;

  const localUser = JSON.parse(localStorage.getItem('mm_user') || '{}');
  localUser.full_name = nameVal;
  localUser.email = emailVal;
  localStorage.setItem('mm_user', JSON.stringify(localUser));

  renderRecipientDetails();
  closeRecipientModal();
};

// ==========================================
// RECEIPT DOM & PDF DOWNLOAD
// ==========================================
function buildReceiptDOM(order) {
  const container = document.getElementById('printableReceiptContainer');
  if (!container) return;

  const formattedItems = (order.items || currentOrderSummaryItems).map(item => `
    <tr style="border-bottom: 1px dashed #FCE1DD;">
      <td style="padding: 8px 4px; font-size: 12px; color: #594A42;">
        <strong>${item.size || '12oz'} ${item.title}</strong><br>
        <span style="font-size: 10.5px; color: #7C4F38;">${item.toppings || ''} ${item.addons || ''}</span>
      </td>
      <td style="padding: 8px 4px; font-size: 12px; text-align: center; color: #594A42;">${item.quantity || 1}x</td>
      <td style="padding: 8px 4px; font-size: 12px; text-align: right; font-weight: 700; color: #594A42;">₱ ${((item.unit_price || 15) * (item.quantity || 1)).toFixed(2)}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div id="receiptPDFContent" style="width: 380px; padding: 28px; background: #FFFDFD; font-family: 'Urbanist', Arial, sans-serif; color: #594A42; border: 2px solid #FCE1DD; border-radius: 20px;">
      <div style="text-align: center; margin-bottom: 16px;">
        <h2 style="font-family: 'Fredoka', cursive, sans-serif; font-size: 24px; color: #F48A8E; margin: 0;">Milky Marble</h2>
        <p style="font-size: 11.5px; color: #7C4F38; margin: 4px 0 0;">Handcrafted Bouncy Sips & Layered Treats</p>
      </div>
      
      <div style="font-size: 12px; border-top: 1px dashed #FCE1DD; border-bottom: 1px dashed #FCE1DD; padding: 10px 0; margin-bottom: 14px; line-height: 1.5;">
        <div><strong>Order No:</strong> ${order.order_number || '#MM-0000'}</div>
        <div><strong>Customer:</strong> ${currentRecipient.name}</div>
        <div><strong>Email:</strong> ${currentRecipient.email}</div>
        <div><strong>Pick-up Schedule:</strong> ${order.pickup_date || 'N/A'}</div>
        <div><strong>Payment:</strong> ${selectedPaymentMethod}</div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
        <thead>
          <tr style="border-bottom: 1.5px solid #FCE1DD; font-size: 11px; text-transform: uppercase; color: #7C4F38;">
            <th style="text-align: left; padding-bottom: 6px;">Item</th>
            <th style="text-align: center; padding-bottom: 6px;">Qty</th>
            <th style="text-align: right; padding-bottom: 6px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${formattedItems}
        </tbody>
      </table>

      <div style="border-top: 1.5px solid #FCE1DD; padding-top: 8px; font-size: 12.5px; display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Subtotal:</span>
          <span>₱ ${currentSubtotal.toFixed(2)}</span>
        </div>
        ${appliedPromoDiscount > 0 ? `
          <div style="display: flex; justify-content: space-between; color: #2e7d32;">
            <span>Promo Discount:</span>
            <span>- ₱ ${appliedPromoDiscount.toFixed(2)}</span>
          </div>
        ` : ''}
        ${order.points_used > 0 ? `
          <div style="display: flex; justify-content: space-between; color: #E27D80; font-weight: 700;">
            <span>Points Discount (${order.points_used.toFixed(1)} pts):</span>
            <span>- ₱ ${order.points_used.toFixed(2)}</span>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; border-top: 1px dashed #FCE1DD; padding-top: 6px; margin-top: 4px;">
          <span>Total Paid:</span>
          <span style="color: #F48A8E;">₱ ${order.total_amount.toFixed(2)}</span>
        </div>
        <div style="background: #FFF5F4; border-radius: 8px; padding: 6px; text-align: center; margin-top: 8px; font-size: 11.5px; font-weight: 700;">
          Points Earned: +${Number(order.points_earned || 0).toFixed(1)} pts
        </div>
      </div>

      <div style="text-align: center; margin-top: 18px; font-size: 11px; color: #7C4F38;">
        Thank you for your sweet support! See you at the Marble Bar!
      </div>
    </div>
  `;
}

window.downloadReceiptPDF = function() {
  if (!lastPlacedOrderData) return;
  buildReceiptDOM(lastPlacedOrderData);

  const element = document.getElementById('receiptPDFContent');
  if (!element || typeof html2pdf === 'undefined') return;

  const opt = {
    margin: 10,
    filename: `Receipt_${lastPlacedOrderData.order_number || 'MilkyMarble'}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a5', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(element).save();
};

// ==========================================
// CONFIRM PLACE ORDER (SUBMIT ORDER WITH ORDER_TYPE)
// ==========================================
window.confirmPlaceOrder = async function() {
  const pickupInput = document.getElementById('pickupDateInput');
  const dateReq = document.getElementById('dateRequiredMsg');

  if (!pickupInput || !pickupInput.value) {
    if (dateReq) dateReq.style.display = 'block';
    return;
  }

  // Payment method is only required on pages that actually show the pill picker
  // (orders.html uses a stripped-down summary modal without it).
  const paymentPills = document.querySelectorAll('.payment-method-pill');
  if (paymentPills.length > 0 && !selectedPaymentMethod) {
    const paymentReq = document.getElementById('paymentRequiredMsg');
    if (paymentReq) paymentReq.style.display = 'block';
    return;
  }

  const localUser = JSON.parse(localStorage.getItem('mm_user') || '{}');
  const customerId = localUser.customer_id || 11;
  const isPointsToggled = document.getElementById('toggleUseLoyaltyPoints')?.checked || false;

  const pointsToUse = isPointsToggled ? appliedLoyaltyDiscount : 0.0;
  const finalPayableTotal = Math.max(0, currentSubtotal - appliedPromoDiscount - pointsToUse);

  // Tukuyin ang order_type ayon sa constraint ng Supabase: 'custom_build' o 'preset'
  const isCustomCup = currentOrderSummaryItems.some(it => it.is_custom);
  const orderTypeVal = isCustomCup ? 'custom_build' : 'preset';

  // Pages without the pill picker (e.g. orders.html's slim summary modal) keep
  // the historical Cash on Pick-Up default since there's no UI to choose there.
  const paymentMethodForOrder = selectedPaymentMethod || 'Cash on Pick-Up';
  selectedPaymentMethod = paymentMethodForOrder; // keep in sync for the receipt renderer

  const payload = {
    customer_id: customerId,
    items: currentOrderSummaryItems,
    subtotal: currentSubtotal,
    discount_amount: appliedPromoDiscount,
    points_used: pointsToUse,
    order_type: orderTypeVal,
    total_amount: finalPayableTotal,
    payment_method: paymentMethodForOrder,
    pickup_date: pickupInput.value,
    pickup_instructions: `Pick-up: ${pickupInput.value}`
  };

  const submitBtn = document.getElementById('btnPlaceOrderSubmit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Placing Order...';
  }

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (res.ok && data.status === 'success') {
      // For E-Wallet (PayMongo QR Ph), the order is created as PENDING_PAYMENT.
      // Redirect the customer to the PayMongo-hosted QR Ph checkout page now;
      // the order only becomes PAID_VERIFIED once PayMongo confirms payment
      // (handled by handlePaymongoReturn() + the webhook on return).
      if (paymentMethodForOrder === 'E-Wallet') {
        try {
          const checkoutRes = await fetch('/api/payments/paymongo/create-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: data.order.id })
          });
          const checkoutData = await checkoutRes.json();

          if (checkoutRes.ok && checkoutData.status === 'success' && checkoutData.checkout_url) {
            window.location.href = checkoutData.checkout_url;
            return; // leaving the page — nothing further to do here
          }

          if (typeof Swal !== 'undefined') {
            Swal.fire({
              target: document.body,
              icon: 'error',
              title: 'Could Not Start QR Ph Payment',
              text: checkoutData.message || 'Your order was saved as Pending Payment. Please try paying again from your Orders page.',
              confirmButtonText: 'OK',
              customClass: {
                container: 'mm-order-swal-container',
                popup: 'custom-swal-popup',
                title: 'custom-swal-title',
                htmlContainer: 'custom-swal-html',
                confirmButton: 'custom-swal-confirm'
              },
              buttonsStyling: false
            });
          }
          closeOrderSummaryModal();
          return;
        } catch (checkoutErr) {
          console.error('PayMongo checkout error:', checkoutErr);
          if (typeof Swal !== 'undefined') {
            Swal.fire({
              target: document.body,
              icon: 'error',
              title: 'Connection Error',
              text: 'Could not reach the payment gateway. Your order was saved as Pending Payment.',
              confirmButtonText: 'OK',
              customClass: {
                container: 'mm-order-swal-container',
                popup: 'custom-swal-popup',
                title: 'custom-swal-title',
                htmlContainer: 'custom-swal-html',
                confirmButton: 'custom-swal-confirm'
              },
              buttonsStyling: false
            });
          }
          closeOrderSummaryModal();
          return;
        }
      }

      closeOrderSummaryModal();

      lastPlacedOrderData = {
        ...data.order,
        items: currentOrderSummaryItems,
        points_used: data.points_used,
        points_earned: data.points_earned,
        total_amount: finalPayableTotal,
        pickup_date: pickupInput.value
      };

      // Permanenteng i-update ang points sa screen gamit ang value mula sa Supabase
      const updatedBalance = parseFloat(data.new_loyalty_points || 0);
      availableLoyaltyPoints = updatedBalance;

      const ptsHeader = document.getElementById('displayLoyaltyPoints');
      const pesoHeader = document.getElementById('displayLoyaltyPeso');
      if (ptsHeader) ptsHeader.innerText = `${updatedBalance.toFixed(1)} pts`;
      if (pesoHeader) pesoHeader.innerText = `(₱${(updatedBalance * 1.0).toFixed(2)})`;

      if (typeof loadRecentOrders === 'function') {
        loadRecentOrders();
      }

      if (typeof Swal !== 'undefined') {
        Swal.fire({
          target: document.body,
          icon: 'success',
          title: 'Order Confirmed!',
          html: `
            <p style="color: #7C4F38; font-size: 14px; margin-bottom: 8px;">Order No: <strong>${data.order.order_number}</strong></p>
            ${data.points_used > 0 ? `<p style="color: #E27D80; font-weight: 700; margin: 4px 0;">Points Used: -${data.points_used.toFixed(1)} pts</p>` : ''}
            <div style="background: #FFF5F4; border-radius: 12px; padding: 10px; margin: 10px 0; font-weight: 800; color: #594A42;">
              🎉 You earned +${Number(data.points_earned || 0).toFixed(1)} loyalty points!
            </div>
            <button type="button" class="btn-download-receipt" onclick="downloadReceiptPDF()" style="margin-top: 10px; padding: 8px 18px; font-weight: 800; border-radius: 99px; border: 1.5px solid #FCE1DD; background: #FFF; color: #F48A8E; cursor: pointer;">
              <i class="fa-solid fa-file-arrow-down"></i> Download Receipt (PDF)
            </button>
          `,
          confirmButtonText: 'Got It!',
          customClass: {
            container: 'mm-order-swal-container',
            popup: 'custom-swal-popup',
            title: 'custom-swal-title',
            htmlContainer: 'custom-swal-html',
            confirmButton: 'custom-swal-confirm'
          },
          buttonsStyling: false
        });
      }
    } else {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          target: document.body,
          icon: 'error',
          title: 'Failed to Place Order',
          text: data.message || 'Could not save your order.',
          confirmButtonText: 'OK',
          customClass: {
            container: 'mm-order-swal-container',
            popup: 'custom-swal-popup',
            title: 'custom-swal-title',
            htmlContainer: 'custom-swal-html',
            confirmButton: 'custom-swal-confirm'
          },
          buttonsStyling: false
        });
      }
    }
  } catch (err) {
    console.error('Order error:', err);
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        target: document.body,
        icon: 'error',
        title: 'Connection Error',
        text: 'Could not connect to the server.',
        confirmButtonText: 'OK',
        customClass: {
          container: 'mm-order-swal-container',
          popup: 'custom-swal-popup',
          title: 'custom-swal-title',
          htmlContainer: 'custom-swal-html',
          confirmButton: 'custom-swal-confirm'
        },
        buttonsStyling: false
      });
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Place Order';
    }
  }
};