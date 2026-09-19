document.addEventListener('DOMContentLoaded', () => {
    fetchProcurementDashboardData();

    const addRequestForm = document.getElementById('addRequestForm');
    if (addRequestForm) {
        addRequestForm.addEventListener('submit', handleAddRequest);
    }
});

async function fetchProcurementDashboardData() {
    try {
        const response = await employeeFetch('/api/procurement-officer/dashboard');
        if (!response.ok) throw new Error('Failed to load dashboard data');

        const data = await response.json();

        // User profile setup
        const userNameEl = document.getElementById('userName');
        const userFirstNameEl = document.getElementById('userFirstName');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userNameEl) userNameEl.textContent = data.user.fullName;
        if (userFirstNameEl) userFirstNameEl.textContent = data.user.firstName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        // KPI Metrics
        document.getElementById('openRequests').textContent = String(data.metrics.openRequests).padStart(2, '0');
        document.getElementById('activeVendors').textContent = String(data.metrics.activeVendors).padStart(2, '0');
        document.getElementById('itemsMonitored').textContent = String(data.metrics.itemsMonitored).padStart(2, '0');
        document.getElementById('reservedStocks').textContent = data.metrics.reservedStocks || 0;

        // Purchase Requests
        renderPurchaseRequests(data.purchaseRequests);

        // Vendors List
        renderVendorsList(data.vendorsList);
        document.getElementById('totalVendorsCount').textContent = data.vendorStats.totalVendorsCount;
        document.getElementById('activeVendorsPercent').textContent = `${data.vendorStats.activeVendorsPercent}%`;

        // Inventory Category Units
        const totalUnits = data.inventoryCategory.totalAvailableUnits || 0;
        document.getElementById('totalAvailableUnits').textContent = totalUnits.toLocaleString();

        const ingUnits = data.inventoryCategory.ingUnits || 0;
        const pkgUnits = data.inventoryCategory.pkgUnits || 0;
        const eqpUnits = data.inventoryCategory.eqpUnits || 0;

        document.getElementById('ingUnits').textContent = ingUnits.toLocaleString();
        document.getElementById('pkgUnits').textContent = pkgUnits.toLocaleString();
        document.getElementById('eqpUnits').textContent = eqpUnits.toLocaleString();

        document.getElementById('ingFill').style.width = totalUnits > 0 ? `${Math.min(100, (ingUnits / totalUnits) * 100)}%` : '0%';
        document.getElementById('pkgFill').style.width = totalUnits > 0 ? `${Math.min(100, (pkgUnits / totalUnits) * 100)}%` : '0%';
        document.getElementById('eqpFill').style.width = totalUnits > 0 ? `${Math.min(100, (eqpUnits / totalUnits) * 100)}%` : '0%';

        // Stock Alerts
        document.getElementById('attentionCount').textContent = data.attentionCount || 0;

    } catch (error) {
        console.error('Error fetching procurement dashboard data:', error);
    }
}

function renderPurchaseRequests(requests) {
    const container = document.getElementById('purchaseRequestsList');
    if (!container) return;

    if (!requests || requests.length === 0) {
        container.innerHTML = '<p class="no-data">No purchase requests found.</p>';
        return;
    }

    container.innerHTML = requests.map(pr => {
        const statusClass = String(pr.status || '').toLowerCase().replace(/_/g, '-');
        const price = Number(pr.total_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        return `
            <div class="request-item">
                <div class="req-leading">
                    <div class="req-icon"><i class="fa-solid fa-clipboard-list"></i></div>
                    <div>
                        <div class="req-name">${escapeHtml(pr.name)}</div>
                        <div class="req-meta">${escapeHtml(pr.pr_code)} &bull; ${escapeHtml(pr.department)}</div>
                    </div>
                </div>

                <div class="req-dots"></div>

                <div class="req-qty">${pr.quantity} ${escapeHtml(pr.unit)}</div>
                <span class="status-badge ${statusClass}">${escapeHtml(pr.status)}</span>
                <div class="req-price">&#8369; ${price}</div>
            </div>
        `;
    }).join('');
}

function renderVendorsList(vendors) {
    const container = document.getElementById('vendorList');
    if (!container) return;

    if (!vendors || vendors.length === 0) {
        container.innerHTML = '<p class="no-data">No active vendors found.</p>';
        return;
    }

    container.innerHTML = vendors.map(vendor => {
        const vStatusClass = String(vendor.status || '').toLowerCase();

        return `
            <div class="vendor-item">
                <div class="vendor-leading">
                    <div class="vendor-img-placeholder"><i class="fa-regular fa-image"></i></div>
                    <div>
                        <div class="vendor-name">${escapeHtml(vendor.vendor_name)}</div>
                        <div class="vendor-desc">${escapeHtml(vendor.category_desc)}</div>
                    </div>
                </div>
                <span class="status-pill ${vStatusClass}">${escapeHtml(vendor.status)}</span>
            </div>
        `;
    }).join('');
}

async function handleAddRequest(e) {
    e.preventDefault();

    const itemName = document.getElementById('itemName').value.trim();
    const storeName = document.getElementById('storeName').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);

    if (!itemName || !storeName || isNaN(amount) || amount <= 0) {
        alert('Please complete all fields with valid details.');
        return;
    }

    try {
        const response = await employeeFetch('/api/procurement-officer/add-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_name: itemName, store_name: storeName, amount: amount })
        });

        const result = await response.json();
        if (result.status === 'success') {
            closeModal('addRequestModal');
            document.getElementById('addRequestForm').reset();
            fetchProcurementDashboardData();
        } else {
            alert('Failed to add request: ' + (result.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error submitting purchase request:', error);
        alert('An error occurred while submitting the request.');
    }
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal-backdrop')) {
        event.target.classList.remove('active');
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}