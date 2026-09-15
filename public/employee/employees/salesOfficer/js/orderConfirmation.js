document.addEventListener('DOMContentLoaded', async () => {
    try {
        const userId = localStorage.getItem('userId');
        const headers = userId ? { 'x-user-id': userId } : {};

        const response = await fetch('/api/sales-officer/order-confirmation', { headers });
        if (!response.ok) throw new Error('Failed to load order confirmation data');
        
        const data = await response.json();

        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');
        if (userNameEl) userNameEl.textContent = data.user.fullName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        const todayOrdersEl = document.getElementById('todayOrders');
        const todaySalesEl = document.getElementById('todaySales');
        const pendingOrdersEl = document.getElementById('pendingOrders');

        if (todayOrdersEl) {
            todayOrdersEl.textContent = Number(data.metrics.todayOrders).toLocaleString();
        }
        if (todaySalesEl) {
            todaySalesEl.textContent = '₱' + Number(data.metrics.todaySales).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
        if (pendingOrdersEl) {
            pendingOrdersEl.textContent = Number(data.metrics.pendingOrders).toLocaleString();
        }

        const ordersGrid = document.getElementById('recentOrdersGrid');
        if (ordersGrid) {
            if (data.recentOrders && data.recentOrders.length > 0) {
                ordersGrid.innerHTML = data.recentOrders.map(ord => {
                    const dateFormatted = new Date(ord.placed_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: '2-digit',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                    });
                    const amount = Number(ord.total_amount).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                    
                    return `
                        <div class="order-card">
                            <div class="card-main">
                                <div class="info-col">
                                    <div class="person-name">${escapeHtml(ord.customer_name)}</div>
                                    <div class="person-role">${escapeHtml(ord.order_number)} • ${dateFormatted}</div>
                                </div>
                                <div class="price-col">₱${amount}</div>
                            </div>
                            <div class="card-bottom">
                                <span class="purpose-label">Status: <strong>${escapeHtml(ord.status)}</strong></span>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                ordersGrid.innerHTML = '<p style="padding: 20px;">No recent transactions recorded.</p>';
            }
        }
    } catch (error) {
        console.error('Error fetching order confirmation data:', error);
    }
});

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}