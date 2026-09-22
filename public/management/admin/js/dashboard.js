document.addEventListener('DOMContentLoaded', () => {
    fetchAdminDashboardData();
    
    // Quick search filter for activity feeds
    document.getElementById('adminSearchInput')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        filterActivityFeeds(query);
    });
});

let cachedDashboardData = null;

async function fetchAdminDashboardData() {
    try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const headers = userId ? { 'x-user-id': userId } : {};

        const response = await fetch('/api/admin/dashboard', { headers });
        if (!response.ok) throw new Error('Failed to load admin dashboard data');

        const data = await response.json();
        cachedDashboardData = data;

        // 1. Admin Profile Header
        const userFullNameEl = document.getElementById('userFullName');
        if (userFullNameEl && data.user && data.user.fullName) {
            userFullNameEl.textContent = data.user.fullName;
        }

        // 2. Overview KPIs
        document.getElementById('statCustomers').textContent = Number(data.stats?.totalCustomers || 0).toLocaleString();
        document.getElementById('statBatches').textContent = Number(data.stats?.totalBatches || 0).toLocaleString();
        document.getElementById('statActiveStaff').textContent = Number(data.stats?.totalActiveStaff || 0).toLocaleString();
        document.getElementById('statTotalStaffFooter').textContent = `${Number(data.stats?.totalStaff || 0).toLocaleString()} total staff registered`;

        // 3. Render Triple Feeds
        renderRecentCustomers(data.recentCustomers || []);
        renderProductionLogs(data.productionLogs || []);
        renderStaffList(data.staffList || []);

    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        showAdminDashboardError();
    }
}

// Used to silently swap in a whole fabricated dataset on any fetch failure
// (fake customers, fake production batches, fake staff names) with nothing
// telling the admin it wasn't real. Replaced with an honest error state.
function showAdminDashboardError() {
    document.getElementById('statCustomers').textContent = '—';
    document.getElementById('statBatches').textContent = '—';
    document.getElementById('statActiveStaff').textContent = '—';
    document.getElementById('statTotalStaffFooter').textContent = 'Unable to load';

    const errorMsg = '<div class="loading-state-text" style="color:#c0392b;">Could not load data. Please refresh.</div>';
    const custEl = document.getElementById('recentCustomersList');
    if (custEl) custEl.innerHTML = errorMsg;
    const logsEl = document.getElementById('productionLogsList');
    if (logsEl) logsEl.innerHTML = errorMsg;
    const staffEl = document.getElementById('staffList');
    if (staffEl) staffEl.innerHTML = errorMsg;
}

function renderRecentCustomers(customers) {
    const container = document.getElementById('recentCustomersList');
    if (!container) return;

    if (!customers || customers.length === 0) {
        container.innerHTML = '<div class="loading-state-text">No customer records found.</div>';
        return;
    }

    container.innerHTML = customers.map(c => {
        const custCode = 'CUST-' + String(c.id).padStart(4, '0');

        return `
            <div class="entity-summary-card">
                <div class="esc-left">
                    <div class="esc-avatar-sm">
                        <svg class="user-avatar-svg" viewBox="0 0 36 36" fill="none">
                            <circle cx="18" cy="18" r="18" fill="#F69299" />
                            <circle cx="18" cy="14" r="5.5" fill="#FFFFFF" />
                            <path d="M8.5 28.5C8.5 23.8 12.8 21.5 18 21.5C23.2 21.5 27.5 23.8 27.5 28.5" fill="#FFFFFF" />
                        </svg>
                    </div>
                    <div>
                        <div class="esc-title">${escapeHtml(c.full_name)}</div>
                        <div class="esc-sub">${custCode} • ${escapeHtml(c.email || 'No email')}</div>
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
        container.innerHTML = '<div class="loading-state-text">No production logs logged.</div>';
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
                <span class="status-indicator-box completed">Completed</span>
                <span class="esc-meta">Sup: ${escapeHtml(log.supervisor || 'Staff')}</span>
            </div>
        </div>
    `).join('');
}

function renderStaffList(staffList) {
    const container = document.getElementById('staffList');
    if (!container) return;

    if (!staffList || staffList.length === 0) {
        container.innerHTML = '<div class="loading-state-text">No staff records found.</div>';
        return;
    }

    container.innerHTML = staffList.map(staff => {
        const isActive = staff.is_active === true || parseInt(staff.is_active || 0, 10) === 1;

        return `
            <div class="entity-summary-card">
                <div class="esc-left">
                    <div class="esc-avatar-sm">
                        <svg class="user-avatar-svg" viewBox="0 0 36 36" fill="none">
                            <circle cx="18" cy="18" r="18" fill="#F69299" />
                            <circle cx="18" cy="14" r="5.5" fill="#FFFFFF" />
                            <path d="M8.5 28.5C8.5 23.8 12.8 21.5 18 21.5C23.2 21.5 27.5 23.8 27.5 28.5" fill="#FFFFFF" />
                        </svg>
                    </div>
                    <div>
                        <div class="esc-title">${escapeHtml(staff.full_name)}</div>
                        <div class="esc-sub">${escapeHtml(staff.username)}</div>
                    </div>
                </div>
                <div class="esc-right">
                    <span class="status-indicator-box ${isActive ? 'active' : 'inactive'}">
                        ${isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span class="esc-meta">${escapeHtml(staff.role_name || staff.department || 'Staff')}</span>
                </div>
            </div>
        `;
    }).join('');
}

function filterActivityFeeds(query) {
    if (!cachedDashboardData) return;

    if (!query) {
        renderRecentCustomers(cachedDashboardData.recentCustomers);
        renderProductionLogs(cachedDashboardData.productionLogs);
        renderStaffList(cachedDashboardData.staffList);
        return;
    }

    const filteredCust = (cachedDashboardData.recentCustomers || []).filter(c => 
        (c.full_name || '').toLowerCase().includes(query) || 
        (c.email || '').toLowerCase().includes(query)
    );

    const filteredLogs = (cachedDashboardData.productionLogs || []).filter(l => 
        (l.flavor_name || '').toLowerCase().includes(query) || 
        (l.batch_code || '').toLowerCase().includes(query)
    );

    const filteredStaff = (cachedDashboardData.staffList || []).filter(s => 
        (s.full_name || '').toLowerCase().includes(query) || 
        (s.username || '').toLowerCase().includes(query)
    );

    renderRecentCustomers(filteredCust);
    renderProductionLogs(filteredLogs);
    renderStaffList(filteredStaff);
}

// --------------------------------------------------------------------------
// EXPORT SUMMARY PDF / PRINT HANDLER
// --------------------------------------------------------------------------
function exportOperationsPDF() {
    window.print();
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