document.addEventListener('DOMContentLoaded', () => {
    // 1. Kunin ang order_id mula sa URL parameter (e.g. orderProduction.html?order_id=101)
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('order_id') || urlParams.get('id') || 'MM-PRE-081';

    // 2. I-load ang mga detalye ng order at ingredient deduction check
    fetchOrderProductionDetails(orderId);

    // 3. Search Bar listener sa topbar kung mayroon
    const searchInput = document.querySelector('.search-box input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const target = searchInput.value.trim();
                if (target) {
                    window.location.href = `orderProduction.html?order_id=${encodeURIComponent(target)}`;
                }
            }
        });
    }

    // 4. Complete button listener
    const completeBtn = document.getElementById('completeOrderBtn') || document.querySelector('.complete-btn') || document.querySelector('button.btn-primary');
    if (completeBtn) {
        completeBtn.addEventListener('click', () => handleCompleteOrder(orderId));
    }
});

async function fetchOrderProductionDetails(orderId) {
    try {
        let response;
        if (typeof employeeFetch === 'function') {
            response = await employeeFetch(`/api/production-supervisor/order-production?order_id=${encodeURIComponent(orderId)}`);
        } else {
            const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
            const headers = userId ? { 'x-user-id': userId } : {};
            response = await fetch(`/api/production-supervisor/order-production?order_id=${encodeURIComponent(orderId)}`, { headers });
        }

        if (!response.ok) throw new Error(await EmployeeUI.errorMessage(response));

        const data = await response.json();

        // I-populate ang User Header
        if (data.user) {
            const userFullNameEl = document.getElementById('userFullName') || document.getElementById('userName');
            const userAvatarEl = document.getElementById('userAvatar');
            if (userFullNameEl) userFullNameEl.textContent = data.user.fullName || 'Production Supervisor';
            if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;
        }

        renderOrderDetails(data.order);
        renderMaterialInventoryCheck(data.materials);

    } catch (error) {
        console.error('Could not load live data from the server:', error);
        if (window.EmployeeUI) { EmployeeUI.showError(error); EmployeeUI.failTables(); }
    }
}

function renderOrderDetails(order) {
    if (!order) return;

    // Order Title at Number
    const orderTitleEl = document.querySelector('.welcome-copy h1') || document.querySelector('.panel-header h2') || document.getElementById('orderTitleDisplay');
    const orderNumberSmallEl = document.getElementById('orderNumberTag') || document.querySelector('.order-name-block small');
    const customerNameEl = document.getElementById('customerNameTag');

    if (orderTitleEl) orderTitleEl.textContent = `${order.flavor_name} (${order.cup_size})`;
    if (orderNumberSmallEl) orderNumberSmallEl.textContent = `${order.order_number} • ${order.type}`;
    if (customerNameEl) customerNameEl.textContent = `Customer: ${order.customer_name} • Slot: ${order.claim_window}`;

    // Specification Pills (Pinalitan ang lumang Coffee / Spaghetti)
    const specsContainer = document.getElementById('orderSpecsPills') || document.querySelector('.order-specs-row');
    if (specsContainer) {
        const toppingsHtml = (order.toppings || []).map(top => `<span class="spec-pill topping">${escapeHtml(top)}</span>`).join('');
        specsContainer.innerHTML = `
            <span class="spec-pill size">${escapeHtml(order.cup_size)}</span>
            <span class="spec-pill sugar">${escapeHtml(order.sugar_level)}</span>
            <span class="spec-pill ice">${escapeHtml(order.ice_level)}</span>
            ${toppingsHtml}
            <span class="spec-pill shelf">📍 Assign to: ${escapeHtml(order.shelf_location)}</span>
        `;
    }
}

function renderMaterialInventoryCheck(materials) {
    const tbody = document.getElementById('materialsTableBody') || document.querySelector('.cust-table tbody');
    if (!tbody) return;

    if (!materials || materials.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#888;">No recipe inventory recorded for this item.</td></tr>';
        return;
    }

    tbody.innerHTML = materials.map(mat => `
        <tr>
            <td><strong>${escapeHtml(mat.item_name)}</strong></td>
            <td><span class="portion-badge">${escapeHtml(mat.required_qty)}</span></td>
            <td>${escapeHtml(mat.stock_on_hand)}</td>
            <td><span class="status-badge-prep ready">✓ In Stock</span></td>
        </tr>
    `).join('');
}

async function handleCompleteOrder(orderId) {
    const confirmAction = confirm(`Mark order "${orderId}" as SEALED & READY for pickup?`);
    if (!confirmAction) return;

    try {
        const response = await employeeFetch('/api/production-supervisor/complete-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, stage: 'READY' })
        });
        if (!response.ok) throw new Error(await EmployeeUI.errorMessage(response));
    } catch (err) {
        console.error('Complete order failed:', err);
        alert('Could not mark this order as ready: ' + (err.message || 'unknown error') + '. Nothing was changed.');
        return;
    }

    alert(`Order ${orderId} is now marked Ready for Pickup.`);
    window.location.href = 'orderList.html';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}