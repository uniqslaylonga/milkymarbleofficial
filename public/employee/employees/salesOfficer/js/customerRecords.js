let allCustomers = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchCustomerRecords();

    const modalOverlay = document.getElementById('profileModalOverlay');
    const modalCloseBtn = document.getElementById('modalCloseBtn');

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeModal);
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    const searchInput = document.getElementById('customerSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const filtered = allCustomers.filter(c => 
                (c.full_name && c.full_name.toLowerCase().includes(query)) ||
                (c.email && c.email.toLowerCase().includes(query)) ||
                (c.phone && c.phone.toLowerCase().includes(query))
            );
            renderCustomerTable(filtered);
        });
    }
});

async function fetchCustomerRecords() {
    try {
        const userId = localStorage.getItem('userId');
        const headers = userId ? { 'x-user-id': userId } : {};
        
        const response = await fetch('/api/sales-officer/customer-records', { headers });
        if (!response.ok) throw new Error('Failed to fetch customer records');

        const data = await response.json();

        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');
        if (userNameEl) userNameEl.textContent = data.user.fullName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        const totalRegEl = document.getElementById('totalRegistered');
        const totalRegGrowthEl = document.getElementById('totalRegisteredGrowth');
        const newSignupsEl = document.getElementById('newSignups');
        const newSignupsGrowthEl = document.getElementById('newSignupsGrowth');
        const repeatRateEl = document.getElementById('repeatRate');

        if (totalRegEl) totalRegEl.textContent = Number(data.metrics.totalRegistered).toLocaleString();
        if (totalRegGrowthEl) totalRegGrowthEl.textContent = data.metrics.registeredGrowth;
        if (newSignupsEl) newSignupsEl.textContent = Number(data.metrics.newSignups).toLocaleString();
        if (newSignupsGrowthEl) newSignupsGrowthEl.textContent = data.metrics.signupsGrowth;
        if (repeatRateEl) repeatRateEl.textContent = data.metrics.repeatRate;

        allCustomers = data.customers || [];
        renderCustomerTable(allCustomers);
    } catch (error) {
        console.error('Error loading customer records:', error);
        const tbody = document.getElementById('customerTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red; padding: 20px;">Failed to load records.</td></tr>';
        }
    }
}

function renderCustomerTable(customers) {
    const tbody = document.getElementById('customerTableBody');
    if (!tbody) return;

    if (!customers || customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No customer records found.</td></tr>';
        return;
    }

    tbody.innerHTML = customers.map(cust => {
        const orderCount = cust.total_orders || 0;
        const totalSpent = Number(cust.total_spent || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const avatar = cust.avatar ? cust.avatar : '../../images/account.png';
        const methodClass = getPaymentClass(cust.preferred_payment);

        return `
            <tr>
                <td>
                    <div class="cust-cell">
                        <div class="cust-avatar-sm">
                            <img src="${avatar}" alt="${escapeHtml(cust.full_name)}" class="cust-avatar-img" onerror="this.onerror=null; this.src='../../images/account.png';">
                        </div>
                        <div>
                            <div class="cust-name-text">${escapeHtml(cust.full_name)}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="contact-text">${escapeHtml(cust.phone || 'N/A')}</div>
                    <div class="email-sub">${escapeHtml(cust.email || '')}</div>
                </td>
                <td><strong class="order-count">${orderCount} orders</strong></td>
                <td><span class="spent-val">₱${totalSpent}</span></td>
                <td><span class="method-pill ${methodClass}">${escapeHtml(cust.preferred_payment || 'GCash')}</span></td>
                <td>
                    <button class="view-profile-btn" onclick="openProfileModal('${cust.id}')">View Profile</button>
                </td>
            </tr>
        `;
    }).join('');
}

function openProfileModal(customerId) {
    const cust = allCustomers.find(c => String(c.id) === String(customerId));
    if (!cust) return;

    document.getElementById('modalAvatar').src = cust.avatar || '../../images/account.png';
    document.getElementById('modalName').textContent = cust.full_name;
    document.getElementById('modalSub').textContent = `${cust.email || ''} • ${cust.phone || ''}`;
    document.getElementById('modalCallBtn').href = cust.phone ? `tel:${cust.phone}` : '#';
    document.getElementById('modalSmsBtn').href = cust.phone ? `sms:${cust.phone}` : '#';
    document.getElementById('modalAddress').textContent = cust.address || 'No default address specified.';
    
    const paymentBox = document.getElementById('modalPaymentBox');
    const methodClass = getPaymentClass(cust.preferred_payment);
    paymentBox.innerHTML = `<span class="method-pill ${methodClass}">${escapeHtml(cust.preferred_payment || 'GCash')}</span>`;

    const historyList = document.getElementById('modalHistoryList');
    if (cust.recent_orders && cust.recent_orders.length > 0) {
        historyList.innerHTML = cust.recent_orders.map(ord => {
            const dateFormatted = new Date(ord.placed_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
            const amount = Number(ord.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return `
                <div class="history-item">
                    <div>
                        <div class="history-id">${escapeHtml(ord.order_number)}</div>
                        <div class="history-date">${dateFormatted} • ${ord.item_count || 1} items</div>
                    </div>
                    <div class="history-price">₱${amount}</div>
                </div>
            `;
        }).join('');
    } else {
        historyList.innerHTML = '<div class="history-item"><div>No recent orders found.</div></div>';
    }

    const modal = document.getElementById('profileModalOverlay');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('profileModalOverlay');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
}

function getPaymentClass(method) {
    if (!method) return 'gcash';
    const m = method.toLowerCase();
    if (m.includes('gcash')) return 'gcash';
    if (m.includes('maya')) return 'maya';
    if (m.includes('bank') || m.includes('bdo')) return 'bank';
    if (m.includes('cod') || m.includes('cash')) return 'cod';
    return 'gcash';
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