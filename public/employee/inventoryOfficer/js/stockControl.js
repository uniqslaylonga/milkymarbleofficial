let allMovementLogs = [];
let filteredMovementLogs = [];
let allLowStockAlerts = [];
let currentMovPage = 1;
const MOV_PAGE_SIZE = 5;

document.addEventListener('DOMContentLoaded', () => {
    fetchStockControlData();

    // Search and Date Filter Listeners
    document.getElementById('stockSearchInput')?.addEventListener('input', applyMovementFilters);
    document.getElementById('dateFilter')?.addEventListener('change', applyMovementFilters);

    // Pagination buttons
    document.getElementById('prevMovBtn')?.addEventListener('click', () => {
        if (currentMovPage > 1) {
            currentMovPage--;
            renderMovementLogs();
        }
    });

    document.getElementById('nextMovBtn')?.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredMovementLogs.length / MOV_PAGE_SIZE) || 1;
        if (currentMovPage < totalPages) {
            currentMovPage++;
            renderMovementLogs();
        }
    });
});

async function fetchStockControlData() {
    try {
        let response;
        if (typeof employeeFetch === 'function') {
            response = await employeeFetch('/api/procurement-officer/stock-control');
        } else {
            const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
            const headers = userId ? { 'x-user-id': userId } : {};
            response = await fetch('/api/procurement-officer/stock-control', { headers });
        }

        if (!response.ok) throw new Error(await EmployeeUI.errorMessage(response));

        const data = await response.json();

        // User Profile
        const userFullNameEl = document.getElementById('userFullName');
        if (userFullNameEl) userFullNameEl.textContent = data.user.fullName || 'Rhodalyn D. Leodones';

        // KPI Grid
        if (data.metrics) {
            document.getElementById('openRequests').textContent = String(data.metrics.openRequests || 2).padStart(2, '0');
            document.getElementById('activeVendors').textContent = String(data.metrics.activeVendors || 3).padStart(2, '0');
            document.getElementById('itemsMonitored').textContent = String(data.metrics.itemsMonitored || 8).padStart(2, '0');
            document.getElementById('reservedStocks').textContent = data.metrics.reservedStocks || '22.5 kg';
        }

        allMovementLogs = data.movementLogs || [];
        allLowStockAlerts = data.lowStockItems || [];

        applyMovementFilters();
        renderLowStockAlerts(allLowStockAlerts);

    } catch (error) {
        console.error('Could not load live data from the server:', error);
        if (window.EmployeeUI) { EmployeeUI.showError(error); EmployeeUI.failTables(); }
    }
}

// Unified Movement Filter
function applyMovementFilters() {
    const q = document.getElementById('stockSearchInput')?.value.toLowerCase().trim() || '';
    const dateFilter = document.getElementById('dateFilter')?.value || 'all';

    filteredMovementLogs = allMovementLogs.filter(log => {
        if (dateFilter !== 'all' && log.dateGroup !== dateFilter) return false;
        if (q) {
            const name = (log.item_name || '').toLowerCase();
            const staff = (log.employee_name || '').toLowerCase();
            const time = (log.displayTime || '').toLowerCase();
            if (!name.includes(q) && !staff.includes(q) && !time.includes(q)) return false;
        }
        return true;
    });

    document.getElementById('movementCount').textContent = filteredMovementLogs.length;
    currentMovPage = 1;
    renderMovementLogs();
}

// Render Movements with Permanent Numbered Pager
function renderMovementLogs() {
    const container = document.getElementById('movementList');
    const pageInfo = document.getElementById('movPageInfo');
    const prevBtn = document.getElementById('prevMovBtn');
    const nextBtn = document.getElementById('nextMovBtn');

    if (!container) return;

    if (filteredMovementLogs.length === 0) {
        container.innerHTML = '<div class="loading-state-text">No stock movement activity found for this filter.</div>';
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 logs';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        renderMovPagerButtons(1, 1);
        return;
    }

    const totalPages = Math.ceil(filteredMovementLogs.length / MOV_PAGE_SIZE) || 1;
    const startIndex = (currentMovPage - 1) * MOV_PAGE_SIZE;
    const pageItems = filteredMovementLogs.slice(startIndex, startIndex + MOV_PAGE_SIZE);

    if (pageInfo) {
        const startNum = startIndex + 1;
        const endNum = Math.min(startIndex + MOV_PAGE_SIZE, filteredMovementLogs.length);
        pageInfo.textContent = `Showing ${startNum}-${endNum} of ${filteredMovementLogs.length} logs`;
    }
    if (prevBtn) prevBtn.disabled = currentMovPage <= 1;
    if (nextBtn) nextBtn.disabled = currentMovPage >= totalPages;

    renderMovPagerButtons(totalPages, currentMovPage);

    container.innerHTML = pageItems.map(log => {
        const type = log.change_type || 'ADJUST';
        const qty = parseFloat(log.quantity_changed || 0);
        const itemCode = 'SKU-0' + (log.item_id || 1);

        let iconClass = 'fa-sliders';
        let boxClass = 'box-adjust';
        let changeSign = `±${qty}`;
        let changeClass = 'adj';

        if (type === 'ADD') {
            iconClass = 'fa-plus';
            boxClass = 'box-plus';
            changeSign = `+${qty} ${log.unit || ''}`;
            changeClass = 'pos';
        } else if (type === 'DEDUCT') {
            iconClass = 'fa-minus';
            boxClass = 'box-minus';
            changeSign = `-${qty} ${log.unit || ''}`;
            changeClass = 'neg';
        }

        return `
            <div class="movement-item">
                <div class="mov-leading">
                    <div class="mov-icon-box ${boxClass}">
                        <i class="fa-solid ${iconClass}"></i>
                    </div>
                    <div>
                        <div class="mov-name">${escapeHtml(log.item_name)}</div>
                        <div class="mov-code">${itemCode} • ${escapeHtml(log.employee_name || 'Staff')}</div>
                    </div>
                </div>

                <div class="mov-change ${changeClass}">
                    ${changeSign}
                </div>

                <div class="mov-user">
                    <div>
                        <div class="time-stamp">${escapeHtml(log.displayTime)}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Movements Numbered Pager
function renderMovPagerButtons(totalPages, activePage) {
    const pagerNumbers = document.getElementById('movPagerNumbers');
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
            if (page && page !== currentMovPage) {
                currentMovPage = page;
                renderMovementLogs();
            }
        });
    });
}

// Render Low Stock Alerts with DOA Routing
function renderLowStockAlerts(alerts) {
    const container = document.getElementById('alertsList');
    const alertsBadge = document.getElementById('alertsCountBadge');
    if (!container) return;

    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<div class="loading-state-text">All items are sufficiently stocked above reorder points!</div>';
        if (alertsBadge) alertsBadge.textContent = '0 items';
        return;
    }

    if (alertsBadge) alertsBadge.textContent = `${alerts.length} Breaches`;

    container.innerHTML = alerts.map(alert => {
        const reorderLevel = parseFloat(alert.reorder_level || 1);
        const onHand = parseFloat(alert.on_hand || 0);
        const percent = Math.min(100, Math.round((onHand / reorderLevel) * 100));
        const categoryLabel = alert.item_type === 'packaging' ? 'Packaging' : 'Ingredients';

        let routeClass = 'route-procure';
        if (alert.doa_route === 'ceo') routeClass = 'route-ceo';
        else if (alert.doa_route === 'finance') routeClass = 'route-finance';

        return `
            <div class="alert-card">
                <div class="alert-top">
                    <div>
                        <div class="alert-item-name">${escapeHtml(alert.name)}</div>
                        <div class="alert-item-meta">
                            ${categoryLabel} — <span class="highlight-low">${onHand} ${alert.unit || ''} on hand</span> (reorder at ${reorderLevel})
                        </div>
                        <div style="margin-top: 4px;">
                            <span class="badge-route ${routeClass}">${escapeHtml(alert.doa_text || 'DOA Check')}</span>
                        </div>
                    </div>

                    <div class="alert-actions">
                        <button type="button" class="btn-handle-restock" onclick="quickHandleAlert(${alert.id}, '${escapeHtml(alert.name)}', ${alert.est_cost || 250}, '${alert.doa_route || 'procure'}')">
                            Pitch Reorder
                        </button>
                    </div>
                </div>

                <div class="alert-progress-track">
                    <div class="alert-progress-fill" style="width: ${percent}%;"></div>
                </div>
            </div>
        `;
    }).join('');
}

function quickHandleAlert(itemId, itemName, estCost, doaRoute) {
    let routeNotice = '🟢 Direct Buy Authorized for Rhodalyn (≤ ₱300)';
    if (doaRoute === 'ceo') routeNotice = '🔴 Escalated to CEO (> ₱500)';
    else if (doaRoute === 'finance') routeNotice = '🟠 Endorsed to Financial Officer (₱301–₱500)';

    const confirmPitch = confirm(`Create Restock Purchase Requisition for:\n"${itemName}"\n• Estimated Expense: ₱${estCost.toFixed(2)}\n• Routing: ${routeNotice}\n\nProceed?`);
    if (confirmPitch) {
        alert(`Requisition for "${itemName}" submitted to Procurement queue!\nForwarded to: ${routeNotice}`);
        window.location.href = 'procurement.html';
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