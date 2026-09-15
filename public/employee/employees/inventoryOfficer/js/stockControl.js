document.addEventListener('DOMContentLoaded', () => {
    fetchStockControlData();

    const dateFilterSelect = document.getElementById('dateFilter');
    if (dateFilterSelect) {
        dateFilterSelect.addEventListener('change', filterMovements);
    }
});

async function fetchStockControlData() {
    try {
        const response = await fetch('/api/procurement-officer/stock-control');
        if (!response.ok) throw new Error('Failed to load stock control data');

        const data = await response.json();

        // User Profile
        const userFullNameEl = document.getElementById('userFullName');
        if (userFullNameEl) userFullNameEl.textContent = data.user.fullName;

        // KPI Grid
        document.getElementById('openRequests').textContent = String(data.metrics.openRequests).padStart(2, '0');
        document.getElementById('activeVendors').textContent = String(data.metrics.activeVendors).padStart(2, '0');
        document.getElementById('itemsMonitored').textContent = String(data.metrics.itemsMonitored).padStart(2, '0');
        document.getElementById('reservedStocks').textContent = data.metrics.reservedStocks || 0;

        // Render Movement Logs
        renderMovementLogs(data.movementLogs);

        // Render Reorder Alerts
        renderLowStockAlerts(data.lowStockItems);

    } catch (error) {
        console.error('Error fetching stock control data:', error);
    }
}

function renderMovementLogs(logs) {
    const container = document.getElementById('movementList');
    const movementCountEl = document.getElementById('movementCount');
    if (!container) return;

    if (!logs || logs.length === 0) {
        container.innerHTML = '<div class="empty-state">No stock activity recorded yet. Adjust or add stock in Inventory Section to see movements.</div>';
        if (movementCountEl) movementCountEl.textContent = '0';
        return;
    }

    if (movementCountEl) movementCountEl.textContent = logs.length;

    container.innerHTML = logs.map(log => {
        const type = log.change_type || 'ADJUST';
        const qty = parseInt(log.quantity_changed || 0, 10);
        const itemCode = 'PR-' + (1000 + parseInt(log.item_id || 0, 10));

        let iconClass = 'fa-sliders';
        let boxClass = 'box-adjust';
        let changeSign = (qty > 0) ? (`±${qty}`) : '0';
        let changeClass = 'adj';

        if (type === 'ADD') {
            iconClass = 'fa-plus';
            boxClass = 'box-plus';
            changeSign = `+${qty}`;
            changeClass = 'pos';
        } else if (type === 'DEDUCT') {
            iconClass = 'fa-minus';
            boxClass = 'box-minus';
            changeSign = `-${qty}`;
            changeClass = 'neg';
        }

        return `
            <div class="movement-item" data-dategroup="${escapeHtml(log.dateGroup)}">
                <div class="mov-leading">
                    <div class="mov-icon-box ${boxClass}">
                        <i class="fa-solid ${iconClass}"></i>
                    </div>
                    <div>
                        <div class="mov-name">${escapeHtml(log.item_name)}</div>
                        <div class="mov-code">${itemCode}</div>
                    </div>
                </div>

                <div class="mov-change ${changeClass}">
                    ${changeSign}
                </div>

                <div class="mov-user">
                    <div class="mov-avatar"><i class="fa-regular fa-image"></i></div>
                    <div>
                        <div class="user-name">${escapeHtml(log.employee_name || 'Staff Member')}</div>
                        <div class="time-stamp">${escapeHtml(log.displayTime)}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderLowStockAlerts(alerts) {
    const container = document.getElementById('alertsList');
    const alertsBadge = document.getElementById('alertsCountBadge');
    if (!container) return;

    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<div class="empty-state">All items are sufficiently stocked!</div>';
        if (alertsBadge) alertsBadge.textContent = '0 items';
        return;
    }

    if (alertsBadge) alertsBadge.textContent = `${alerts.length} items`;

    container.innerHTML = alerts.map(alert => {
        const reorderLevel = parseFloat(alert.reorder_level || 0);
        const onHand = parseFloat(alert.on_hand || 0);
        const percent = reorderLevel > 0 ? Math.min(100, Math.round((onHand / reorderLevel) * 100)) : 0;
        const categoryLabel = alert.item_type === 'packaging' ? 'Packaging' : 'Ingredients';

        return `
            <div class="alert-card">
                <div class="alert-top">
                    <div>
                        <div class="alert-item-name">${escapeHtml(alert.name)}</div>
                        <div class="alert-item-meta">
                            ${categoryLabel} - 
                            <span class="highlight-low">${onHand} available</span>, 
                            reorder ${reorderLevel}
                        </div>
                    </div>

                    <div class="alert-actions">
                        <span class="urgent-tag">Urgent</span>
                        <a href="../inventorySection.html?handle_id=${alert.id}" class="handle-btn">
                            <i class="fa-solid fa-check"></i> Handle
                        </a>
                    </div>
                </div>

                <div class="alert-progress-track">
                    <div class="alert-progress-fill" style="width: ${percent}%;"></div>
                </div>
            </div>
        `;
    }).join('');
}

function filterMovements() {
    const selected = document.getElementById('dateFilter').value;
    const rows = document.querySelectorAll('.movement-item');
    let count = 0;

    rows.forEach(row => {
        const group = row.getAttribute('data-dategroup');
        if (selected === 'all' || selected === '' || group === selected) {
            row.style.display = 'flex';
            count++;
        } else {
            row.style.display = 'none';
        }
    });

    const counter = document.getElementById('movementCount');
    if (counter) counter.innerText = count;
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