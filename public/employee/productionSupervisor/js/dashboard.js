document.addEventListener('DOMContentLoaded', () => {
    fetchProductionDashboardData();
});

async function fetchProductionDashboardData() {
    try {
        const response = await employeeFetch('/api/production-supervisor/dashboard');
        if (!response.ok) throw new Error('Failed to load production dashboard data');

        const data = await response.json();

        // User profile setup
        const userFullNameEl = document.getElementById('userFullName');
        const userFirstNameEl = document.getElementById('userFirstName');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userFullNameEl) userFullNameEl.textContent = data.user.fullName;
        if (userFirstNameEl) userFirstNameEl.textContent = data.user.firstName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        // KPI Metrics
        document.getElementById('completedToday').textContent = String(data.metrics.completedToday).padStart(2, '0');
        document.getElementById('pendingOrders').textContent = String(data.metrics.pendingOrders).padStart(2, '0');
        document.getElementById('inProduction').textContent = String(data.metrics.inProduction).padStart(2, '0');
        document.getElementById('reservedStocks').textContent = String(data.metrics.reservedStocks).padStart(2, '0');

        // Render Recent Orders
        renderRecentOrders(data.recentOrders);

        // Render Schedule List
        renderScheduleList(data.scheduleList);

    } catch (error) {
        console.error('Error fetching production dashboard data:', error);
        const ordersContainer = document.getElementById('recentOrdersList');
        if (ordersContainer) {
            ordersContainer.innerHTML = '<div style="padding: 24px; text-align: center; color: red;">Failed to load active orders.</div>';
        }
    }
}

function renderRecentOrders(orders) {
    const container = document.getElementById('recentOrdersList');
    if (!container) return;

    if (!orders || orders.length === 0) {
        container.innerHTML = '<div style="padding: 24px; text-align: center; color: #888;">No active production orders recorded.</div>';
        return;
    }

    container.innerHTML = orders.map((ro, idx) => {
        const isLast = idx === orders.length - 1;
        const totalAmount = Number(ro.total_amount || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        return `
            <div class="order-row ${isLast ? 'last-row' : ''}" onclick="window.location.href='orderProduction.html?order_id=${ro.id}'" style="cursor: pointer;">
                <div class="order-name-wrap">
                    <span class="product-icon"><i class="fa-solid fa-mug-hot"></i></span>
                    <div class="order-name-block">
                        <strong>${escapeHtml(ro.cleanTitle)}</strong>
                        <small>${escapeHtml(ro.order_number)}</small>
                    </div>
                </div>
                <span>${parseInt(ro.quantity || 1, 10)} cups</span>
                <span style="font-size: 13px; color: #666;">${escapeHtml(ro.scheduleText)}</span>
                <span class="amount">₱ ${totalAmount}</span>
                <span class="status-badge ${escapeHtml(ro.statusClass)}">${escapeHtml(ro.statusLabel)}</span>
            </div>
        `;
    }).join('');
}

function renderScheduleList(schedules) {
    const container = document.getElementById('scheduleList');
    if (!container) return;

    if (!schedules || schedules.length === 0) {
        const nowTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        container.innerHTML = `
            <div class="schedule-item">
                <div class="schedule-day">Today</div>
                <div class="schedule-time">${nowTime}</div>
                <div class="schedule-label">Standard Production</div>
            </div>
        `;
        return;
    }

    container.innerHTML = schedules.map(sch => `
        <div class="schedule-item">
            <div class="schedule-day">${escapeHtml(sch.dayName)}</div>
            <div class="schedule-time">${escapeHtml(sch.timeStr)}</div>
            <div class="schedule-label">${escapeHtml(sch.order_number)}</div>
        </div>
    `).join('');
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