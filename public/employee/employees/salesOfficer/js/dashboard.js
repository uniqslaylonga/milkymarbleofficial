document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Retrieve logged-in user ID stored during login session
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const headers = {};
        if (userId) {
            headers['x-user-id'] = userId;
        }

        const response = await fetch('/api/sales-officer/dashboard', { headers });
        if (!response.ok) throw new Error('Failed to load dashboard data');
        
        const data = await response.json();

        // Populate User Info dynamically from database
        const userNameEl = document.getElementById('userName');
        const userFirstNameEl = document.getElementById('userFirstName');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userNameEl) userNameEl.textContent = data.user.fullName;
        if (userFirstNameEl) userFirstNameEl.textContent = data.user.firstName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        // Populate Performance Metrics
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

        // Render Recent Transactions
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
        console.error('Error fetching dashboard data:', error);
    }
});

async function loadPageData() {
    try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const headers = {};
        if (userId) {
            headers['x-user-id'] = userId;
        }

        const response = await fetch('/api/sales-officer/dashboard', { headers });
        if (!response.ok) throw new Error('Failed to load page data');

        const data = await response.json();

        // 1. Update User Header
        if (data.user) {
            const userNameEl = document.getElementById('userName');
            const userAvatarEl = document.getElementById('userAvatar');
            if (userNameEl) userNameEl.textContent = data.user.fullName;
            if (userAvatarEl) userAvatarEl.src = data.user.avatarSrc;
        }

        // 2. Render Tables & Metrics
        renderContent(data);
    } catch (error) {
        console.error('Data load error:', error);
        // Clear "Loading..." indicators on failure so the user doesn't see broken placeholders
        const tableBody = document.querySelector('tbody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; color:#d9534f;">Unable to load records. Check database connection.</td></tr>';
        }
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