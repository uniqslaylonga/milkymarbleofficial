let allRequests = [];
let filteredRequests = [];
let currentPrPage = 1;
const PR_PAGE_SIZE = 4;
let activeFilterRoute = 'all';

document.addEventListener('DOMContentLoaded', () => {
    fetchProcurementDashboardData();

    // 1. Live DOA Threshold Calculation sa Modal
    const qtyInput = document.getElementById('requestQty');
    const unitCostInput = document.getElementById('unitCost');
    if (qtyInput && unitCostInput) {
        qtyInput.addEventListener('input', calculateModalThreshold);
        unitCostInput.addEventListener('input', calculateModalThreshold);
    }

    // 2. Add Request Form Submission
    const addRequestForm = document.getElementById('addRequestForm');
    if (addRequestForm) {
        addRequestForm.addEventListener('submit', handleAddRequestSubmit);
    }

    // 3. Search Bar Input
    const searchInput = document.getElementById('procurementSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', applyRequestsFilter);
    }

    // 4. Tab Filter Buttons
    const tabButtons = document.querySelectorAll('.order-filter-tabs .tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabButtons.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            activeFilterRoute = e.currentTarget.getAttribute('data-filter') || 'all';
            applyRequestsFilter();
        });
    });

    // 5. Permanent Pagination Buttons
    const prevBtn = document.getElementById('prevPrBtn');
    const nextBtn = document.getElementById('nextPrBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPrPage > 1) {
                currentPrPage--;
                renderPurchaseRequests();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredRequests.length / PR_PAGE_SIZE) || 1;
            if (currentPrPage < totalPages) {
                currentPrPage++;
                renderPurchaseRequests();
            }
        });
    }
});

async function fetchProcurementDashboardData() {
    try {
        let response;
        if (typeof employeeFetch === 'function') {
            response = await employeeFetch('/api/procurement-officer/dashboard');
        } else {
            const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
            const headers = userId ? { 'x-user-id': userId } : {};
            response = await fetch('/api/procurement-officer/dashboard', { headers });
        }

        if (!response.ok) throw new Error('API unavailable');

        const data = await response.json();

        // User profile setup
        const userNameEl = document.getElementById('userName');
        const userFirstNameEl = document.getElementById('userFirstName');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userNameEl) userNameEl.textContent = data.user.fullName || 'Rhodalyn D. Leodones';
        if (userFirstNameEl) userFirstNameEl.textContent = data.user.firstName || 'Rhodalyn';
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        allRequests = data.purchaseRequests || [];
        applyRequestsFilter();
        renderVendorsList(data.vendorsList);
        renderInventoryStats(data.inventoryCategory);

    } catch (error) {
        console.warn('Loading realistic fallback data with DOA matrix thresholds for Rhodalyn:', error);

        // Fallback user profile
        document.getElementById('userName').textContent = 'Rhodalyn D. Leodones';
        document.getElementById('userFirstName').textContent = 'Rhodalyn';

        // Fallback realistic milk tea requisitions reflecting the DOA Matrix
        allRequests = [
            {
                id: 1,
                pr_code: 'PR-1001',
                name: 'Tapioca Pearls (2x 1kg packs)',
                department: 'Production Kitchen',
                supplier: 'Caloocan Boba Hub',
                quantity: '2 packs',
                total_price: 260.00,
                route: 'procure',
                status: 'PROCUREMENT_APPROVED'
            },
            {
                id: 2,
                pr_code: 'PR-1002',
                name: 'Brown Sugar Syrup (2x 1L Bottles)',
                department: 'Production Kitchen',
                supplier: 'Sweet Flavors Wholesale',
                quantity: '2 bottles',
                total_price: 290.00,
                route: 'procure',
                status: 'DIRECT_BUY_AUTHORIZED'
            },
            {
                id: 3,
                pr_code: 'PR-1003',
                name: 'Full Cream Milk (6x 1L Fresh Box)',
                department: 'Production Kitchen',
                supplier: 'Metro Dairy Distributors',
                quantity: '1 box (6L)',
                total_price: 450.00,
                route: 'finance',
                status: 'PENDING_FINANCE'
            },
            {
                id: 4,
                pr_code: 'PR-1004',
                name: 'Store Promotional Banners & Flyers',
                department: 'Sales Counter',
                supplier: 'North Caloocan Press',
                quantity: '1 lot',
                total_price: 480.00,
                route: 'finance',
                status: 'FINANCE_APPROVED'
            },
            {
                id: 5,
                pr_code: 'PR-1005',
                name: 'Quarterly Bulk Sealing Film & 22oz Cups',
                department: 'Warehouse Store',
                supplier: 'EcoCup Packaging Corp',
                quantity: '5 boxes (2500 pcs)',
                total_price: 3200.00,
                route: 'ceo',
                status: 'PENDING_CEO'
            },
            {
                id: 6,
                pr_code: 'PR-1006',
                name: 'Assam Black Tea & Jasmine Green Sacks',
                department: 'Production Kitchen',
                supplier: 'Golden Leaves Imports',
                quantity: '4 sacks (20kg)',
                total_price: 4800.00,
                route: 'ceo',
                status: 'PENDING_CEO'
            }
        ];

        // Fallback Vendors
        const fallbackVendors = [
            {
                id: 1,
                vendor_name: 'Metro Dairy Wholesale',
                category_desc: 'Fresh Milk & Cream Foam',
                status: 'ACTIVE PARTNER'
            },
            {
                id: 2,
                vendor_name: 'Caloocan Boba Hub',
                category_desc: 'Raw Tapioca Pearls & Syrups',
                status: 'ACTIVE PARTNER'
            },
            {
                id: 3,
                vendor_name: 'EcoCup Packaging Corp',
                category_desc: 'PP Cups, Straws & Sealing Film',
                status: 'ACTIVE PARTNER'
            }
        ];

        // Fallback Inventory breakdown
        const fallbackInventory = {
            totalAvailableUnits: 1240,
            ingUnits: 680,
            pkgUnits: 510,
            eqpUnits: 50
        };

        applyRequestsFilter();
        renderVendorsList(fallbackVendors);
        renderInventoryStats(fallbackInventory);
    }
}

// Live DOA Calculation in Add Request Modal
function calculateModalThreshold() {
    const qty = parseFloat(document.getElementById('requestQty')?.value || 1);
    const unitCost = parseFloat(document.getElementById('unitCost')?.value || 0);
    const total = qty * unitCost;

    const totalEl = document.getElementById('previewTotalCost');
    const badgeEl = document.getElementById('routingBadge');

    if (totalEl) {
        totalEl.textContent = '₱' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    if (badgeEl) {
        if (total <= 300) {
            badgeEl.className = 'badge-route route-procure';
            badgeEl.textContent = '🟢 Direct Route: Procurement Officer (Rhodalyn Direct Purchase Authorized)';
        } else if (total > 300 && total <= 500) {
            badgeEl.className = 'badge-route route-finance';
            badgeEl.textContent = '🟠 Escalation Route: Requires Financial Officer Clearance';
        } else {
            badgeEl.className = 'badge-route route-ceo';
            badgeEl.textContent = '🔴 Executive Route: Requires CEO Approval (High Capital Expense)';
        }
    }
}

// Filter Requests (Search + Route Filter Tabs)
function applyRequestsFilter() {
    const searchVal = document.getElementById('procurementSearchInput')?.value.trim().toLowerCase() || '';

    filteredRequests = allRequests.filter(pr => {
        // Route Filter
        if (activeFilterRoute === 'procure' && pr.route !== 'procure') return false;
        if (activeFilterRoute === 'finance' && pr.route !== 'finance') return false;
        if (activeFilterRoute === 'ceo' && pr.route !== 'ceo') return false;

        // Search Filter
        if (searchVal) {
            const code = (pr.pr_code || '').toLowerCase();
            const name = (pr.name || '').toLowerCase();
            const dept = (pr.department || '').toLowerCase();
            const supp = (pr.supplier || '').toLowerCase();
            if (!code.includes(searchVal) && !name.includes(searchVal) && !dept.includes(searchVal) && !supp.includes(searchVal)) {
                return false;
            }
        }

        return true;
    });

    // Update KPI Counts
    const directCount = allRequests.filter(r => r.total_price <= 300).length;
    const escalatedCount = allRequests.filter(r => r.total_price > 300).length;

    const directEl = document.getElementById('directBuyCount');
    const escEl = document.getElementById('escalatedCount');
    if (directEl) directEl.textContent = String(directCount).padStart(2, '0');
    if (escEl) escEl.textContent = String(escalatedCount).padStart(2, '0');

    currentPrPage = 1;
    renderPurchaseRequests();
}

// Render Purchase Requests Table with Permanent Pager
function renderPurchaseRequests() {
    const tbody = document.getElementById('purchaseRequestsList');
    const pageInfo = document.getElementById('prPageInfo');
    const prevBtn = document.getElementById('prevPrBtn');
    const nextBtn = document.getElementById('nextPrBtn');

    if (!tbody) return;

    if (filteredRequests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-state-text">No purchase requests match the selected route or search.</td></tr>';
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 requests';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        renderPrPagerButtons(1, 1);
        return;
    }

    const totalPages = Math.ceil(filteredRequests.length / PR_PAGE_SIZE) || 1;
    const startIndex = (currentPrPage - 1) * PR_PAGE_SIZE;
    const pageItems = filteredRequests.slice(startIndex, startIndex + PR_PAGE_SIZE);

    if (pageInfo) {
        const startNum = startIndex + 1;
        const endNum = Math.min(startIndex + PR_PAGE_SIZE, filteredRequests.length);
        pageInfo.textContent = `Showing ${startNum}-${endNum} of ${filteredRequests.length} requests`;
    }
    if (prevBtn) prevBtn.disabled = currentPrPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPrPage >= totalPages;

    renderPrPagerButtons(totalPages, currentPrPage);

    tbody.innerHTML = pageItems.map(pr => {
        const price = Number(pr.total_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const isDirectBuy = pr.total_price <= 300;
        let routeBadgeClass = 'route-procure';
        let routeText = '🟢 Direct Buy (Rhodalyn)';

        if (pr.total_price > 500) {
            routeBadgeClass = 'route-ceo';
            routeText = '🔴 CEO Clearance';
        } else if (pr.total_price > 300) {
            routeBadgeClass = 'route-finance';
            routeText = '🟠 Finance Approval';
        }

        return `
            <tr>
                <td>
                    <strong style="color: var(--brown-soft); font-size: 13px;">${escapeHtml(pr.name)}</strong>
                    <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(pr.pr_code)}</div>
                </td>
                <td>
                    <div style="font-weight: 700; color: var(--text-dark);">${escapeHtml(pr.department)}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(pr.supplier || 'Local Store')}</div>
                </td>
                <td><strong>${escapeHtml(pr.quantity)}</strong></td>
                <td><strong style="color: var(--brown-soft); font-family: var(--font-family-heading); font-size: 13.5px;">₱ ${price}</strong></td>
                <td>
                    <span class="badge-route ${routeBadgeClass}">${routeText}</span>
                    <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Status: <strong>${escapeHtml(pr.status)}</strong></div>
                </td>
                <td style="text-align: right;">
                    ${isDirectBuy ? `
                        <button type="button" class="btn-buy-instant" onclick="handleDirectBuy(${pr.id}, '${escapeHtml(pr.name)}')">
                            <i class="fa-solid fa-check"></i> Approve &amp; Buy
                        </button>
                    ` : `
                        <button type="button" class="btn-view-status" onclick="alert('This requisition (₱${price}) is routed to${routeText}. Awaiting review.')">
                            View Route
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

// Numbered Pager: 1, 2, 3...
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
            if (page && page !== currentPrPage) {
                currentPrPage = page;
                renderPurchaseRequests();
            }
        });
    });
}

// Direct Buy Action for ≤ ₱300
function handleDirectBuy(prId, itemName) {
    const confirmAction = confirm(`Execute DIRECT PURCHASE for "${itemName}" (≤ ₱300 threshold)? This is authorized under your Procurement Officer mandate.`);
    if (!confirmAction) return;

    const item = allRequests.find(r => r.id === prId);
    if (item) {
        item.status = 'PURCHASE_COMPLETED';
        applyRequestsFilter();
        alert(`Direct purchase for "${itemName}" executed successfully! Stock will be delivered to the Kitchen.`);
    }
}

function filterRequestsByRoute(route) {
    const tabButtons = document.querySelectorAll('.order-filter-tabs .tab-btn');
    tabButtons.forEach(b => {
        if (b.getAttribute('data-filter') === route) b.classList.add('active');
        else b.classList.remove('active');
    });
    activeFilterRoute = route;
    applyRequestsFilter();
}

// Render Active Vendors
function renderVendorsList(vendors) {
    const container = document.getElementById('vendorList');
    if (!container) return;

    if (!vendors || vendors.length === 0) {
        container.innerHTML = '<p class="loading-state-text">No active suppliers found.</p>';
        return;
    }

    container.innerHTML = vendors.map(vendor => `
        <div class="vendor-item">
            <div class="vendor-leading">
                <div class="vendor-img-placeholder"><i class="fa-solid fa-truck-ramp-box"></i></div>
                <div>
                    <div class="vendor-name">${escapeHtml(vendor.vendor_name)}</div>
                    <div class="vendor-desc">${escapeHtml(vendor.category_desc)}</div>
                </div>
            </div>
            <span class="status-pill-vendor">${escapeHtml(vendor.status || 'ACTIVE')}</span>
        </div>
    `).join('');

    const totalVendorsEl = document.getElementById('totalVendorsCount');
    if (totalVendorsEl) totalVendorsEl.textContent = vendors.length;
}

// Render Warehouse Progress Bars
function renderInventoryStats(category) {
    if (!category) return;

    const totalUnits = category.totalAvailableUnits || 0;
    const ingUnits = category.ingUnits || 0;
    const pkgUnits = category.pkgUnits || 0;
    const eqpUnits = category.eqpUnits || 0;

    document.getElementById('totalAvailableUnits').textContent = totalUnits.toLocaleString();
    document.getElementById('ingUnits').textContent = ingUnits.toLocaleString();
    document.getElementById('pkgUnits').textContent = pkgUnits.toLocaleString();
    document.getElementById('eqpUnits').textContent = eqpUnits.toLocaleString();

    document.getElementById('ingFill').style.width = totalUnits > 0 ? `${Math.min(100, (ingUnits / totalUnits) * 100)}%` : '0%';
    document.getElementById('pkgFill').style.width = totalUnits > 0 ? `${Math.min(100, (pkgUnits / totalUnits) * 100)}%` : '0%';
    document.getElementById('eqpFill').style.width = totalUnits > 0 ? `${Math.min(100, (eqpUnits / totalUnits) * 100)}%` : '0%';
}

// Handle Form Submission with DOA Routing
async function handleAddRequestSubmit(e) {
    e.preventDefault();

    const itemName = document.getElementById('itemName').value.trim();
    const dept = document.getElementById('requestingDept').value;
    const storeName = document.getElementById('storeName').value.trim();
    const qty = parseFloat(document.getElementById('requestQty').value || 1);
    const unitCost = parseFloat(document.getElementById('unitCost').value || 0);
    const totalCost = qty * unitCost;

    let targetRoute = 'procure';
    let targetStatus = 'DIRECT_BUY_AUTHORIZED';

    if (totalCost > 500) {
        targetRoute = 'ceo';
        targetStatus = 'PENDING_CEO';
    } else if (totalCost > 300) {
        targetRoute = 'finance';
        targetStatus = 'PENDING_FINANCE';
    }

    const newPr = {
        id: Date.now(),
        pr_code: `PR-${1000 + allRequests.length + 1}`,
        name: `${itemName} (${qty}x)`,
        department: dept,
        supplier: storeName,
        quantity: `${qty} units`,
        total_price: totalCost,
        route: targetRoute,
        status: targetStatus
    };

    allRequests.unshift(newPr);
    applyRequestsFilter();
    closeModal('addRequestModal');
    e.target.reset();
    calculateModalThreshold();

    alert(`Requisition for "${itemName}" (₱${totalCost.toFixed(2)}) submitted!\nDOA Routing: ${targetRoute === 'procure' ? '🟢 Direct Buy Authorized for Rhodalyn' : (targetRoute === 'finance' ? '🟠 Endorsed to Finance' : '🔴 Escalated to CEO')}`);
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('open');
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