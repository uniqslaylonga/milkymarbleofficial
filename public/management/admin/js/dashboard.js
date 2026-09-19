document.addEventListener('DOMContentLoaded', () => {
    fetchAdminDashboardData();
});

async function fetchAdminDashboardData() {
    try {
        const userId = localStorage.getItem('userId');
        const headers = userId ? { 'x-user-id': userId } : {};

        const response = await fetch('/api/admin/dashboard', { headers });
        if (!response.ok) throw new Error('Failed to load dashboard data');

        const data = await response.json();

        // Admin User Profile & Avatar Fix
        const userFullNameEl = document.getElementById('userFullName');
        const userAvatarEl = document.getElementById('userAvatarImg');

        if (userFullNameEl) userFullNameEl.textContent = data.user.fullName;
        if (userAvatarEl && data.user.avatar) {
            let avatarPath = data.user.avatar;
            if (avatarPath === '/images/account.png' || avatarPath === 'account.png' || avatarPath === '../../images/account.png') {
                avatarPath = '../images/account.png';
            }
            userAvatarEl.src = avatarPath;
        }

        // KPI Statistics
        document.getElementById('statCustomers').textContent = Number(data.stats.totalCustomers || 0).toLocaleString();
        document.getElementById('statBatches').textContent = Number(data.stats.totalBatches || 0).toLocaleString();
        document.getElementById('statActiveStaff').textContent = Number(data.stats.totalActiveStaff || 0).toLocaleString();
        document.getElementById('statTotalStaffFooter').textContent = `${Number(data.stats.totalStaff || 0).toLocaleString()} total staff registered`;

        // Render Triple Feeds
        renderRecentCustomers(data.recentCustomers);
        renderProductionLogs(data.productionLogs);
        renderStaffList(data.staffList);

    } catch (error) {
        console.error('Error fetching admin dashboard data:', error);
    }
}

function renderRecentCustomers(customers) {
    const container = document.getElementById('recentCustomersList');
    if (!container) return;

    if (!customers || customers.length === 0) {
        container.innerHTML = `
            <div class="entity-summary-card">
                <div class="esc-left">
                    <div><div class="esc-title">No customers found.</div></div>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = customers.map(c => {
        let avatarSrc = '../images/account.png';
        if (c.avatar && c.avatar !== '/images/account.png' && c.avatar !== 'account.png') {
            avatarSrc = c.avatar.startsWith('/images/') ? '..' + c.avatar : c.avatar;
        }
        
        const custCode = 'CUST-' + String(c.id).padStart(4, '0');

        return `
            <div class="entity-summary-card">
                <div class="esc-left">
                    <div class="esc-avatar-sm">
                        <img src="${escapeHtml(avatarSrc)}" alt="Avatar" class="esc-avatar-img" style="object-fit: cover;">
                    </div>
                    <div>
                        <div class="esc-title">${escapeHtml(c.full_name)}</div>
                        <div class="esc-sub">${custCode} • ${escapeHtml(c.email)}</div>
                    </div>
                </div>
                <div class="esc-right">
                    <span class="type-pill">Customer</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderProductionLogs(logs) {
    const container = document.getElementById('productionLogsList');
    if (!container) return;

    if (!logs || logs.length === 0) {
        container.innerHTML = `
            <div class="entity-summary-card">
                <div class="esc-left">
                    <div><div class="esc-title">No production logs found.</div></div>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = logs.map(log => `
        <div class="entity-summary-card">
            <div class="esc-left">
                <div>
                    <div class="esc-title">${escapeHtml(log.flavor_name)}</div>
                    <div class="esc-sub">${escapeHtml(log.batch_code)} • ${Number(log.total_cups_produced || 0).toLocaleString()} cups</div>
                </div>
            </div>
            <div class="esc-right">
                <span class="status-indicator-box in-progress" style="background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9;">Completed</span>
                <span class="esc-meta">Sup: ${escapeHtml(log.supervisor || 'N/A')}</span>
            </div>
        </div>
    `).join('');
}

function renderStaffList(staffList) {
    const container = document.getElementById('staffList');
    if (!container) return;

    if (!staffList || staffList.length === 0) {
        container.innerHTML = `
            <div class="entity-summary-card">
                <div class="esc-left">
                    <div><div class="esc-title">No employee records found.</div></div>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = staffList.map(staff => {
        let avatarSrc = '../images/account.png';
        if (staff.avatar && staff.avatar !== '../images/account.png' && staff.avatar !== 'account.png') {
            avatarSrc = staff.avatar.startsWith('/images/') ? '..' + staff.avatar : staff.avatar;
        }
        
        const isActive = parseInt(staff.is_active || 0, 10) === 1 || staff.is_active === true;

        return `
            <div class="entity-summary-card">
                <div class="esc-left">
                    <div class="esc-avatar-sm">
                        <img src="${escapeHtml(avatarSrc)}" alt="Avatar" class="esc-avatar-img" style="object-fit: cover;">
                    </div>
                    <div>
                        <div class="esc-title">${escapeHtml(staff.full_name)}</div>
                        <div class="esc-sub">${escapeHtml(staff.username)}</div>
                    </div>
                </div>
                <div class="esc-right">
                    <span class="status-indicator-box ${isActive ? 'active' : 'on-leave'}">
                        ${isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span class="esc-meta">${escapeHtml(staff.role_name || 'Staff')}</span>
                </div>
            </div>
        `;
    }).join('');
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