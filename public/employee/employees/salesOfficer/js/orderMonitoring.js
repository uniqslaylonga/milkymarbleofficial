document.addEventListener('DOMContentLoaded', () => {
    fetchOrderMonitoringData();
});

async function fetchOrderMonitoringData() {
    try {
        const userId = localStorage.getItem('userId');
        const headers = userId ? { 'x-user-id': userId } : {};

        const response = await fetch('/api/sales-officer/order-monitoring', { headers });
        if (!response.ok) throw new Error('Failed to load order monitoring data');

        const data = await response.json();

        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');
        if (userNameEl) userNameEl.textContent = data.user.fullName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        const preparingEl = document.getElementById('preparingCount');
        const transitEl = document.getElementById('transitCount');
        const cancelledEl = document.getElementById('cancelledCount');

        if (preparingEl) preparingEl.textContent = Number(data.metrics.preparingCount).toLocaleString();
        if (transitEl) transitEl.textContent = Number(data.metrics.transitCount).toLocaleString();
        if (cancelledEl) cancelledEl.textContent = Number(data.metrics.cancelledCount).toLocaleString();

        renderActiveOrders(data.activeOrders);
    } catch (error) {
        console.error('Error fetching order monitoring data:', error);
        const grid = document.getElementById('activeOrdersGrid');
        if (grid) {
            grid.innerHTML = '<p style="padding: 20px; color: red;">Failed to load active orders.</p>';
        }
    }
}

function renderActiveOrders(orders) {
    const ordersGrid = document.getElementById('activeOrdersGrid');
    if (!ordersGrid) return;

    if (!orders || orders.length === 0) {
        ordersGrid.innerHTML = '<p style="padding: 20px;">No active orders currently processing.</p>';
        return;
    }

    ordersGrid.innerHTML = orders.map(ord => {
        const amount = Number(ord.total_amount).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        return `
            <div class="order-card">
                <div class="card-main">
                    <div class="info-col">
                        <div class="person-name">${escapeHtml(ord.customer_name)}</div>
                        <div class="person-role">${escapeHtml(ord.order_number)} • ${ord.item_count || 1} items</div>
                    </div>
                    <div class="price-col">₱${amount}</div>
                </div>
                <div class="card-bottom">
                    <span class="purpose-label">Status: <strong>${escapeHtml(ord.status)}</strong></span>
                    <div style="display:inline-flex; gap:6px;">
                        <button type="button" class="btn-action check" title="Approve / Complete" onclick="updateOrderStatus(${ord.id}, 'complete')">✓</button>
                        <button type="button" class="btn-action close" title="Cancel / Reject" onclick="updateOrderStatus(${ord.id}, 'cancel')">✕</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function updateOrderStatus(orderId, action) {
    try {
        const response = await fetch('/api/sales-officer/order-monitoring/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, action: action })
        });

        const result = await response.json();
        if (result.status === 'success') {
            fetchOrderMonitoringData();
        } else {
            alert('Action failed: ' + (result.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error updating order status:', error);
        alert('Failed to update order status. Please try again.');
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