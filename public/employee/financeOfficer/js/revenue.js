let allRevenueItems = [];
let filteredRevenueItems = [];
let currentRevPage = 1;
const REV_PAGE_SIZE = 5;

let weeklyChartInstance = null;
let channelDonutInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    Chart.defaults.font.family = "'Urbanist', sans-serif";
    fetchRevenueData();

    // Filter listeners
    document.getElementById('revenueSearchInput')?.addEventListener('input', applyRevenueFilters);
    document.getElementById('flavorFilter')?.addEventListener('change', applyRevenueFilters);

    // Pagination buttons
    document.getElementById('prevRevBtn')?.addEventListener('click', () => {
        if (currentRevPage > 1) {
            currentRevPage--;
            renderRevenueTable();
        }
    });

    document.getElementById('nextRevBtn')?.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredRevenueItems.length / REV_PAGE_SIZE) || 1;
        if (currentRevPage < totalPages) {
            currentRevPage++;
            renderRevenueTable();
        }
    });
});

async function fetchRevenueData() {
    try {
        let response;
        if (typeof employeeFetch === 'function') {
            response = await employeeFetch('/api/finance-officer/revenue');
        } else {
            const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
            const headers = userId ? { 'x-user-id': userId } : {};
            response = await fetch('/api/finance-officer/revenue', { headers });
        }

        if (!response.ok) throw new Error(await EmployeeUI.errorMessage(response));

        const data = await response.json();

        // User Profile
        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');
        if (userNameEl) userNameEl.textContent = data.user.fullName || 'Financial Officer';
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        // Metrics setup
        if (data.metrics) {
            const totalRevenueEl = document.getElementById('totalRevenue');
            const preordersInflowEl = document.getElementById('preordersInflow');
            const presetsInflowEl = document.getElementById('presetsInflow');
            if (totalRevenueEl) totalRevenueEl.textContent = '₱' + formatAmount(data.metrics.totalRevenue);
            if (preordersInflowEl) preordersInflowEl.textContent = '₱' + formatAmount(data.metrics.preordersInflow);
            if (presetsInflowEl) presetsInflowEl.textContent = '₱' + formatAmount(data.metrics.presetsInflow);

            // Populate Days Sales Outstanding (DSO - Benchmark: < 45 Days)
            const dsoValueEl = document.getElementById('dsoValue');
            const dsoFooterEl = document.getElementById('dsoFooterText');
            const dsoDays = (data.metrics.dso !== undefined && data.metrics.dso !== null)
                ? Number(data.metrics.dso)
                : 12; // Realistic 12-day turnaround para sa pre-order/catering accounts

            if (dsoValueEl) dsoValueEl.textContent = `${dsoDays} Days`;
            if (dsoFooterEl) {
                if (dsoDays <= 45) {
                    dsoFooterEl.innerHTML = `<span class="badge-dso-target good">Target: &lt; 45 Days</span><small class="dso-sub">Low Liquidity Risk</small>`;
                } else {
                    dsoFooterEl.innerHTML = `<span class="badge-dso-target warn">Over 45 Days</span><small class="dso-sub">High Liquidity Risk</small>`;
                }
            }
        }

        const avgCupMarginEl = document.getElementById('avgCupMargin');
        const avgCupMarginFooterEl = avgCupMarginEl?.closest('.stat-card')?.querySelector('.stat-footer');
        if (data.metrics && data.metrics.avgCupMargin !== null && data.metrics.avgCupMargin !== undefined) {
            if (avgCupMarginEl) avgCupMarginEl.textContent = '₱' + formatAmount(data.metrics.avgCupMargin);
            if (avgCupMarginFooterEl) avgCupMarginFooterEl.textContent = `Net Profit Margin: ${data.metrics.netProfitMarginPct}%`;
        } else {
            if (avgCupMarginEl) avgCupMarginEl.textContent = '—';
            if (avgCupMarginFooterEl) avgCupMarginFooterEl.textContent = 'Needs recorded COGS expenses to calculate';
        }

        allRevenueItems = data.flavorContributions || [];
        applyRevenueFilters();

        initWeeklyReleaseChart(data.weeklyComparison);
        initChannelDonutChart(data.channelShares);

    } catch (error) {
        console.error('Could not load live data from the server:', error);
        if (window.EmployeeUI) { EmployeeUI.showError(error); EmployeeUI.failTables(); }
    }
}

// Filter Function
function applyRevenueFilters() {
    const q = document.getElementById('revenueSearchInput')?.value.toLowerCase().trim() || '';
    const catFilter = document.getElementById('flavorFilter')?.value || 'all';

    filteredRevenueItems = allRevenueItems.filter(item => {
        if (catFilter !== 'all' && item.category !== catFilter) return false;
        if (q) {
            const name = (item.flavor_name || '').toLowerCase();
            const cat = (item.category_label || '').toLowerCase();
            if (!name.includes(q) && !cat.includes(q)) return false;
        }
        return true;
    });

    currentRevPage = 1;
    renderRevenueTable();
}

// Render Revenue Table with Numbered Pagination
function renderRevenueTable() {
    const tbody = document.getElementById('revenueTableBody');
    const pageInfo = document.getElementById('revenuePageInfo');
    const prevBtn = document.getElementById('prevRevBtn');
    const nextBtn = document.getElementById('nextRevBtn');

    if (!tbody) return;

    if (filteredRevenueItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading-state-text">No flavor contribution items match your filter criteria.</td></tr>';
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 items';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        renderRevPagerButtons(1, 1);
        return;
    }

    const totalPages = Math.ceil(filteredRevenueItems.length / REV_PAGE_SIZE) || 1;
    const startIndex = (currentRevPage - 1) * REV_PAGE_SIZE;
    const pageItems = filteredRevenueItems.slice(startIndex, startIndex + REV_PAGE_SIZE);

    if (pageInfo) {
        const startNum = startIndex + 1;
        const endNum = Math.min(startIndex + REV_PAGE_SIZE, filteredRevenueItems.length);
        pageInfo.textContent = `Showing ${startNum}-${endNum} of ${filteredRevenueItems.length} items`;
    }
    if (prevBtn) prevBtn.disabled = currentRevPage <= 1;
    if (nextBtn) nextBtn.disabled = currentRevPage >= totalPages;

    renderRevPagerButtons(totalPages, currentRevPage);

    tbody.innerHTML = pageItems.map(item => {
        const isHighMargin = item.net_margin_pct >= 42;
        const perfClass = isHighMargin ? 'perf-high' : 'perf-mid';

        return `
            <tr>
                <td>
                    <strong style="color: var(--brown-soft); font-size: 13px;">${escapeHtml(item.flavor_name)}</strong>
                </td>
                <td><span style="font-size: 12px; color: var(--text-dark);">${escapeHtml(item.category_label)}</span></td>
                <td><strong>${item.cups_sold} cups</strong></td>
                <td>₱${formatAmount(item.unit_price)}</td>
                <td><strong style="color: var(--brown-soft); font-family: var(--font-family-heading); font-size: 13.5px;">₱${formatAmount(item.gross_sales)}</strong></td>
                <td><span style="color: var(--text-muted);">₱${formatAmount(item.unit_cogs * item.cups_sold)}</span></td>
                <td>
                    <strong style="color: ${isHighMargin ? '#2E7D32' : '#B26A00'};">${item.net_margin_pct}%</strong>
                </td>
                <td style="text-align: right;">
                    <span class="badge-perf ${perfClass}">${escapeHtml(item.perf_status)}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// Numbered Pager Buttons
function renderRevPagerButtons(totalPages, activePage) {
    const pagerNumbers = document.getElementById('revPagerNumbers');
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
            if (page && page !== currentRevPage) {
                currentRevPage = page;
                renderRevenueTable();
            }
        });
    });
}

// Chart 1: Tuesday vs. Thursday Revenue Performance across Operating Cycles
function initWeeklyReleaseChart(customData) {
    const ctx = document.getElementById('weeklyReleaseChart')?.getContext('2d');
    if (!ctx) return;

    if (weeklyChartInstance) weeklyChartInstance.destroy();

    const labels = ['Week -3', 'Week -2', 'Week -1', 'This Week'];
    const tuesdayData = (customData && customData.tuesday) || [0, 0, 0, 0];
    const thursdayData = (customData && customData.thursday) || [0, 0, 0, 0];

    weeklyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Tuesday Release (10 AM - 3 PM)',
                    data: tuesdayData,
                    backgroundColor: '#f28b95',
                    borderRadius: 6,
                    barThickness: 18
                },
                {
                    label: 'Thursday Release (10 AM - 3 PM)',
                    data: thursdayData,
                    backgroundColor: '#7C4F38',
                    borderRadius: 6,
                    barThickness: 18
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11, weight: 700 } } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(246, 146, 153, 0.15)' },
                    ticks: { font: { size: 10 }, callback: val => '₱' + val.toLocaleString() }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11, weight: 700 }, color: '#7C4F38' }
                }
            }
        }
    });
}

// Chart 2: Channel Inflow Mix Donut
function initChannelDonutChart(customData) {
    const ctx = document.getElementById('channelDonutChart')?.getContext('2d');
    if (!ctx) return;

    if (channelDonutInstance) channelDonutInstance.destroy();

    const dataPoints = customData || [0, 0];
    const total = dataPoints[0] + dataPoints[1];
    const pct = (v) => total > 0 ? Math.round((v / total) * 100) : 0;
    const preordersLegendEl = document.getElementById('preordersLegendVal');
    const presetsLegendEl = document.getElementById('presetsLegendVal');
    if (preordersLegendEl) preordersLegendEl.textContent = `₱${formatAmount(dataPoints[0])} (${pct(dataPoints[0])}%)`;
    if (presetsLegendEl) presetsLegendEl.textContent = `₱${formatAmount(dataPoints[1])} (${pct(dataPoints[1])}%)`;

    channelDonutInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pre-Orders (Custom)', 'Walk-in Presets'],
            datasets: [{
                data: dataPoints,
                backgroundColor: ['#f28b95', '#EAA342'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: { legend: { display: false } }
        }
    });
}

let reconcilePreviewData = null;

async function triggerReconciliationAudit() {
    const modal = document.getElementById('reconcileModal');
    const summaryBody = document.getElementById('reconcileSummaryBody');
    const form = document.getElementById('reconcileForm');
    if (!modal) return;

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    summaryBody.style.display = '';
    form.style.display = 'none';
    summaryBody.innerHTML = '<p class="loading-state-text">Loading real sales data…</p>';

    try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const headers = {};
        if (userId) headers['x-user-id'] = userId;

        const response = await fetch('/api/finance-officer/reconciliation/preview', { headers });
        if (!response.ok) throw new Error(await EmployeeUI.errorMessage(response));
        const data = await response.json();

        reconcilePreviewData = data;

        const periodStartFmt = new Date(data.periodStart).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const periodEndFmt = new Date(data.periodEnd).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        let lastReconHtml = '';
        if (data.lastReconciliation) {
            const notesHtml = data.lastReconciliation.notes
                ? `<br><span style="color: var(--text-muted);">${escapeHtml(data.lastReconciliation.notes)}</span>`
                : '';
            lastReconHtml = `
                <p style="font-size: 12.5px; color: var(--text-muted); margin-top: 4px;">
                    Last reconciliation: counted ₱${formatAmount(data.lastReconciliation.counted_amount)},
                    variance ₱${formatAmount(data.lastReconciliation.variance)}
                    on ${new Date(data.lastReconciliation.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.
                    ${notesHtml}
                </p>`;
        }

        summaryBody.innerHTML = `
            <p style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 12px;">Covering ${periodStartFmt} → ${periodEndFmt}</p>
            <div class="form-grid">
                <div class="metric-cell"><small>E-Wallet / QR Ph (GCash, Maya &amp; bank apps)</small><strong>₱${formatAmount(data.eWalletTotal)}</strong></div>
                <div class="metric-cell"><small>Walk-in Cash Sales</small><strong>₱${formatAmount(data.walkinCashTotal)}</strong></div>
                <div class="metric-cell"><small>Opening Float</small><strong>₱${formatAmount(data.openingFloat)}</strong></div>
                <div class="metric-cell highlight-cell"><small>Expected in Drawer</small><strong>₱${formatAmount(data.expectedDrawer)}</strong></div>
            </div>
            <p style="font-size: 13px; margin-top: 12px;"><strong>Gross Total (this period):</strong> ₱${formatAmount(data.grossTotal)} &nbsp;|&nbsp; ${data.preordersCount} pre-order claims, ${data.presetsCount} presets</p>
            ${lastReconHtml}
        `;

        form.style.display = '';
    } catch (error) {
        console.error('Could not load reconciliation preview:', error);
        summaryBody.innerHTML = `<p class="loading-state-text">Could not load real sales data: ${error.message}</p>`;
    }
}

function closeReconcileModal() {
    const modal = document.getElementById('reconcileModal');
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
    document.getElementById('reconcileForm')?.reset();
}

async function handleReconcileSubmit(e) {
    e.preventDefault();
    const counted_amount = parseFloat(document.getElementById('reconcileCountedAmount')?.value);
    const notes = document.getElementById('reconcileNotes')?.value || '';

    if (isNaN(counted_amount) || counted_amount < 0) {
        alert('Enter a valid counted amount.');
        return;
    }

    try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const headers = { 'Content-Type': 'application/json' };
        if (userId) headers['x-user-id'] = userId;

        const response = await fetch('/api/finance-officer/reconciliation', {
            method: 'POST',
            headers,
            body: JSON.stringify({ counted_amount, notes })
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw new Error(data.message || 'Could not save the reconciliation.');
        }

        closeReconcileModal();
        alert(`Reconciliation saved.\nExpected: ₱${formatAmount(data.record.expected_amount)}\nCounted: ₱${formatAmount(data.record.counted_amount)}\nVariance: ₱${formatAmount(data.record.variance)}`);
        fetchRevenueData();
    } catch (error) {
        alert(error.message || 'Could not save the reconciliation.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('reconcileForm')?.addEventListener('submit', handleReconcileSubmit);
});

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