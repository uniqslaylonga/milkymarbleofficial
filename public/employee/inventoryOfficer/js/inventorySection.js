let activeCategory = 'all';
let allItems = [];
let allVendors = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchInventorySectionData();

    // Category Tabs
    document.getElementById('tabCatAll').addEventListener('click', function () { filterCategory('all', this); });
    document.getElementById('tabCatIngredients').addEventListener('click', function () { filterCategory('ingredients', this); });
    document.getElementById('tabCatPackaging').addEventListener('click', function () { filterCategory('packaging', this); });
    document.getElementById('tabCatEquipment').addEventListener('click', function () { filterCategory('equipment', this); });

    // Search and Status Filters
    document.getElementById('tableSearch').addEventListener('input', filterInventoryTable);
    document.getElementById('statusFilter').addEventListener('change', filterInventoryTable);

    // Form Handlers
    document.getElementById('addStockForm').addEventListener('submit', handleAddStock);
    document.getElementById('adjustStockForm').addEventListener('submit', handleAdjustStock);
    document.getElementById('deleteStockForm').addEventListener('submit', handleDeleteStock);
});

async function fetchInventorySectionData() {
    try {
        const response = await fetch('/api/procurement-officer/inventory-section');
        if (!response.ok) throw new Error('Failed to load inventory section data');

        const data = await response.json();

        // User Profile
        const userFullNameEl = document.getElementById('userFullName');
        if (userFullNameEl) userFullNameEl.textContent = data.user.fullName;
        const addReqEl = document.getElementById('addRequester');
        if (addReqEl) addReqEl.value = data.user.firstName || '';

        allItems = data.items || [];
        allVendors = data.vendors || [];

        // Category Counts
        document.getElementById('totalCount').textContent = data.counts.totalCount || 0;
        document.getElementById('ingCount').textContent = data.counts.ingCount || 0;
        document.getElementById('pkgCount').textContent = data.counts.pkgCount || 0;
        document.getElementById('eqpCount').textContent = data.counts.eqpCount || 0;

        renderInventoryTable(allItems);
        populateVendorDropdowns(allVendors);

        // Check for URL parameter handle_id to open modal directly if present
        const urlParams = new URLSearchParams(window.location.search);
        const handleId = urlParams.get('handle_id');
        if (handleId) {
            const itemToAdjust = allItems.find(i => String(i.id) === String(handleId));
            if (itemToAdjust) {
                openAdjustStock(itemToAdjust);
            }
        }

    } catch (error) {
        console.error('Error loading inventory section:', error);
        const tbody = document.getElementById('inventoryTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red; padding: 2rem 0;">Failed to load inventory data.</td></tr>';
        }
    }
}

function renderInventoryTable(items) {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;

    if (!items || items.length === 0) {
        tbody.innerHTML = `
            <tr id="emptyRow">
                <td colspan="6" style="text-align: center; padding: 2.5rem 0; color: var(--text-body); font-weight: 700;">
                    No inventory items found. Click "Add Stock" above to record items.
                </td>
            </tr>
        `;
        document.getElementById('visibleCount').textContent = '0';
        return;
    }

    tbody.innerHTML = items.map(item => {
        const unit = item.unit_of_measure || 'grams';
        const reorderPoint = parseFloat(item.reorder_point || 0);
        const onHand = parseFloat(item.on_hand || 0);
        const isLow = (onHand < reorderPoint) && (reorderPoint > 0);
        const itemCode = 'PR-' + (1000 + parseInt(item.id, 10));

        let displayCategory = 'Ingredients';
        if (item.item_type === 'packaging') displayCategory = 'Packaging';
        if (item.item_type === 'equipment') displayCategory = 'Equipment';
        const filterCategory = displayCategory.toLowerCase();

        return `
            <tr data-category="${filterCategory}" data-status="${isLow ? 'low' : 'normal'}">
                <td>
                    <div class="cell-media">
                        <div class="icon-media"><i class="fa-solid fa-clipboard-list"></i></div>
                        <div>
                            <div class="main-text">${escapeHtml(item.name)}</div>
                            <div class="sub-text">${itemCode}</div>
                        </div>
                    </div>
                </td>
                <td><span class="plain-text">${escapeHtml(displayCategory)}</span></td>
                <td>
                    <div class="avail-cell">
                        <span class="avail-num ${isLow ? 'low-stock-num' : ''}">${onHand}</span>
                        <span class="avail-unit">${escapeHtml(unit)}</span>
                        ${isLow ? '<span class="low-badge">Low</span>' : ''}
                    </div>
                </td>
                <td><span class="plain-text">0 ${escapeHtml(unit)}</span></td>
                <td>
                    <span class="plain-text">
                        ${reorderPoint > 0 ? `${reorderPoint} ${escapeHtml(unit)}` : 'N/A'}
                    </span>
                </td>
                <td style="text-align: right;">
                    <button class="btn-adjust-link" onclick="openAdjustStockById(${item.id})">
                        <i class="fa-solid fa-sliders"></i> Adjust
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    filterInventoryTable();
}

function populateVendorDropdowns(vendors) {
    const addSelect = document.getElementById('addVendorSelect');
    const adjustSelect = document.getElementById('adjustVendorSelect');

    const optionsHtml = '<option value="">e.g Sample Store 1</option>' +
        vendors.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');

    if (addSelect) addSelect.innerHTML = optionsHtml;
    if (adjustSelect) adjustSelect.innerHTML = optionsHtml;
}

function filterCategory(cat, btn) {
    activeCategory = cat;
    document.querySelectorAll('.cat-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterInventoryTable();
}

function filterInventoryTable() {
    const query = document.getElementById('tableSearch').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value.toLowerCase();
    const rows = document.querySelectorAll('#inventoryTable tbody tr:not(#emptyRow)');
    let visibleCount = 0;

    rows.forEach(row => {
        const rowCat = row.getAttribute('data-category') || '';
        const rowStatus = row.getAttribute('data-status') || '';
        const rowText = row.innerText.toLowerCase();

        const matchesCategory = (activeCategory === 'all' || rowCat === activeCategory);
        const matchesSearch = rowText.includes(query);
        let matchesStatus = true;

        if (statusFilter === 'low') {
            matchesStatus = (rowStatus === 'low');
        } else if (statusFilter === 'normal') {
            matchesStatus = (rowStatus === 'normal');
        }

        if (matchesCategory && matchesSearch && matchesStatus) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });

    const countElem = document.getElementById('visibleCount');
    if (countElem) countElem.innerText = visibleCount;
}

async function handleAddStock(e) {
    e.preventDefault();
    const name = document.getElementById('addName').value.trim();
    const department = document.getElementById('addDepartment').value;
    const quantity = parseFloat(document.getElementById('addQuantity').value);
    const unit = document.getElementById('addUnit').value;
    const reorder_level = parseFloat(document.getElementById('addReorderLevel').value);

    if (!name || isNaN(quantity) || quantity < 0) {
        alert('Please fill out all required fields with valid values.');
        return;
    }

    try {
        const response = await fetch('/api/procurement-officer/add-stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, department, quantity, unit, reorder_level })
        });
        const result = await response.json();
        if (result.status === 'success') {
            closeModal('addStockModal');
            document.getElementById('addStockForm').reset();
            fetchInventorySectionData();
        } else {
            alert(result.message || 'Error adding stock.');
        }
    } catch (err) {
        console.error(err);
    }
}

async function handleAdjustStock(e) {
    e.preventDefault();
    const item_id = document.getElementById('adjustItemId').value;
    const name = document.getElementById('adjustItemName').value.trim();
    const department = document.getElementById('adjustItemDept').value;
    const quantity = parseFloat(document.getElementById('adjustItemQty').value);
    const unit = document.getElementById('adjustItemUnit').value;
    const reorder_level = parseFloat(document.getElementById('adjustItemReorder').value);

    try {
        const response = await fetch('/api/procurement-officer/adjust-stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id, name, department, quantity, unit, reorder_level })
        });
        const result = await response.json();
        if (result.status === 'success') {
            closeModal('adjustStockModal');
            fetchInventorySectionData();
        } else {
            alert(result.message || 'Error adjusting stock.');
        }
    } catch (err) {
        console.error(err);
    }
}

async function handleDeleteStock(e) {
    e.preventDefault();
    if (!confirm('Are you sure you want to permanently delete this inventory item?')) {
        return;
    }

    const item_id = document.getElementById('deleteItemId').value;
    try {
        const response = await fetch('/api/procurement-officer/delete-stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id })
        });
        const result = await response.json();
        if (result.status === 'success') {
            closeModal('adjustStockModal');
            fetchInventorySectionData();
        } else {
            alert(result.message || 'Error deleting stock.');
        }
    } catch (err) {
        console.error(err);
    }
}

function openAdjustStockById(itemId) {
    const item = allItems.find(i => String(i.id) === String(itemId));
    if (item) {
        openAdjustStock(item);
    }
}

function openAdjustStock(item) {
    let displayCategory = 'Ingredients';
    if (item.item_type === 'packaging') displayCategory = 'Packaging';
    if (item.item_type === 'equipment') displayCategory = 'Equipment';

    document.getElementById('adjustItemId').value = item.id || 0;
    document.getElementById('deleteItemId').value = item.id || 0;
    document.getElementById('adjustItemName').value = item.name || '';
    document.getElementById('adjustItemDept').value = displayCategory;
    document.getElementById('adjustItemQty').value = item.on_hand || 0;
    document.getElementById('adjustItemReserved').value = 0;
    document.getElementById('adjustItemReorder').value = item.reorder_point || 10;
    document.getElementById('adjustItemUnit').value = item.unit_of_measure || 'grams';
    openModal('adjustStockModal');
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