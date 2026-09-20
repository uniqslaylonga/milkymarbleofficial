let activeCategory = 'all';
let allItems = [];
let filteredItems = [];
let allVendors = [];
let currentInvPage = 1;
const INV_PAGE_SIZE = 6;

document.addEventListener('DOMContentLoaded', () => {
    fetchInventorySectionData();

    // Category Tabs
    document.getElementById('tabCatAll')?.addEventListener('click', function () { filterCategory('all', this); });
    document.getElementById('tabCatIngredients')?.addEventListener('click', function () { filterCategory('ingredients', this); });
    document.getElementById('tabCatPackaging')?.addEventListener('click', function () { filterCategory('packaging', this); });
    document.getElementById('tabCatEquipment')?.addEventListener('click', function () { filterCategory('equipment', this); });

    // Search and Status Filters
    document.getElementById('inventorySearchInput')?.addEventListener('input', applyInventoryFilters);
    document.getElementById('statusFilter')?.addEventListener('change', applyInventoryFilters);

    // Form Handlers
    document.getElementById('addStockForm')?.addEventListener('submit', handleAddStock);
    document.getElementById('adjustStockForm')?.addEventListener('submit', handleAdjustStock);

    // Pagination buttons
    document.getElementById('prevInvBtn')?.addEventListener('click', () => {
        if (currentInvPage > 1) {
            currentInvPage--;
            renderInventoryTable();
        }
    });

    document.getElementById('nextInvBtn')?.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredItems.length / INV_PAGE_SIZE) || 1;
        if (currentInvPage < totalPages) {
            currentInvPage++;
            renderInventoryTable();
        }
    });
});

async function fetchInventorySectionData() {
    try {
        let response;
        if (typeof employeeFetch === 'function') {
            response = await employeeFetch('/api/procurement-officer/inventory-section');
        } else {
            const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
            const headers = userId ? { 'x-user-id': userId } : {};
            response = await fetch('/api/procurement-officer/inventory-section', { headers });
        }

        if (!response.ok) throw new Error(await EmployeeUI.errorMessage(response));

        const data = await response.json();

        // User Profile
        const userFullNameEl = document.getElementById('userFullName');
        if (userFullNameEl) userFullNameEl.textContent = data.user.fullName || 'Rhodalyn D. Leodones';

        allItems = data.items || [];
        allVendors = data.vendors || [];

        applyInventoryFilters();
        populateVendorDropdowns(allVendors);

    } catch (error) {
        console.error('Could not load live data from the server:', error);
        if (window.EmployeeUI) { EmployeeUI.showError(error); EmployeeUI.failTables(); }
    }
}

// Category and Search Filtering
function applyInventoryFilters() {
    const q = document.getElementById('inventorySearchInput')?.value.toLowerCase().trim() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';

    filteredItems = allItems.filter(item => {
        // Category Filter
        let displayCategory = 'ingredients';
        if (item.item_type === 'packaging') displayCategory = 'packaging';
        if (item.item_type === 'equipment') displayCategory = 'equipment';

        if (activeCategory !== 'all' && displayCategory !== activeCategory) return false;

        // Status Filter
        const onHand = parseFloat(item.on_hand || 0);
        const reorder = parseFloat(item.reorder_point || 0);
        const isLow = onHand <= reorder;

        if (statusFilter === 'low' && !isLow) return false;
        if (statusFilter === 'normal' && isLow) return false;

        // Search Filter
        if (q) {
            const name = (item.name || '').toLowerCase();
            const sku = (item.sku_code || '').toLowerCase();
            const vend = (item.vendor_name || '').toLowerCase();
            if (!name.includes(q) && !sku.includes(q) && !vend.includes(q)) return false;
        }

        return true;
    });

    // Update Counts on Badges
    const ingTotal = allItems.filter(i => (i.item_type || 'ingredients') === 'ingredients').length;
    const pkgTotal = allItems.filter(i => i.item_type === 'packaging').length;
    const eqpTotal = allItems.filter(i => i.item_type === 'equipment').length;

    document.getElementById('totalCount').textContent = allItems.length;
    document.getElementById('ingCount').textContent = ingTotal;
    document.getElementById('pkgCount').textContent = pkgTotal;
    document.getElementById('eqpCount').textContent = eqpTotal;
    document.getElementById('visibleCount').textContent = filteredItems.length;

    currentInvPage = 1;
    renderInventoryTable();
}

function filterCategory(cat, btn) {
    activeCategory = cat;
    document.querySelectorAll('.cat-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyInventoryFilters();
}

// Render Inventory Table with Permanent Numbered Pager
function renderInventoryTable() {
    const tbody = document.getElementById('inventoryTableBody');
    const pageInfo = document.getElementById('inventoryPageInfo');
    const prevBtn = document.getElementById('prevInvBtn');
    const nextBtn = document.getElementById('nextInvBtn');

    if (!tbody) return;

    if (filteredItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-state-text">No inventory items found matching your criteria.</td></tr>';
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 items';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        renderInvPagerButtons(1, 1);
        return;
    }

    const totalPages = Math.ceil(filteredItems.length / INV_PAGE_SIZE) || 1;
    const startIndex = (currentInvPage - 1) * INV_PAGE_SIZE;
    const pageItems = filteredItems.slice(startIndex, startIndex + INV_PAGE_SIZE);

    if (pageInfo) {
        const startNum = startIndex + 1;
        const endNum = Math.min(startIndex + INV_PAGE_SIZE, filteredItems.length);
        pageInfo.textContent = `Showing ${startNum}-${endNum} of ${filteredItems.length} items`;
    }
    if (prevBtn) prevBtn.disabled = currentInvPage <= 1;
    if (nextBtn) nextBtn.disabled = currentInvPage >= totalPages;

    renderInvPagerButtons(totalPages, currentInvPage);

    tbody.innerHTML = pageItems.map(item => {
        const unit = item.unit_of_measure || 'units';
        const onHand = parseFloat(item.on_hand || 0);
        const reserved = parseFloat(item.reserved_qty || 0);
        const reorder = parseFloat(item.reorder_point || 0);
        const isLow = onHand <= reorder;

        let categoryTitle = 'Ingredients';
        if (item.item_type === 'packaging') categoryTitle = 'Packaging';
        if (item.item_type === 'equipment') categoryTitle = 'Equipment';

        // Requisition DOA Route calculation if restocked
        const estRequisitionCost = (reorder * 2) * (item.est_unit_cost || 50);
        let routeBadgeClass = 'route-procure';
        let routeText = '🟢 ≤ ₱300 Direct Buy';
        if (estRequisitionCost > 500) {
            routeBadgeClass = 'route-ceo';
            routeText = '🔴 > ₱500 CEO Clearance';
        } else if (estRequisitionCost > 300) {
            routeBadgeClass = 'route-finance';
            routeText = '🟠 ₱301-₱500 Finance';
        }

        return `
            <tr>
                <td>
                    <strong style="color: var(--brown-soft); font-size: 13px;">${escapeHtml(item.name)}</strong>
                    <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(item.sku_code || 'SKU-00')}</div>
                </td>
                <td><span style="font-weight: 700; color: var(--text-dark);">${escapeHtml(categoryTitle)}</span></td>
                <td>
                    <span class="avail-num ${isLow ? 'low-stock-num' : ''}">${onHand} ${escapeHtml(unit)}</span>
                    ${isLow ? '<span class="low-badge">Low Buffer</span>' : ''}
                </td>
                <td>
                    <span style="font-size: 12px; font-weight: 700; color: var(--brown-soft);">
                        ${reserved} ${escapeHtml(unit)}
                    </span>
                    <div style="font-size: 10px; color: var(--text-muted);">Tue/Thu Buffer</div>
                </td>
                <td>
                    <span style="font-size: 12px; font-weight: 700; color: var(--text-muted);">
                        ${reorder} ${escapeHtml(unit)}
                    </span>
                </td>
                <td>
                    ${isLow ? `
                        <button type="button" class="btn-restock-trigger" onclick="quickRestockItem(${item.id})">
                            <i class="fa-solid fa-cart-plus"></i> Pitch Restock
                        </button>
                    ` : `
                        <span class="badge-route ${routeBadgeClass}">${routeText}</span>
                    `}
                </td>
                <td style="text-align: right;">
                    <button type="button" class="btn-adjust-link" onclick="openAdjustStockById(${item.id})">
                        <i class="fa-solid fa-sliders"></i> Adjust
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Numbered Pager
function renderInvPagerButtons(totalPages, activePage) {
    const pagerNumbers = document.getElementById('invPagerNumbers');
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
            if (page && page !== currentInvPage) {
                currentInvPage = page;
                renderInventoryTable();
            }
        });
    });
}

function quickRestockItem(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    const qtyToBuy = Math.ceil(item.reorder_point * 1.5) || 2;
    const estCost = qtyToBuy * (item.est_unit_cost || 130);

    let routeText = '🟢 Direct Route: Procurement (Rhodalyn Direct Buy Authorized)';
    if (estCost > 500) routeText = '🔴 Executive Route: Requires CEO Approval';
    else if (estCost > 300) routeText = '🟠 Escalation Route: Requires Financial Officer Clearance';

    const proceed = confirm(`Initiate Restock Requisition for "${item.name}"?\n• Quantity: ${qtyToBuy} ${item.unit_of_measure}\n• Est. Total: ₱${estCost.toFixed(2)}\n• Routing: ${routeText}`);
    if (proceed) {
        alert(`Requisition pitched! Forwarded to Procurement desk under DOA matrix.`);
    }
}

function populateVendorDropdowns(vendors) {
    const addSelect = document.getElementById('addVendorSelect');
    if (!addSelect) return;

    addSelect.innerHTML = '<option value="">-- Choose Partner Vendor --</option>' +
        vendors.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

async function handleAddStock(e) {
    e.preventDefault();
    const name = document.getElementById('addName').value.trim();
    const department = document.getElementById('addDepartment').value;
    const quantity = parseFloat(document.getElementById('addQuantity').value);
    const unit = document.getElementById('addUnit').value;
    const reorder_level = parseFloat(document.getElementById('addReorderLevel').value);
    const vendor_name = document.getElementById('addVendorSelect').value;
    const est_cost = parseFloat(document.getElementById('addEstCost').value || 100);

    const newItem = {
        id: allItems.length + 1,
        sku_code: `SKU-${department.substring(0,3).toUpperCase()}-${String(allItems.length + 1).padStart(2, '0')}`,
        name,
        item_type: department.toLowerCase(),
        on_hand: quantity,
        unit_of_measure: unit,
        reserved_qty: 0,
        reorder_point: reorder_level,
        est_unit_cost: est_cost,
        vendor_name: vendor_name || 'Local Store'
    };

    allItems.push(newItem);
    applyInventoryFilters();
    closeModal('addStockModal');
    e.target.reset();

    alert(`Item "${name}" successfully registered into warehouse stock!`);
}

function openAdjustStockById(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    let displayCategory = 'Ingredients';
    if (item.item_type === 'packaging') displayCategory = 'Packaging';
    if (item.item_type === 'equipment') displayCategory = 'Equipment';

    document.getElementById('adjustItemId').value = item.id;
    document.getElementById('deleteItemId').value = item.id;
    document.getElementById('adjustItemName').value = item.name;
    document.getElementById('adjustItemDept').value = displayCategory;
    document.getElementById('adjustItemQty').value = item.on_hand;
    document.getElementById('adjustItemReorder').value = item.reorder_point;
    document.getElementById('adjustItemUnit').value = item.unit_of_measure || 'kg';

    // Update Live DOA badge preview
    const estTotal = (item.reorder_point || 2) * (item.est_unit_cost || 100);
    const badgeEl = document.getElementById('adjustRoutingBadge');
    if (badgeEl) {
        if (estTotal <= 300) {
            badgeEl.className = 'badge-route route-procure';
            badgeEl.textContent = '🟢 Direct Route: Procurement Officer (≤ ₱300 Direct Buy)';
        } else if (estTotal <= 500) {
            badgeEl.className = 'badge-route route-finance';
            badgeEl.textContent = '🟠 Escalation Route: Financial Officer Clearance (₱301–₱500)';
        } else {
            badgeEl.className = 'badge-route route-ceo';
            badgeEl.textContent = '🔴 Executive Route: CEO Executive Clearance (> ₱500)';
        }
    }

    openModal('adjustStockModal');
}

async function handleAdjustStock(e) {
    e.preventDefault();
    const itemId = parseInt(document.getElementById('adjustItemId').value, 10);
    const item = allItems.find(i => i.id === itemId);

    if (item) {
        item.name = document.getElementById('adjustItemName').value.trim();
        item.item_type = document.getElementById('adjustItemDept').value.toLowerCase();
        item.on_hand = parseFloat(document.getElementById('adjustItemQty').value);
        item.reorder_point = parseFloat(document.getElementById('adjustItemReorder').value);
        item.unit_of_measure = document.getElementById('adjustItemUnit').value;

        applyInventoryFilters();
        closeModal('adjustStockModal');
        alert(`Stock counts for "${item.name}" updated successfully!`);
    }
}

function handleDeleteFromModal() {
    const itemId = parseInt(document.getElementById('deleteItemId').value, 10);
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    if (confirm(`Permanently remove "${item.name}" from inventory?`)) {
        allItems = allItems.filter(i => i.id !== itemId);
        applyInventoryFilters();
        closeModal('adjustStockModal');
        alert(`Item removed.`);
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