let allBudgetRecords = [];
let filteredBudgetRecords = [];
let currentBudgetPage = 1;
const BUDGET_PAGE_SIZE = 5;

document.addEventListener('DOMContentLoaded', () => {
    fetchBudgetRecords();

    // Search and Filter Listeners
    document.getElementById('budgetSearchInput')?.addEventListener('input', applyBudgetFilters);
    document.getElementById('cycleFilter')?.addEventListener('change', applyBudgetFilters);

    // Form Submission
    document.getElementById('budgetAllocationForm')?.addEventListener('submit', handleAddBudgetCycle);

    // Pagination buttons
    document.getElementById('prevBudgetBtn')?.addEventListener('click', () => {
        if (currentBudgetPage > 1) {
            currentBudgetPage--;
            renderBudgetTable();
        }
    });

    document.getElementById('nextBudgetBtn')?.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredBudgetRecords.length / BUDGET_PAGE_SIZE) || 1;
        if (currentBudgetPage < totalPages) {
            currentBudgetPage++;
            renderBudgetTable();
        }
    });
});

async function fetchBudgetRecords() {
    try {
        let response;
        if (typeof employeeFetch === 'function') {
            response = await employeeFetch('/api/finance-officer/budget');
        } else {
            const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
            const headers = userId ? { 'x-user-id': userId } : {};
            response = await fetch('/api/finance-officer/budget', { headers });
        }

        if (!response.ok) throw new Error('Failed to load budget data');

        const data = await response.json();

        // Populate User Profile
        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userNameEl) userNameEl.textContent = data.user.fullName || 'Financial Officer';
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        allBudgetRecords = data.records || [];
        applyBudgetFilters();

    } catch (error) {
        console.warn('Backend offline, loading realistic fallback budget cycles for Milky Marble:', error);

        document.getElementById('userName').textContent = 'Financial Officer';

        // Fallback realistic budget cycles matching the Tuesday/Thursday model and DOA petty cash buffer
        allBudgetRecords = [
            {
                id: 1,
                date: 'Sep 22 & 24, 2026 (Week 4)',
                month_group: 'september',
                capital: 6500.00,
                raw_material: 3200.00,
                petty_cash_fund: 800.00,
                emergency_funds: 1000.00,
                manpower_cost: 1500.00,
                status: 'ACTIVE'
            },
            {
                id: 2,
                date: 'Sep 15 & 17, 2026 (Week 3)',
                month_group: 'september',
                capital: 6200.00,
                raw_material: 2950.00,
                petty_cash_fund: 750.00,
                emergency_funds: 1000.00,
                manpower_cost: 1500.00,
                status: 'CLOSED'
            },
            {
                id: 3,
                date: 'Sep 08 & 10, 2026 (Week 2)',
                month_group: 'september',
                capital: 6100.00,
                raw_material: 2800.00,
                petty_cash_fund: 800.00,
                emergency_funds: 1000.00,
                manpower_cost: 1500.00,
                status: 'CLOSED'
            },
            {
                id: 4,
                date: 'Sep 01 & 03, 2026 (Week 1)',
                month_group: 'september',
                capital: 6200.00,
                raw_material: 2450.00,
                petty_cash_fund: 750.00,
                emergency_funds: 1200.00,
                manpower_cost: 1500.00,
                status: 'CLOSED'
            },
            {
                id: 5,
                date: 'Aug 25 & 27, 2026 (Month-End)',
                month_group: 'august',
                capital: 5800.00,
                raw_material: 2600.00,
                petty_cash_fund: 600.00,
                emergency_funds: 1100.00,
                manpower_cost: 1500.00,
                status: 'CLOSED'
            }
        ];

        applyBudgetFilters();
    }
}

function applyBudgetFilters() {
    const q = document.getElementById('budgetSearchInput')?.value.toLowerCase().trim() || '';
    const cycleFilter = document.getElementById('cycleFilter')?.value || 'all';

    filteredBudgetRecords = allBudgetRecords.filter(item => {
        if (cycleFilter !== 'all' && item.month_group !== cycleFilter) return false;
        if (q) {
            const dateStr = (item.date || '').toLowerCase();
            if (!dateStr.includes(q)) return false;
        }
        return true;
    });

    // Update KPI Cards based on latest active cycle
    const activeCycle = allBudgetRecords.find(b => b.status === 'ACTIVE') || allBudgetRecords[0];
    if (activeCycle) {
        document.getElementById('kpiCapital').textContent = '₱' + formatAmount(activeCycle.capital);
        document.getElementById('kpiRawMaterials').textContent = '₱' + formatAmount(activeCycle.raw_material);
        document.getElementById('kpiPettyCash').textContent = '₱' + formatAmount(activeCycle.petty_cash_fund || 800);
        document.getElementById('kpiEmergency').textContent = '₱' + formatAmount(activeCycle.emergency_funds);
    }

    currentBudgetPage = 1;
    renderBudgetTable();
}

function renderBudgetTable() {
    const tbody = document.getElementById('budgetTableBody');
    const pageInfo = document.getElementById('budgetPageInfo');
    const prevBtn = document.getElementById('prevBudgetBtn');
    const nextBtn = document.getElementById('nextBudgetBtn');

    if (!tbody) return;

    if (filteredBudgetRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading-state-text">No budget cycle records found.</td></tr>';
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 records';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        renderBudgetPagerButtons(1, 1);
        return;
    }

    const totalPages = Math.ceil(filteredBudgetRecords.length / BUDGET_PAGE_SIZE) || 1;
    const startIndex = (currentBudgetPage - 1) * BUDGET_PAGE_SIZE;
    const pageItems = filteredBudgetRecords.slice(startIndex, startIndex + BUDGET_PAGE_SIZE);

    if (pageInfo) {
        const startNum = startIndex + 1;
        const endNum = Math.min(startIndex + BUDGET_PAGE_SIZE, filteredBudgetRecords.length);
        pageInfo.textContent = `Showing ${startNum}-${endNum} of ${filteredBudgetRecords.length} records`;
    }
    if (prevBtn) prevBtn.disabled = currentBudgetPage <= 1;
    if (nextBtn) nextBtn.disabled = currentBudgetPage >= totalPages;

    renderBudgetPagerButtons(totalPages, currentBudgetPage);

    tbody.innerHTML = pageItems.map(row => {
        const capital = formatAmount(row.capital);
        const rawMaterial = formatAmount(row.raw_material);
        const pettyCash = formatAmount(row.petty_cash_fund || 800);
        const emergencyFunds = formatAmount(row.emergency_funds);
        const manpowerCost = formatAmount(row.manpower_cost);
        const isActive = row.status === 'ACTIVE';

        return `
            <tr>
                <td>
                    <strong style="color: var(--brown-soft); font-size: 13px;">${escapeHtml(row.date)}</strong>
                </td>
                <td><strong style="color: var(--text-dark); font-family: var(--font-family-heading); font-size: 13.5px;">₱${capital}</strong></td>
                <td><span style="color: var(--brown-soft); font-weight: 700;">₱${rawMaterial}</span></td>
                <td><span style="color: #2E7D32; font-weight: 700;">₱${pettyCash}</span></td>
                <td><span style="color: var(--text-muted);">₱${emergencyFunds}</span></td>
                <td><span style="color: var(--text-muted);">₱${manpowerCost}</span></td>
                <td>
                    <span class="status-badge-budget ${isActive ? 'active' : 'closed'}">
                        ${isActive ? 'Active Cycle' : 'Reconciled'}
                    </span>
                </td>
                <td style="text-align: right;">
                    <button type="button" class="btn-view-budget" onclick="viewCycleBreakdown(${row.id})">
                        Audit Envelope
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Numbered Pager Buttons
function renderBudgetPagerButtons(totalPages, activePage) {
    const pagerNumbers = document.getElementById('budgetPagerNumbers');
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
            if (page && page !== currentBudgetPage) {
                currentBudgetPage = page;
                renderBudgetTable();
            }
        });
    });
}

function viewCycleBreakdown(id) {
    const cycle = allBudgetRecords.find(b => b.id === id);
    if (!cycle) return;

    alert(`Budget Envelope Audit:\n• Cycle: ${cycle.date}\n• Total Pool: ₱${formatAmount(cycle.capital)}\n• Raw Materials: ₱${formatAmount(cycle.raw_material)}\n• Direct Buy (&le; ₱300) Petty Cash: ₱${formatAmount(cycle.petty_cash_fund || 800)}\n• Emergency Contingency: ₱${formatAmount(cycle.emergency_funds)}\n• Manpower: ₱${formatAmount(cycle.manpower_cost)}`);
}

function handleAddBudgetCycle(e) {
    e.preventDefault();

    const desc = document.getElementById('cycleName').value.trim();
    const dateVal = document.getElementById('budgetDate').value;
    const capital = parseFloat(document.getElementById('capitalAmount').value || 0);
    const rawMaterial = parseFloat(document.getElementById('rawMaterialAmount').value || 0);
    const pettyCash = parseFloat(document.getElementById('pettyCashAmount').value || 0);
    const emergency = parseFloat(document.getElementById('emergencyAmount').value || 0);
    const manpower = parseFloat(document.getElementById('manpowerAmount').value || 0);

    const newRecord = {
        id: Date.now(),
        date: `${desc} (${dateVal})`,
        month_group: 'september',
        capital,
        raw_material: rawMaterial,
        petty_cash_fund: pettyCash,
        emergency_funds: emergency,
        manpower_cost: manpower,
        status: 'ACTIVE'
    };

    allBudgetRecords.forEach(b => { if (b.status === 'ACTIVE') b.status = 'CLOSED'; });
    allBudgetRecords.unshift(newRecord);
    applyBudgetFilters();
    closeBudgetModal();
    e.target.reset();

    alert(`Operating budget cycle authorized!\nRevolving petty cash of ₱${pettyCash.toFixed(2)} allocated for Procurement direct buys.`);
}

function openBudgetModal() {
    const m = document.getElementById('budgetModal');
    if (m) {
        m.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closeBudgetModal() {
    const m = document.getElementById('budgetModal');
    if (m) {
        m.classList.remove('open');
        document.body.style.overflow = '';
    }
}

function formatAmount(val) {
    return Number(val || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
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