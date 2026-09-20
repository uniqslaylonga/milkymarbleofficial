// Global State para sa Confirmation Desk
let allPendingOrders = [];
let filteredPendingOrders = [];
let currentOrderPage = 1;
const ORDERS_PAGE_SIZE = 5; // 5 orders bawat page

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Date Filter Listeners
    const filterSelect = document.getElementById('orderDateFilter');
    const customDateInput = document.getElementById('orderCustomDate');
    const searchInput = document.getElementById('orderSearchInput');

    if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customDateInput.style.display = 'inline-block';
                if (!customDateInput.value) {
                    customDateInput.value = SalesCommon.localDate(new Date());
                }
            } else {
                customDateInput.style.display = 'none';
            }
            applyOrderFilters();
        });
    }

    if (customDateInput) {
        customDateInput.addEventListener('change', applyOrderFilters);
    }

    if (searchInput) {
        searchInput.addEventListener('input', applyOrderFilters);
    }

    // 2. Pagination Buttons
    const prevBtn = document.getElementById('prevOrderBtn');
    const nextBtn = document.getElementById('nextOrderBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentOrderPage > 1) {
                currentOrderPage--;
                renderPaginatedOrders();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredPendingOrders.length / ORDERS_PAGE_SIZE) || 1;
            if (currentOrderPage < totalPages) {
                currentOrderPage++;
                renderPaginatedOrders();
            }
        });
    }

    await loadOrderConfirmationData();
});

// Fetch Data mula sa Backend API
async function loadOrderConfirmationData() {
    try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const headers = userId ? { 'x-user-id': userId } : {};

        const response = await fetch('/api/sales-officer/order-confirmation', { headers });
        if (!response.ok) throw new Error(await SalesCommon.errorMessage(response));

        const data = await response.json();

        // 1. User Header Details
        if (data.user) {
            const userNameEl = document.getElementById('userName');
            const userAvatarEl = document.getElementById('userAvatar');
            if (userNameEl) userNameEl.textContent = data.user.fullName || 'Sales Officer';
            if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;
        }

        // 2. Metrics Counters
        if (data.metrics) {
            const pendingEl = document.getElementById('pendingCount');
            const confirmedEl = document.getElementById('confirmedCount');
            const rejectedEl = document.getElementById('rejectedCount');

            if (pendingEl) pendingEl.textContent = Number(data.metrics.pendingCount || 0).toLocaleString();
            if (confirmedEl) confirmedEl.textContent = Number(data.metrics.confirmedToday || 0).toLocaleString();
            if (rejectedEl) rejectedEl.textContent = Number(data.metrics.rejectedCount || 0).toLocaleString();
        }

        allPendingOrders = data.pendingOrders || [];
        applyOrderFilters();

    } catch (error) {
        console.error('Could not load live data from the server:', error);
        SalesCommon.showError(error);
        SalesCommon.failTables();
    }
}

// Filter Logic: Date + Search Query
function applyOrderFilters() {
    const filterType = document.getElementById('orderDateFilter')?.value || 'today';
    const customDateVal = document.getElementById('orderCustomDate')?.value;
    const searchVal = document.getElementById('orderSearchInput')?.value.trim().toLowerCase() || '';

    const now = new Date();
    const todayStr = SalesCommon.localDate(now);

    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    filteredPendingOrders = allPendingOrders.filter(ord => {
        // Date Check
        let passDate = true;
        if (ord.placed_at) {
            const ordDate = new Date(ord.placed_at);
            const ordDateStr = SalesCommon.localDate(ord.placed_at);

            if (filterType === 'today') {
                passDate = ordDateStr === todayStr;
            } else if (filterType === 'week') {
                passDate = ordDate >= weekAgo;
            } else if (filterType === 'month') {
                passDate = ordDate >= startOfMonth;
            } else if (filterType === 'custom') {
                passDate = ordDateStr === customDateVal;
            }
        }

        // Search Check
        let passSearch = true;
        if (searchVal) {
            const orderNum = (ord.order_number || '').toLowerCase();
            const custName = (ord.customer_name || ord.guest_name || '').toLowerCase();
            const items = (ord.items_summary || '').toLowerCase();
            passSearch = orderNum.includes(searchVal) || custName.includes(searchVal) || items.includes(searchVal);
        }

        return passDate && passSearch;
    });

    currentOrderPage = 1;
    renderPaginatedOrders();
}

// Render ng Rows at Pagination
function renderPaginatedOrders() {
    const tableBody = document.getElementById('confirmationTableBody');
    const pageInfo = document.getElementById('orderPageInfo');
    const prevBtn = document.getElementById('prevOrderBtn');
    const nextBtn = document.getElementById('nextOrderBtn');

    if (!tableBody) return;

    if (filteredPendingOrders.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="loading-state-text">No pending orders found for the selected period.</td>
            </tr>
        `;
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 orders';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        renderPagerButtons(1, 1);
        return;
    }

    const totalPages = Math.ceil(filteredPendingOrders.length / ORDERS_PAGE_SIZE) || 1;
    const startIndex = (currentOrderPage - 1) * ORDERS_PAGE_SIZE;
    const pageItems = filteredPendingOrders.slice(startIndex, startIndex + ORDERS_PAGE_SIZE);

    // Update Pagination Text
    if (pageInfo) {
        const startNum = startIndex + 1;
        const endNum = Math.min(startIndex + ORDERS_PAGE_SIZE, filteredPendingOrders.length);
        pageInfo.textContent = `Showing ${startNum}-${endNum} of ${filteredPendingOrders.length} orders`;
    }
    if (prevBtn) prevBtn.disabled = currentOrderPage <= 1;
    if (nextBtn) nextBtn.disabled = currentOrderPage >= totalPages;

    renderPagerButtons(totalPages, currentOrderPage);

    // Build Table Rows
    tableBody.innerHTML = pageItems.map(ord => {
        const dateFormatted = new Date(ord.placed_at).toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        const amount = Number(ord.total_amount || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        const isGuest = !ord.customer_id;
        const badgeClass = isGuest ? 'badge-guest' : 'badge-member';
        const badgeText = isGuest ? 'Guest' : 'Member';
        const displayName = escapeHtml(ord.customer_name || ord.guest_name || 'Customer');

        return `
            <tr id="order-row-${ord.id}">
                <td>
                    <span class="order-code-bold">${escapeHtml(ord.order_number || 'MM-ORD')}</span>
                    <span class="order-time-sub">${dateFormatted}</span>
                </td>
                <td>
                    <div class="customer-cell-wrap">
                        <span class="cust-name">${displayName}</span>
                        <span class="client-badge ${badgeClass}">${badgeText}</span>
                    </div>
                </td>
                <td>
                    <div class="items-summary-text">${escapeHtml(ord.items_summary || 'Custom drink order')}</div>
                </td>
                <td>
                    <span class="payment-method-pill">${escapeHtml(ord.payment_method || 'Cash on Pick-Up')}</span>
                </td>
                <td>
                    <span class="order-total-val">₱${amount}</span>
                </td>
                <td style="text-align: center;">
                    <div class="action-btn-group">
                        <button type="button" class="btn-confirm" onclick="confirmOrder(${ord.id})" title="Approve &amp; Send to Kitchen">Confirm</button>
                        <button type="button" class="btn-reject" onclick="rejectOrder(${ord.id})" title="Cancel Order">Reject</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Numbered Page Buttons: 1, 2, 3...
function renderPagerButtons(totalPages, activePage) {
    const pagerNumbers = document.getElementById('orderPagerNumbers');
    if (!pagerNumbers) return;

    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        const isActive = i === activePage ? 'active' : '';
        html += `<button type="button" class="pager-num-btn ${isActive}" data-page="${i}">${i}</button>`;
    }
    pagerNumbers.innerHTML = html;

    pagerNumbers.querySelectorAll('.pager-num-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const page = parseInt(e.currentTarget.getAttribute('data-page'), 10);
            if (page && page !== currentOrderPage) {
                currentOrderPage = page;
                renderPaginatedOrders();
            }
        });
    });
}

// Action: Confirm Order (Ipapasa sa Kusina)
// Moves the order to PREPARING - the real, validated endpoint for changing an
// order's status lives in orderRoutes.js at /api/orders/:id/status (it also
// sends the customer their status-update email). There is no separate
// /api/sales-officer/orders/:id/status route - calling that 404s silently.
async function confirmOrder(orderId) {
    if (!confirm(`Are you sure you want to confirm Order #${orderId}? It will be queued to production.`)) return;

    try {
        const response = await fetch(`/api/orders/${orderId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'PREPARING' })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.message || 'Failed to confirm order.');
        }

        // Alisin sa listahan ng pending
        allPendingOrders = allPendingOrders.filter(o => o.id !== orderId);

        // I-update ang counters
        const pendingEl = document.getElementById('pendingCount');
        const confirmedEl = document.getElementById('confirmedCount');
        if (pendingEl) pendingEl.textContent = allPendingOrders.length;
        if (confirmedEl) confirmedEl.textContent = (parseInt(confirmedEl.textContent || '0', 10) + 1).toString();

        applyOrderFilters();
    } catch (err) {
        console.error('Error confirming order:', err);
        alert(err.message || 'Could not confirm this order. Please try again.');
    }
}

// Action: Reject Order (Kanselahin)
async function rejectOrder(orderId) {
    const reason = prompt('Please enter reason for rejecting this order (optional):');
    if (reason === null) return; // kinansela ng user ang prompt

    try {
        const response = await fetch(`/api/orders/${orderId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'CANCELLED', reason })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.message || 'Failed to reject order.');
        }

        allPendingOrders = allPendingOrders.filter(o => o.id !== orderId);

        const pendingEl = document.getElementById('pendingCount');
        const rejectedEl = document.getElementById('rejectedCount');
        if (pendingEl) pendingEl.textContent = allPendingOrders.length;
        if (rejectedEl) rejectedEl.textContent = (parseInt(rejectedEl.textContent || '0', 10) + 1).toString();

        applyOrderFilters();
    } catch (err) {
        console.error('Error rejecting order:', err);
        alert(err.message || 'Could not reject this order. Please try again.');
    }
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