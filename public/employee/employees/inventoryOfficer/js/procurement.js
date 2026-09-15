let currentTab = 'requests';
let allVendors = [];
let allRequests = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchProcurementData();

    // Tab buttons
    document.getElementById('tabBtnRequests').addEventListener('click', () => switchTab('requests'));
    document.getElementById('tabBtnVendors').addEventListener('click', () => switchTab('vendors'));

    // Search and filter listeners
    document.getElementById('tableSearch').addEventListener('input', filterCurrentTable);
    document.getElementById('statusFilter').addEventListener('change', filterCurrentTable);

    // Form handlers
    document.getElementById('addRequestForm').addEventListener('submit', handleAddRequest);
    document.getElementById('addVendorForm').addEventListener('submit', handleAddVendor);
    document.getElementById('editVendorForm').addEventListener('submit', handleEditVendor);
});

async function fetchProcurementData() {
    try {
        const response = await fetch('/api/procurement-officer/purchasing-vendor');
        if (!response.ok) throw new Error('Failed to load data');

        const data = await response.json();

        // User profile
        const userFullNameEl = document.getElementById('userFullName');
        if (userFullNameEl) userFullNameEl.textContent = data.user.fullName;

        allRequests = data.requests || [];
        allVendors = data.vendors || [];

        document.getElementById('requestsCount').textContent = allRequests.length;
        document.getElementById('vendorsCount').textContent = allVendors.length;

        renderRequestsTable(allRequests);
        renderVendorsTable(allVendors);
        populateVendorDropdowns(allVendors);
    } catch (error) {
        console.error('Error loading procurement data:', error);
    }
}

function renderRequestsTable(requests) {
    const tbody = document.getElementById('requestsTableBody');
    if (!tbody) return;

    if (!requests || requests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No purchase requests recorded.</td></tr>';
        return;
    }

    tbody.innerHTML = requests.map(req => {
        const status = req.status || 'PENDING_FINANCE';
        const badgeClass = String(status).toLowerCase().replace(/_/g, '-');
        const price = Number(req.total_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        return `
            <tr>
                <td>
                    <div class="cell-media">
                        <div class="icon-media"><i class="fa-solid fa-clipboard-list"></i></div>
                        <div>
                            <div class="main-text">${escapeHtml(req.name)}</div>
                            <div class="sub-text">${escapeHtml(req.pr_code)}</div>
                        </div>
                    </div>
                </td>
                <td><span class="plain-text">${escapeHtml(req.requester_name)}</span></td>
                <td><span class="plain-text">${escapeHtml(req.department)}</span></td>
                <td><span class="status-badge ${badgeClass}">${escapeHtml(status)}</span></td>
                <td style="text-align: right;"><span class="price-text">&#8369; ${price}</span></td>
            </tr>
        `;
    }).join('');
}

function renderVendorsTable(vendors) {
    const tbody = document.getElementById('vendorsTableBody');
    if (!tbody) return;

    if (!vendors || vendors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No vendors recorded.</td></tr>';
        return;
    }

    tbody.innerHTML = vendors.map(v => {
        const vStatus = v.status || 'Active';
        const vBadgeClass = String(vStatus).toLowerCase();
        const vCode = 'VEN-' + String(v.id).padStart(3, '0');
        const totalSpent = Number(v.total_spent || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        return `
            <tr class="clickable-row" onclick="openEditVendor(${v.id})">
                <td>
                    <div class="cell-media">
                        <div class="img-media"><i class="fa-regular fa-image"></i></div>
                        <div>
                            <div class="main-text">${escapeHtml(v.vendor_name)}</div>
                            <div class="sub-text">${vCode}</div>
                        </div>
                    </div>
                </td>
                <td><span class="plain-text">${escapeHtml(v.category_desc || 'General Supplier')}</span></td>
                <td><span class="plain-text email-text">${escapeHtml(v.contact_email || 'N/A')}</span></td>
                <td><span class="status-badge status-pill-${vBadgeClass}">${escapeHtml(vStatus)}</span></td>
                <td style="text-align: right;"><span class="price-text">&#8369; ${totalSpent}</span></td>
            </tr>
        `;
    }).join('');
}

function populateVendorDropdowns(vendors) {
    const select = document.getElementById('reqVendorName');
    if (!select) return;

    select.innerHTML = '<option value="">e.g Sample Store 1</option>' + 
        vendors.map(v => `<option value="${escapeHtml(v.vendor_name)}">${escapeHtml(v.vendor_name)}</option>`).join('');
}

function switchTab(tab) {
    currentTab = tab;
    const reqBtn = document.getElementById('tabBtnRequests');
    const venBtn = document.getElementById('tabBtnVendors');
    const reqView = document.getElementById('requestsTableView');
    const venView = document.getElementById('vendorsTableView');
    const addVenBtn = document.getElementById('btnAddVendorTrigger');
    const searchInput = document.getElementById('tableSearch');

    if (tab === 'requests') {
        reqBtn.classList.add('active');
        venBtn.classList.remove('active');
        reqView.classList.add('active');
        venView.classList.remove('active');
        addVenBtn.classList.remove('show');
        searchInput.placeholder = "Search requests...";
    } else {
        venBtn.classList.add('active');
        reqBtn.classList.remove('active');
        venView.classList.add('active');
        reqView.classList.remove('active');
        addVenBtn.classList.add('show');
        searchInput.placeholder = "Search vendors...";
    }
    filterCurrentTable();
}

function filterCurrentTable() {
    const query = document.getElementById('tableSearch').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value.toLowerCase();
    const targetTableId = (currentTab === 'requests') ? 'requestsTable' : 'vendorsTable';
    const table = document.getElementById(targetTableId);
    if (!table) return;

    const rows = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        const rowText = rows[i].innerText.toLowerCase();
        const matchesSearch = rowText.includes(query);
        let matchesStatus = true;

        if (statusFilter !== '') {
            matchesStatus = rowText.includes(statusFilter);
        }

        if (matchesSearch && matchesStatus) {
            rows[i].style.display = '';
        } else {
            rows[i].style.display = 'none';
        }
    }
}

async function handleAddRequest(e) {
    e.preventDefault();
    const item_name = document.getElementById('reqItemName').value.trim();
    const amount = parseFloat(document.getElementById('reqAmount').value);
    const vendor_name = document.getElementById('reqVendorName').value;

    if (!item_name || isNaN(amount) || amount <= 0) {
        alert('Please fill out all required fields.');
        return;
    }

    try {
        const response = await fetch('/api/procurement-officer/add-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_name, amount, store_name: vendor_name })
        });
        const result = await response.json();
        if (result.status === 'success') {
            closeModal('addRequestModal');
            document.getElementById('addRequestForm').reset();
            fetchProcurementData();
        } else {
            alert(result.message || 'Error creating request');
        }
    } catch (err) {
        console.error(err);
    }
}

async function handleAddVendor(e) {
    e.preventDefault();
    const vendor_name = document.getElementById('addVendorName').value.trim();
    const category = document.getElementById('addVendorCategory').value.trim();
    const contact = document.getElementById('addVendorContact').value.trim();
    const status = document.getElementById('addVendorStatus').value;

    if (!vendor_name) {
        alert('Vendor name is required.');
        return;
    }

    try {
        const response = await fetch('/api/procurement-officer/add-vendor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vendor_name, category, contact, status })
        });
        const result = await response.json();
        if (result.status === 'success') {
            closeModal('addVendorModal');
            document.getElementById('addVendorForm').reset();
            fetchProcurementData();
        } else {
            alert(result.message || 'Error adding vendor');
        }
    } catch (err) {
        console.error(err);
    }
}

async function handleEditVendor(e) {
    e.preventDefault();
    const vendor_id = document.getElementById('editVendorId').value;
    const vendor_name = document.getElementById('editVendorName').value.trim();
    const category = document.getElementById('editVendorCategory').value.trim();
    const contact = document.getElementById('editVendorContact').value.trim();
    const status = document.getElementById('editVendorStatus').value;

    try {
        const response = await fetch('/api/procurement-officer/edit-vendor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vendor_id, vendor_name, category, contact, status })
        });
        const result = await response.json();
        if (result.status === 'success') {
            closeModal('editVendorModal');
            fetchProcurementData();
        } else {
            alert(result.message || 'Error editing vendor');
        }
    } catch (err) {
        console.error(err);
    }
}

function openEditVendor(vendorId) {
    const v = allVendors.find(item => String(item.id) === String(vendorId));
    if (!v) return;

    document.getElementById('editVendorId').value = v.id;
    document.getElementById('editVendorName').value = v.vendor_name || '';
    document.getElementById('editVendorCategory').value = v.category_desc || '';
    document.getElementById('editVendorContact').value = v.contact_email || '';
    document.getElementById('editVendorStatus').value = v.status || 'Active';
    openModal('editVendorModal');
}

function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('active');
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
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