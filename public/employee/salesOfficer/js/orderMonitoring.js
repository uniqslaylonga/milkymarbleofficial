let allActiveOrders = [];
let filteredActiveOrders = [];
let currentMonitoringPage = 1;
const MONITORING_PAGE_SIZE = 6; // 6 cards bawat page para sa 3-column grid

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Filter Event Listeners
    const statusFilter = document.getElementById('statusFilter');
    const dateFilter = document.getElementById('dateFilter');
    const customDateInput = document.getElementById('customDateInput');
    const searchInput = document.getElementById('monitoringSearchInput');

    if (statusFilter) {
        statusFilter.addEventListener('change', applyMonitoringFilters);
    }

    if (dateFilter) {
        dateFilter.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customDateInput.style.display = 'inline-block';
                if (!customDateInput.value) {
                    customDateInput.value = new Date().toISOString().split('T')[0];
                }
            } else {
                customDateInput.style.display = 'none';
            }
            applyMonitoringFilters();
        });
    }

    if (customDateInput) {
        customDateInput.addEventListener('change', applyMonitoringFilters);
    }

    if (searchInput) {
        searchInput.addEventListener('input', applyMonitoringFilters);
    }

    // 2. Pagination Buttons
    const prevBtn = document.getElementById('prevMonitoringBtn');
    const nextBtn = document.getElementById('nextMonitoringBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentMonitoringPage > 1) {
                currentMonitoringPage--;
                renderPaginatedMonitoringCards();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredActiveOrders.length / MONITORING_PAGE_SIZE) || 1;
            if (currentMonitoringPage < totalPages) {
                currentMonitoringPage++;
                renderPaginatedMonitoringCards();
            }
        });
    }

    await fetchOrderMonitoringData();
});

async function fetchOrderMonitoringData() {
    try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const headers = userId ? { 'x-user-id': userId } : {};

        const response = await fetch('/api/sales-officer/order-monitoring', { headers });
        if (!response.ok) throw new Error('Failed to load order monitoring data');

        const data = await response.json();

        // Populate User Header
        if (data.user) {
            const userNameEl = document.getElementById('userName');
            const userAvatarEl = document.getElementById('userAvatar');
            if (userNameEl) userNameEl.textContent = data.user.fullName || 'Sales Officer';
            if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;
        }

        // Populate Overview Counters
        if (data.metrics) {
            const preparingEl = document.getElementById('preparingCount');
            const transitEl = document.getElementById('transitCount');
            const cancelledEl = document.getElementById('cancelledCount');

            if (preparingEl) preparingEl.textContent = Number(data.metrics.preparingCount || 0).toLocaleString();
            if (transitEl) transitEl.textContent = Number(data.metrics.transitCount || 0).toLocaleString();
            if (cancelledEl) cancelledEl.textContent = Number(data.metrics.cancelledCount || 0).toLocaleString();
        }

        allActiveOrders = data.activeOrders || [];
        applyMonitoringFilters();

    } catch (error) {
        console.warn('API route unavailable, loading fallback active orders:', error);

        // Fallback demo data para magamit agad kapag offline ang database
        allActiveOrders = [
            {
                id: 201,
                order_number: 'MM-2026-081',
                customer_id: null,
                guest_name: 'Kristine Alcantara',
                items_summary: '1x Taro Milk Tea (16oz, Pearls, 50% Sugar)',
                total_amount: 140.00,
                status: 'READY_FOR_PICKUP',
                placed_at: new Date().toISOString()
            },
            {
                id: 202,
                order_number: 'MM-2026-082',
                customer_id: 18,
                customer_name: 'Joshua Morales',
                items_summary: '2x Classic Pearl Milk Tea (22oz, Coffee Jelly)',
                total_amount: 270.00,
                status: 'PREPARING',
                placed_at: new Date().toISOString()
            },
            {
                id: 203,
                order_number: 'MM-2026-083',
                customer_id: null,
                guest_name: 'Grace Mendoza',
                items_summary: '1x Matcha Cream Marble (16oz)',
                total_amount: 155.00,
                status: 'READY_FOR_PICKUP',
                placed_at: new Date().toISOString()
            }
        ];

        // Update fallback overview counters
        updateFallbackCounters();
        applyMonitoringFilters();
    }
}

function updateFallbackCounters() {
    const preparingCount = allActiveOrders.filter(o => o.status === 'PREPARING' || o.status === 'CONFIRMED').length;
    const readyCount = allActiveOrders.filter(o => o.status === 'READY_FOR_PICKUP' || o.status === 'IN_TRANSIT').length;

    const prepEl = document.getElementById('preparingCount');
    const transitEl = document.getElementById('transitCount');
    const claimEl = document.getElementById('cancelledCount');

    if (prepEl) prepEl.textContent = preparingCount.toString();
    if (transitEl) transitEl.textContent = readyCount.toString();
    if (claimEl) claimEl.textContent = '0';
}

// Filter Logic (Status + Date + Search)
function applyMonitoringFilters() {
    const statusVal = document.getElementById('statusFilter')?.value || 'all';
    const dateVal = document.getElementById('dateFilter')?.value || 'today';
    const customDateVal = document.getElementById('customDateInput')?.value;
    const searchVal = document.getElementById('monitoringSearchInput')?.value.trim().toLowerCase() || '';

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    filteredActiveOrders = allActiveOrders.filter(ord => {
        // Status Check
        let passStatus = true;
        if (statusVal === 'in_kitchen') {
            passStatus = (ord.status === 'PREPARING' || ord.status === 'CONFIRMED');
        } else if (statusVal === 'ready_pickup') {
            passStatus = (ord.status === 'READY_FOR_PICKUP' || ord.status === 'IN_TRANSIT');
        }

        // Date Check
        let passDate = true;
        if (ord.placed_at) {
            const ordDate = new Date(ord.placed_at);
            const ordDateStr = ord.placed_at.split('T')[0];

            if (dateVal === 'today') {
                passDate = ordDateStr === todayStr;
            } else if (dateVal === 'week') {
                passDate = ordDate >= weekAgo;
            } else if (dateVal === 'month') {
                passDate = ordDate >= startOfMonth;
            } else if (dateVal === 'custom') {
                passDate = ordDateStr === customDateVal;
            }
        }

        // Search Check
        let passSearch = true;
        if (searchVal) {
            const num = (ord.order_number || '').toLowerCase();
            const name = (ord.customer_name || ord.guest_name || '').toLowerCase();
            const items = (ord.items_summary || '').toLowerCase();
            passSearch = num.includes(searchVal) || name.includes(searchVal) || items.includes(searchVal);
        }

        return passStatus && passDate && passSearch;
    });

    currentMonitoringPage = 1;
    renderPaginatedMonitoringCards();
}

// Render Order Cards with Permanent Pager
function renderPaginatedMonitoringCards() {
    const ordersGrid = document.getElementById('activeOrdersGrid');
    const pageInfo = document.getElementById('monitoringPageInfo');
    const prevBtn = document.getElementById('prevMonitoringBtn');
    const nextBtn = document.getElementById('nextMonitoringBtn');

    if (!ordersGrid) return;

    if (filteredActiveOrders.length === 0) {
        ordersGrid.innerHTML = '<p class="loading-state-text">No active orders found for the selected period/status.</p>';
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 orders';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        renderMonitoringPagerButtons(1, 1);
        return;
    }

    const totalPages = Math.ceil(filteredActiveOrders.length / MONITORING_PAGE_SIZE) || 1;
    const startIndex = (currentMonitoringPage - 1) * MONITORING_PAGE_SIZE;
    const pageItems = filteredActiveOrders.slice(startIndex, startIndex + MONITORING_PAGE_SIZE);

    if (pageInfo) {
        const startNum = startIndex + 1;
        const endNum = Math.min(startIndex + MONITORING_PAGE_SIZE, filteredActiveOrders.length);
        pageInfo.textContent = `Showing ${startNum}-${endNum} of ${filteredActiveOrders.length} orders`;
    }
    if (prevBtn) prevBtn.disabled = currentMonitoringPage <= 1;
    if (nextBtn) nextBtn.disabled = currentMonitoringPage >= totalPages;

    renderMonitoringPagerButtons(totalPages, currentMonitoringPage);

    // Build Cards
    ordersGrid.innerHTML = pageItems.map(ord => {
        const dateFormatted = new Date(ord.placed_at).toLocaleDateString('en-US', {
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

        // Status styling: Ready for pickup vs In Kitchen
        const isReady = (ord.status === 'READY_FOR_PICKUP' || ord.status === 'IN_TRANSIT');
        const statusLabel = isReady ? 'Ready for Pickup' : 'In Kitchen (Prep)';
        const statusClass = isReady ? 'ready' : 'kitchen';

        return `
            <div class="order-card" id="monitoring-card-${ord.id}">
                <div class="card-main">
                    <div class="info-col">
                        <div class="name-badge-group">
                            <span class="person-name">${displayName}</span>
                            <span class="client-badge ${badgeClass}">${badgeText}</span>
                        </div>
                        <div class="person-role">${escapeHtml(ord.order_number || '')} • ${dateFormatted}</div>
                    </div>
                    <div class="price-col">₱${amount}</div>
                </div>

                <div class="card-details-box">
                    ${escapeHtml(ord.items_summary || 'Custom drink order')}
                </div>

                <div class="card-bottom">
                    <span class="status-badge-pill ${statusClass}">
                        <span class="status-dot"></span>
                        ${statusLabel}
                    </span>
                    
                    ${isReady ? `
                        <button type="button" class="btn-handover" onclick="markOrderAsPickedUp(${ord.id})" title="Customer received order">
                            Hand Over / Claimed
                        </button>
                    ` : `
                        <span class="in-kitchen-note">Kitchen preparing...</span>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

// Numbered Page Buttons: 1, 2, 3...
function renderMonitoringPagerButtons(totalPages, activePage) {
    const pagerNumbers = document.getElementById('monitoringPagerNumbers');
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
            if (page && page !== currentMonitoringPage) {
                currentMonitoringPage = page;
                renderPaginatedMonitoringCards();
            }
        });
    });
}

// Action: Customer Handover / Pickup Complete
async function markOrderAsPickedUp(orderId) {
    if (!confirm(`Confirm handover for Order #${orderId}? This will complete the order.`)) return;

    try {
        await fetch('/api/sales-officer/order-monitoring/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, action: 'complete' })
        });
    } catch (err) {
        console.warn('API handover update offline, proceeding with local update:', err);
    }

    // Alisin sa active list dahil COMPLETED na
    allActiveOrders = allActiveOrders.filter(o => o.id !== orderId);

    // Update claimed counter
    const claimedEl = document.getElementById('cancelledCount');
    if (claimedEl) {
        claimedEl.textContent = (parseInt(claimedEl.textContent || '0', 10) + 1).toString();
    }

    updateFallbackCounters();
    applyMonitoringFilters();
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