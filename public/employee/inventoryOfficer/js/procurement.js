let currentTab = 'requests';
let allVendors = [];
let allRequests = [];
let filteredRequests = [];
let filteredVendors = [];

// Pagination states
let currentReqPage = 1;
const REQ_PAGE_SIZE = 5;
let currentVenPage = 1;
const VEN_PAGE_SIZE = 5;

document.addEventListener('DOMContentLoaded', () => {
    fetchProcurementData();

    // Tab buttons
    document.getElementById('tabBtnRequests')?.addEventListener('click', () => switchTab('requests'));
    document.getElementById('tabBtnVendors')?.addEventListener('click', () => switchTab('vendors'));

    // Search and filter listeners
    document.getElementById('procurementSearchInput')?.addEventListener('input', applyCurrentFilters);
    document.getElementById('statusFilter')?.addEventListener('change', applyCurrentFilters);

    // Live DOA routing determination on Amount / Qty input in Modal
    const reqAmountInput = document.getElementById('reqAmount');
    if (reqAmountInput) {
        reqAmountInput.addEventListener('input', calculateModalThreshold);
    }

    // Form handlers
    document.getElementById('addRequestForm')?.addEventListener('submit', handleAddRequest);
    document.getElementById('addVendorForm')?.addEventListener('submit', handleAddVendor);
    document.getElementById('editVendorForm')?.addEventListener('submit', handleEditVendor);

    // Requests Pagination buttons
    document.getElementById('prevPrBtn')?.addEventListener('click', () => {
        if (currentReqPage > 1) {
            currentReqPage--;
            renderRequestsTable();
        }
    });
    document.getElementById('nextPrBtn')?.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredRequests.length / REQ_PAGE_SIZE) || 1;
        if (currentReqPage < totalPages) {
            currentReqPage++;
            renderRequestsTable();
        }
    });

    // Vendors Pagination buttons
    document.getElementById('prevVenBtn')?.addEventListener('click', () => {
        if (currentVenPage > 1) {
            currentVenPage--;
            renderVendorsTable();
        }
    });
    document.getElementById('nextVenBtn')?.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredVendors.length / VEN_PAGE_SIZE) || 1;
        if (currentVenPage < totalPages) {
            currentVenPage++;
            renderVendorsTable();
        }
    });
});

async function fetchProcurementData() {
    try {
        let response;
        if (typeof employeeFetch === 'function') {
            response = await employeeFetch('/api/procurement-officer/purchasing-vendor');
        } else {
            const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
            const headers = userId ? { 'x-user-id': userId } : {};
            response = await fetch('/api/procurement-officer/purchasing-vendor', { headers });
        }

        if (!response.ok) throw new Error(await EmployeeUI.errorMessage(response));

        const data = await response.json();

        // User profile
        const userFullNameEl = document.getElementById('userFullName');
        if (userFullNameEl) userFullNameEl.textContent = data.user.fullName || 'Rhodalyn D. Leodones';

        allRequests = data.requests || [];
        allVendors = data.vendors || [];

        applyCurrentFilters();
        populateVendorDropdowns(allVendors);

    } catch (error) {
        console.error('Could not load live data from the server:', error);
        if (window.EmployeeUI) { EmployeeUI.showError(error); EmployeeUI.failTables(); }
    }
}

// Live DOA Calculation in Add Request Modal
function calculateModalThreshold() {
    const amount = parseFloat(document.getElementById('reqAmount')?.value || 0);
    const displayEl = document.getElementById('previewCostDisplay');
    const badgeEl = document.getElementById('routingBadgePreview');

    if (displayEl) {
        displayEl.textContent = '₱' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    if (badgeEl) {
        if (amount <= 300) {
            badgeEl.className = 'badge-route route-procure';
            badgeEl.textContent = '🟢 Direct Route: Procurement Officer (Direct Buy Authorized)';
        } else if (amount > 300 && amount <= 500) {
            badgeEl.className = 'badge-route route-finance';
            badgeEl.textContent = '🟠 Escalation Route: Requires Financial Officer Clearance';
        } else {
            badgeEl.className = 'badge-route route-ceo';
            badgeEl.textContent = '🔴 Executive Route: Requires CEO Approval (High Capital Expense)';
        }
    }
}

// Unified Filter
function applyCurrentFilters() {
    const q = document.getElementById('procurementSearchInput')?.value.toLowerCase().trim() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';

    // Filter Requests
    filteredRequests = allRequests.filter(req => {
        if (statusFilter && req.status !== statusFilter) return false;
        if (q) {
            const name = (req.name || '').toLowerCase();
            const code = (req.pr_code || '').toLowerCase();
            const dept = (req.department || '').toLowerCase();
            const supp = (req.vendor_name || '').toLowerCase();
            if (!name.includes(q) && !code.includes(q) && !dept.includes(q) && !supp.includes(q)) return false;
        }
        return true;
    });

    // Filter Vendors
    filteredVendors = allVendors.filter(v => {
        if (statusFilter && v.status !== statusFilter) return false;
        if (q) {
            const vName = (v.vendor_name || '').toLowerCase();
            const cat = (v.category_desc || '').toLowerCase();
            const mail = (v.contact_email || '').toLowerCase();
            if (!vName.includes(q) && !cat.includes(q) && !mail.includes(q)) return false;
        }
        return true;
    });

    document.getElementById('requestsCount').textContent = allRequests.length;
    document.getElementById('vendorsCount').textContent = allVendors.length;

    currentReqPage = 1;
    currentVenPage = 1;

    renderRequestsTable();
    renderVendorsTable();
}

// Render Requests Table with Permanent Pager
function renderRequestsTable() {
    const tbody = document.getElementById('requestsTableBody');
    const pageInfo = document.getElementById('prPageInfo');
    const prevBtn = document.getElementById('prevPrBtn');
    const nextBtn = document.getElementById('nextPrBtn');

    if (!tbody) return;

    if (filteredRequests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-state-text">No purchase requests recorded for this filter.</td></tr>';
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 requests';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        renderPrPagerButtons(1, 1);
        return;
    }

    const totalPages = Math.ceil(filteredRequests.length / REQ_PAGE_SIZE) || 1;
    const startIndex = (currentReqPage - 1) * REQ_PAGE_SIZE;
    const pageItems = filteredRequests.slice(startIndex, startIndex + REQ_PAGE_SIZE);

    if (pageInfo) {
        const startNum = startIndex + 1;
        const endNum = Math.min(startIndex + REQ_PAGE_SIZE, filteredRequests.length);
        pageInfo.textContent = `Showing ${startNum}-${endNum} of ${filteredRequests.length} requests`;
    }
    if (prevBtn) prevBtn.disabled = currentReqPage <= 1;
    if (nextBtn) nextBtn.disabled = currentReqPage >= totalPages;

    renderPrPagerButtons(totalPages, currentReqPage);

    tbody.innerHTML = pageItems.map(req => {
        const isDirectBuy = req.total_price <= 300;
        let routeBadgeClass = 'route-procure';
        let routeText = '🟢 Direct Buy (Rhodalyn)';

        if (req.total_price > 500) {
            routeBadgeClass = 'route-ceo';
            routeText = '🔴 CEO Clearance';
        } else if (req.total_price > 300) {
            routeBadgeClass = 'route-finance';
            routeText = '🟠 Finance Approval';
        }

        const price = Number(req.total_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        return `
            <tr>
                <td>
                    <strong style="color: var(--brown-soft); font-size: 13px;">${escapeHtml(req.name)}</strong>
                    <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(req.pr_code)}</div>
                </td>
                <td><span style="font-weight: 700;">${escapeHtml(req.requester_name || 'Kitchen Staff')}</span></td>
                <td><span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(req.department)}</span></td>
                <td><span style="font-weight: 700;">${escapeHtml(req.vendor_name || 'Local Store')}</span></td>
                <td><strong style="color: var(--brown-soft); font-family: var(--font-family-heading); font-size: 13.5px;">₱ ${price}</strong></td>
                <td>
                    <span class="badge-route ${routeBadgeClass}">${routeText}</span>
                    <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Status: <strong>${escapeHtml(req.status)}</strong></div>
                </td>
                <td style="text-align: right;">
                    ${isDirectBuy && req.status !== 'PURCHASED' ? `
                        <button type="button" class="btn-buy-instant" onclick="executeDirectBuy(${req.id}, '${escapeHtml(req.name)}')">
                            <i class="fa-solid fa-check"></i> Approve &amp; Buy
                        </button>
                    ` : `
                        <button type="button" class="btn-view-status" onclick="alert('Requisition (₱${price}) routed to: ${routeText}. Status: ${req.status}')">
                            View Status
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

// Requests Numbered Pager
function renderPrPagerButtons(totalPages, activePage) {
    const pagerNumbers = document.getElementById('prPagerNumbers');
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
            if (page && page !== currentReqPage) {
                currentReqPage = page;
                renderRequestsTable();
            }
        });
    });
}

// Render Vendors Table with Permanent Pager
function renderVendorsTable() {
    const tbody = document.getElementById('vendorsTableBody');
    const pageInfo = document.getElementById('venPageInfo');
    const prevBtn = document.getElementById('prevVenBtn');
    const nextBtn = document.getElementById('nextVenBtn');

    if (!tbody) return;

    if (filteredVendors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-state-text">No partner vendors recorded.</td></tr>';
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 vendors';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        renderVenPagerButtons(1, 1);
        return;
    }

    const totalPages = Math.ceil(filteredVendors.length / VEN_PAGE_SIZE) || 1;
    const startIndex = (currentVenPage - 1) * VEN_PAGE_SIZE;
    const pageItems = filteredVendors.slice(startIndex, startIndex + VEN_PAGE_SIZE);

    if (pageInfo) {
        const startNum = startIndex + 1;
        const endNum = Math.min(startIndex + VEN_PAGE_SIZE, filteredVendors.length);
        pageInfo.textContent = `Showing ${startNum}-${endNum} of ${filteredVendors.length} vendors`;
    }
    if (prevBtn) prevBtn.disabled = currentVenPage <= 1;
    if (nextBtn) nextBtn.disabled = currentVenPage >= totalPages;

    renderVenPagerButtons(totalPages, currentVenPage);

    tbody.innerHTML = pageItems.map(v => {
        const vCode = 'VEN-' + String(v.id).padStart(3, '0');
        const totalSpent = Number(v.total_spent || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const vStatus = v.status || 'Active';
        const vClass = vStatus.toLowerCase() === 'active' ? '' : (vStatus.toLowerCase() === 'review' ? 'review' : 'closed');

        return `
            <tr>
                <td>
                    <strong style="color: var(--brown-soft); font-size: 13px;">${escapeHtml(v.vendor_name)}</strong>
                    <div style="font-size: 11px; color: var(--text-muted);">${vCode}</div>
                </td>
                <td><span style="font-size: 12px; color: var(--text-dark);">${escapeHtml(v.category_desc || 'General Supplier')}</span></td>
                <td><span style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(v.contact_email || 'N/A')}</span></td>
                <td><span class="status-pill-vendor ${vClass}">${escapeHtml(vStatus)}</span></td>
                <td><strong style="color: var(--brown-soft);">₱ ${totalSpent}</strong></td>
                <td style="text-align: right;">
                    <button type="button" class="btn-view-status" onclick="openEditVendor(${v.id})">
                        <i class="fa-solid fa-pen-to-square"></i> Edit
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Vendors Numbered Pager
function renderVenPagerButtons(totalPages, activePage) {
    const pagerNumbers = document.getElementById('venPagerNumbers');
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
            if (page && page !== currentVenPage) {
                currentVenPage = page;
                renderVendorsTable();
            }
        });
    });
}

// Direct Buy Action for ≤ ₱300
function executeDirectBuy(reqId, itemName) {
    const confirmBuy = confirm(`Approve and execute DIRECT PURCHASE for "${itemName}" (≤ ₱300)?\nAuthorized under your Procurement mandate.`);
    if (!confirmBuy) return;

    const req = allRequests.find(r => r.id === reqId);
    if (req) {
        req.status = 'PURCHASED';
        applyCurrentFilters();
        alert(`Direct Purchase for "${itemName}" approved! Forwarded to kitchen delivery.`);
    }
}

function populateVendorDropdowns(vendors) {
    const select = document.getElementById('reqVendorName');
    if (!select) return;

    select.innerHTML = '<option value="">-- Choose Partner Vendor --</option>' + 
        vendors.map(v => `<option value="${escapeHtml(v.vendor_name)}">${escapeHtml(v.vendor_name)}</option>`).join('');
}

function switchTab(tab) {
    currentTab = tab;
    const reqBtn = document.getElementById('tabBtnRequests');
    const venBtn = document.getElementById('tabBtnVendors');
    const reqView = document.getElementById('requestsTableView');
    const venView = document.getElementById('vendorsTableView');
    const addVenBtn = document.getElementById('btnAddVendorTrigger');
    const doaLegend = document.getElementById('doaLegendRow');

    if (tab === 'requests') {
        reqBtn?.classList.add('active');
        venBtn?.classList.remove('active');
        reqView?.classList.add('active');
        venView?.classList.remove('active');
        addVenBtn?.classList.remove('show');
        if (doaLegend) doaLegend.style.display = 'flex';
    } else {
        venBtn?.classList.add('active');
        reqBtn?.classList.remove('active');
        venView?.classList.add('active');
        reqView?.classList.remove('active');
        addVenBtn?.classList.add('show');
        if (doaLegend) doaLegend.style.display = 'none';
    }
    applyCurrentFilters();
}

async function handleAddRequest(e) {
    e.preventDefault();
    const item_name = document.getElementById('reqItemName').value.trim();
    const dept = document.getElementById('reqDept').value;
    const amount = parseFloat(document.getElementById('reqAmount').value);
    const vendor_name = document.getElementById('reqVendorName').value;
    const qty = parseInt(document.getElementById('reqQty').value || 1, 10);

    if (!item_name || isNaN(amount) || amount <= 0) {
        alert('Please fill out all required fields.');
        return;
    }

    let targetRoute = 'procure';
    let targetStatus = 'DIRECT_BUY_AUTHORIZED';

    if (amount > 500) {
        targetRoute = 'ceo';
        targetStatus = 'PENDING_CEO';
    } else if (amount > 300) {
        targetRoute = 'finance';
        targetStatus = 'PENDING_FINANCE';
    }

    const newPr = {
        id: Date.now(),
        pr_code: `PR-${1000 + allRequests.length + 1}`,
        name: `${item_name} (${qty}x)`,
        requester_name: 'Rhodalyn (Procurement)',
        department: dept,
        vendor_name: vendor_name || 'Local Store',
        total_price: amount,
        route: targetRoute,
        status: targetStatus
    };

    allRequests.unshift(newPr);
    applyCurrentFilters();
    closeModal('addRequestModal');
    e.target.reset();
    calculateModalThreshold();

    alert(`Requisition for "${item_name}" (₱${amount.toFixed(2)}) submitted!\nDOA Routing: ${targetRoute === 'procure' ? '🟢 Direct Buy Authorized' : (targetRoute === 'finance' ? '🟠 Endorsed to Finance' : '🔴 Escalated to CEO')}`);
}

async function handleAddVendor(e) {
    e.preventDefault();
    const vendor_name = document.getElementById('addVendorName').value.trim();
    const category = document.getElementById('addVendorCategory').value.trim();
    const contact = document.getElementById('addVendorContact').value.trim();
    const status = document.getElementById('addVendorStatus').value;

    const newVen = {
        id: allVendors.length + 1,
        vendor_name,
        category_desc: category,
        contact_email: contact,
        status,
        total_spent: 0.00
    };

    allVendors.push(newVen);
    applyCurrentFilters();
    populateVendorDropdowns(allVendors);
    closeModal('addVendorModal');
    e.target.reset();

    alert(`Vendor "${vendor_name}" added to verified suppliers!`);
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

async function handleEditVendor(e) {
    e.preventDefault();
    const vendor_id = parseInt(document.getElementById('editVendorId').value, 10);
    const v = allVendors.find(item => item.id === vendor_id);
    if (v) {
        v.vendor_name = document.getElementById('editVendorName').value.trim();
        v.category_desc = document.getElementById('editVendorCategory').value.trim();
        v.contact_email = document.getElementById('editVendorContact').value.trim();
        v.status = document.getElementById('editVendorStatus').value;

        applyCurrentFilters();
        populateVendorDropdowns(allVendors);
        closeModal('editVendorModal');
        alert(`Vendor "${v.vendor_name}" updated successfully!`);
    }
}

function openModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.classList.remove('open');
        document.body.style.overflow = '';
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