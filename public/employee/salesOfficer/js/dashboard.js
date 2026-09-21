let customerAcquisitionData = {
    today: 0,
    week: 0,
    month: 0,
    last3Months: 0,
    last6Months: 0
};

let acquisitionChartInstance = null;
let revenueDonutChartInstance = null;

// Pagination & Transactions State
let allFetchedOrders = [];
let filteredOrders = [];
let currentTxPage = 1;
const TX_PAGE_SIZE = 4;

// Register Lock & Z-Reading State
let isRegisterLocked = localStorage.getItem('isRegisterLocked') === 'true';
let expectedCounterCash = 0; // Real value is fetched from /api/sales-officer/x-reading - see openXReadingModal/refreshExpectedCounterCash.
let latestXReading = null;

document.addEventListener('DOMContentLoaded', async () => {
    initCharts();
    checkRegisterLockState();

    // Customer Acquisition Filter listener
    const acqFilter = document.getElementById('acquisitionFilter');
    if (acqFilter) {
        acqFilter.addEventListener('change', updateAcquisitionDisplay);
    }

    // Recent Transactions date filter listeners
    const txDateFilter = document.getElementById('txDateFilter');
    const txCustomDate = document.getElementById('txCustomDate');
    const prevBtn = document.getElementById('prevTxBtn');
    const nextBtn = document.getElementById('nextTxBtn');

    if (txDateFilter) {
        txDateFilter.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                txCustomDate.style.display = 'inline-block';
                if (!txCustomDate.value) {
                    txCustomDate.value = SalesCommon.localDate(new Date());
                }
            } else {
                txCustomDate.style.display = 'none';
            }
            applyTransactionFilters();
        });
    }

    if (txCustomDate) {
        txCustomDate.addEventListener('change', applyTransactionFilters);
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentTxPage > 1) {
                currentTxPage--;
                renderPaginatedTransactions();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredOrders.length / TX_PAGE_SIZE) || 1;
            if (currentTxPage < totalPages) {
                currentTxPage++;
                renderPaginatedTransactions();
            }
        });
    }

    // Blind cash input calculation listener
    const cashInput = document.getElementById('zActualCashInput');
    if (cashInput) {
        cashInput.addEventListener('input', calculateZVariance);
    }

    // Listener for custom confirmation modal execution button
    const btnExecute = document.getElementById('btnExecuteLockAndTransmit');
    if (btnExecute) {
        btnExecute.addEventListener('click', executeLockdown);
    }

    await loadPageData();
});

// Setup Chart.js
function initCharts() {
    // 1. Mini Horizontal Bar Chart for Acquisition
    const acqCtx = document.getElementById('acquisitionMiniChart');
    if (acqCtx) {
        acquisitionChartInstance = new Chart(acqCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Today', 'Week', 'Month', '90 Days', '180 Days'],
                datasets: [{
                    label: 'New Users',
                    data: [0, 0, 0, 0, 0],
                    backgroundColor: '#F69299',
                    borderRadius: 4,
                    barThickness: 16
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10, family: 'Urbanist' }, color: '#7C4F38' }
                    },
                    y: {
                        display: false,
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // 2. Donut Chart for Guest vs Member Revenue
    const revCtx = document.getElementById('revenueDonutChart');
    if (revCtx) {
        revenueDonutChartInstance = new Chart(revCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['No revenue yet'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['#E8E0DC'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '74%',
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            }
        });
    }
}

async function loadPageData() {
    try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const headers = {};
        if (userId) {
            headers['x-user-id'] = userId;
        }

        const response = await fetch('/api/sales-officer/dashboard', { headers });
        if (!response.ok) throw new Error(await SalesCommon.errorMessage(response));

        const data = await response.json();

        // 1. User Header
        const userNameEl = document.getElementById('userName');
        const userFirstNameEl = document.getElementById('userFirstName');

        if (data.user && data.user.fullName) {
            if (userNameEl) userNameEl.textContent = data.user.fullName;
            if (userFirstNameEl) userFirstNameEl.textContent = data.user.firstName || data.user.fullName;
        } else {
            if (userNameEl) userNameEl.textContent = 'Employee';
            if (userFirstNameEl) userFirstNameEl.textContent = 'Employee';
        }

        // 2. Today's Performance
        const todayOrdersEl = document.getElementById('todayOrders');
        const todaySalesEl = document.getElementById('todaySales');
        const pendingOrdersEl = document.getElementById('pendingOrders');

        if (todayOrdersEl && data.metrics) {
            todayOrdersEl.textContent = Number(data.metrics.todayOrders || 0).toLocaleString();
        }
        if (todaySalesEl && data.metrics) {
            todaySalesEl.textContent = '₱' + Number(data.metrics.todaySales || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
        if (pendingOrdersEl && data.metrics) {
            pendingOrdersEl.textContent = Number(data.metrics.pendingOrders || 0).toLocaleString();
        }

        // 3. Customer Acquisition
        if (data.newAccounts) {
            customerAcquisitionData = {
                today: data.newAccounts.today || 0,
                week: data.newAccounts.week || 0,
                month: data.newAccounts.month || 0,
                last3Months: data.newAccounts.last3Months || 0,
                last6Months: data.newAccounts.last6Months || 0
            };

            if (acquisitionChartInstance) {
                acquisitionChartInstance.data.datasets[0].data = [
                    customerAcquisitionData.today,
                    customerAcquisitionData.week,
                    customerAcquisitionData.month,
                    customerAcquisitionData.last3Months,
                    customerAcquisitionData.last6Months
                ];
                acquisitionChartInstance.update();
            }

            updateAcquisitionDisplay();
        }

        // Sync the register lock state from the server (system_settings,
        // set by /sales-officer/z-reading and released by Finance Officer's
        // reconciliation save) instead of trusting only the local flag,
        // which previously never got reset once a shift closed.
        syncRegisterLockState(data.registerStatus);

        // 4. Revenue Split Donut & Strategic Insights
        if (data.revenueSplit) {
            const regAmountEl = document.getElementById('registeredRevenue');
            const regPctEl = document.getElementById('registeredPercent');
            const guestAmountEl = document.getElementById('guestRevenue');
            const guestPctEl = document.getElementById('guestPercent');

            const barRegLabel = document.getElementById('barRegLabel');
            const barGuestLabel = document.getElementById('barGuestLabel');
            const barRegFill = document.getElementById('barRegFill');
            const barGuestFill = document.getElementById('barGuestFill');
            const insightMessage = document.getElementById('insightMessage');

            const regRev = Number(data.revenueSplit.registeredRevenue || 0);
            const guestRev = Number(data.revenueSplit.guestRevenue || 0);
            const split = SalesCommon.splitPercents(regRev, guestRev);
            const regPct = split.a;
            const guestPct = split.b;

            if (regAmountEl) regAmountEl.textContent = '₱' + regRev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (regPctEl) regPctEl.textContent = split.aText;

            if (guestAmountEl) guestAmountEl.textContent = '₱' + guestRev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (guestPctEl) guestPctEl.textContent = split.bText;

            if (revenueDonutChartInstance) {
                const total = regRev + guestRev;
                const chart = revenueDonutChartInstance;
                if (total === 0) {
                    chart.data.labels = ['No revenue yet'];
                    chart.data.datasets[0].data = [1];
                    chart.data.datasets[0].backgroundColor = ['#E8E0DC'];
                    chart.options.plugins.tooltip.enabled = false;
                } else {
                    chart.data.labels = ['Registered', 'Guest'];
                    chart.data.datasets[0].data = [regRev, guestRev];
                    chart.data.datasets[0].backgroundColor = ['#F69299', '#E89E80'];
                    chart.options.plugins.tooltip.enabled = true;
                }
                chart.update();
            }

            if (barRegLabel) barRegLabel.textContent = split.aText;
            if (barGuestLabel) barGuestLabel.textContent = split.bText;
            if (barRegFill) barRegFill.style.width = `${regPct}%`;
            if (barGuestFill) barGuestFill.style.width = `${guestPct}%`;

            if (insightMessage) {
                if (guestPct > regPct) {
                    insightMessage.innerHTML = `<strong>Strategic Alert:</strong> Higher revenue generated from Guest Checkouts (<strong>${split.bText}</strong>). Consider offering promotional loyalty vouchers to accelerate member registration.`;
                } else if (regPct > 0 || guestPct > 0) {
                    insightMessage.innerHTML = `<strong>Healthy Engagement:</strong> Registered Members lead overall sales (<strong>${split.aText}</strong>). Strong brand loyalty and customer retention.`;
                } else {
                    insightMessage.textContent = 'Insufficient sales records to generate customer channel insights.';
                }
            }
        }

        // 5. Store Orders and Apply Filter & Pager
        allFetchedOrders = data.recentOrders || [];
        applyTransactionFilters();

    } catch (error) {
        console.error('Could not load live data from the server:', error);
        SalesCommon.showError(error);
        SalesCommon.failTables();
    }
}

// Logic for Recent Transactions Date Filter
function applyTransactionFilters() {
    const filterType = document.getElementById('txDateFilter')?.value || 'today';
    const customDateVal = document.getElementById('txCustomDate')?.value;

    const now = new Date();
    const todayStr = SalesCommon.localDate(now);

    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    filteredOrders = allFetchedOrders.filter(ord => {
        if (!ord.placed_at) return false;
        const ordDate = new Date(ord.placed_at);
        const ordDateStr = SalesCommon.localDate(ord.placed_at);

        if (filterType === 'today') {
            return ordDateStr === todayStr;
        } else if (filterType === 'week') {
            return ordDate >= weekAgo;
        } else if (filterType === 'month') {
            return ordDate >= startOfMonth;
        } else if (filterType === 'custom') {
            return ordDateStr === customDateVal;
        }
        return true;
    });

    currentTxPage = 1;
    renderPaginatedTransactions();
}

// Render orders on active page with permanent numbered pagination bar
function renderPaginatedTransactions() {
    const ordersGrid = document.getElementById('recentOrdersGrid');
    const paginationBar = document.getElementById('txPaginationBar');
    const pageInfo = document.getElementById('txPageInfo');
    const prevBtn = document.getElementById('prevTxBtn');
    const nextBtn = document.getElementById('nextTxBtn');

    if (!ordersGrid) return;

    if (paginationBar) paginationBar.style.display = 'flex';

    if (filteredOrders.length === 0) {
        ordersGrid.innerHTML = '<p class="loading-state-text">No transactions found for the selected period.</p>';
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 orders';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        renderPaginationControls(1, 1);
        return;
    }

    const totalPages = Math.ceil(filteredOrders.length / TX_PAGE_SIZE) || 1;
    const startIndex = (currentTxPage - 1) * TX_PAGE_SIZE;
    const pageItems = filteredOrders.slice(startIndex, startIndex + TX_PAGE_SIZE);

    if (pageInfo) {
        const startNum = startIndex + 1;
        const endNum = Math.min(startIndex + TX_PAGE_SIZE, filteredOrders.length);
        pageInfo.textContent = `Showing ${startNum}-${endNum} of ${filteredOrders.length} orders`;
    }
    if (prevBtn) prevBtn.disabled = currentTxPage <= 1;
    if (nextBtn) nextBtn.disabled = currentTxPage >= totalPages;

    renderPaginationControls(totalPages, currentTxPage);

    ordersGrid.innerHTML = pageItems.map(ord => {
        const dateFormatted = new Date(ord.placed_at).toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        const amount = Number(ord.total_amount || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        const isGuest = !ord.customer_id;
        const badgeClass = isGuest ? 'badge-guest' : 'badge-member';
        const badgeText = isGuest ? 'Guest' : 'Member';
        const displayName = escapeHtml(ord.customer_name || ord.guest_name || 'Anonymous Customer');

        return `
            <div class="order-row-item">
                <div class="row-item-main">
                    <div class="name-badge-group">
                        <span class="customer-name-bold">${displayName}</span>
                        <span class="client-badge ${badgeClass}">${badgeText}</span>
                    </div>
                    <div class="order-amount-display">₱${amount}</div>
                </div>
                <div class="row-item-footer">
                    <span class="order-meta-info">${escapeHtml(ord.order_number || '')} • ${dateFormatted}</span>
                    <span>Status: <strong>${escapeHtml(ord.status || 'PENDING')}</strong></span>
                </div>
            </div>
        `;
    }).join('');
}

// --------------------------------------------------------------------------
// SMART SLIDING PAGINATION WITH ELLIPSIS (...)
// --------------------------------------------------------------------------
function renderPaginationControls(totalPages, activePage) {
    const pagerNumbers = document.getElementById('pagerNumbers');
    if (!pagerNumbers) return;

    if (totalPages <= 1) {
        pagerNumbers.innerHTML = `<button type="button" class="pager-num-btn active" data-page="1">1</button>`;
        return;
    }

    const pages = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        if (activePage <= 4) {
            pages.push(1, 2, 3, 4, 5, '...', totalPages);
        } else if (activePage >= totalPages - 3) {
            pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
        } else {
            pages.push(1, '...', activePage - 1, activePage, activePage + 1, '...', totalPages);
        }
    }

    let html = '';
    pages.forEach(p => {
        if (p === '...') {
            html += `<span class="pager-ellipsis">&hellip;</span>`;
        } else {
            const isActive = p === activePage ? 'active' : '';
            html += `<button type="button" class="pager-num-btn ${isActive}" data-page="${p}">${p}</button>`;
        }
    });
    pagerNumbers.innerHTML = html;

    pagerNumbers.querySelectorAll('.pager-num-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const page = parseInt(e.currentTarget.getAttribute('data-page'), 10);
            if (page && page !== currentTxPage) {
                currentTxPage = page;
                renderPaginatedTransactions();
            }
        });
    });
}

function updateAcquisitionDisplay() {
    const filterEl = document.getElementById('acquisitionFilter');
    const valueEl = document.getElementById('filteredNewAccounts');
    const footerEl = document.getElementById('acquisitionPeriodFooter');

    const selected = filterEl ? filterEl.value : 'today';

    const timeframeConfig = {
        today: { footer: "Registered today" },
        week: { footer: "Past 7 days" },
        month: { footer: "Current calendar month" },
        last3Months: { footer: "Past 90 days" },
        last6Months: { footer: "Past 180 days" }
    };

    const config = timeframeConfig[selected] || timeframeConfig.today;

    if (valueEl) {
        valueEl.textContent = Number(customerAcquisitionData[selected] || 0).toLocaleString();
    }
    if (footerEl) {
        footerEl.textContent = config.footer;
    }
}

// ==========================================================================
// REGISTER LOCK & AUDIT CONTROLS
// ==========================================================================
function checkRegisterLockState() {
    const banner = document.getElementById('registerStatusBanner');
    const bannerText = document.getElementById('registerStatusText');
    const zBtn = document.getElementById('btnEndShiftTrigger');

    if (isRegisterLocked) {
        if (banner) {
            banner.className = 'topbar-status-strip locked';
            bannerText.innerHTML = '<span class="status-pulse-dot"></span><strong>Shift Closed &amp; Register Locked</strong> — Transmitted to Finance';
        }
        if (zBtn) {
            zBtn.disabled = true;
            zBtn.innerHTML = `
              <svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Shift Closed (Locked)</span>
            `;
            zBtn.style.opacity = '0.6';
            zBtn.style.cursor = 'not-allowed';
        }
    } else {
        resetRegisterLockUI();
    }
}

// Restores the banner/button to their normal "register open" state.
// Needed once a lock can actually be released again (Finance Officer
// reconciling clears system_settings.register_status server-side) -
// previously there was nothing to reset the UI back to after a lock.
function resetRegisterLockUI() {
    const banner = document.getElementById('registerStatusBanner');
    const bannerText = document.getElementById('registerStatusText');
    const zBtn = document.getElementById('btnEndShiftTrigger');

    if (banner) banner.className = 'topbar-status-strip open';
    if (bannerText) {
        bannerText.innerHTML = '<span class="status-pulse-dot"></span>Register Open • Tuesday &amp; Thursday Release Window (10:00 AM – 3:00 PM)';
    }
    if (zBtn) {
        zBtn.disabled = false;
        zBtn.innerHTML = `
          <svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>End Shift &amp; Z-Reading</span>
        `;
        zBtn.style.opacity = '';
        zBtn.style.cursor = '';
    }
}

// Reconciles the local "isRegisterLocked" flag against the server's real
// system_settings.register_status on every dashboard load, instead of
// trusting whatever localStorage happened to be left at. This is what
// actually lets a shift re-open after Finance Officer reconciles - before,
// nothing ever cleared the flag once executeLockdown() set it.
function syncRegisterLockState(serverStatus) {
    const shouldBeLocked = serverStatus === 'LOCKED';
    if (shouldBeLocked === isRegisterLocked) {
        checkRegisterLockState();
        return;
    }
    isRegisterLocked = shouldBeLocked;
    localStorage.setItem('isRegisterLocked', shouldBeLocked ? 'true' : 'false');
    if (!shouldBeLocked) {
        localStorage.removeItem('latestZReport');
    }
    checkRegisterLockState();
}

// --------------------------------------------------------------------------
// X-READING INTERIM SNAPSHOT MODAL LOGIC
// --------------------------------------------------------------------------
async function openXReadingModal() {
    const modal = document.getElementById('xReadingModal');
    if (!modal) return;

    const dateSub = document.getElementById('xModalSubDate');
    if (dateSub) {
        dateSub.textContent = `Interim Snapshot: ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Show a loading state while we fetch the real numbers, rather than
    // flashing fabricated ones first.
    ['xPreOrdersCount', 'xEwalletAmount', 'xPresetsCount', 'xWalkinCash', 'xExpectedDrawer', 'xGrossTotal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = 'Loading…';
    });

    try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const headers = {};
        if (userId) headers['x-user-id'] = userId;

        const response = await fetch('/api/sales-officer/x-reading', { headers });
        if (!response.ok) throw new Error(await SalesCommon.errorMessage(response));

        const data = await response.json();

        // Cache the real expected-drawer figure so Z-Reading compares
        // against the same number this X-Reading just showed, instead of
        // a stale hardcoded constant.
        expectedCounterCash = data.expectedDrawer;
        latestXReading = data;

        document.getElementById('xPreOrdersCount').textContent = `${data.preordersCount} Claims`;
        document.getElementById('xEwalletAmount').textContent = '₱' + data.eWalletTotal.toFixed(2);

        document.getElementById('xPresetsCount').textContent = `${data.presetsCount} Presets Sold`;
        document.getElementById('xWalkinCash').textContent = '₱' + data.walkinCashTotal.toFixed(2);
        document.getElementById('xExpectedDrawer').textContent = '₱' + data.expectedDrawer.toFixed(2);
        document.getElementById('xGrossTotal').textContent = '₱' + data.grossTotal.toFixed(2);
    } catch (error) {
        console.error('Could not load X-Reading data:', error);
        ['xPreOrdersCount', 'xEwalletAmount', 'xPresetsCount', 'xWalkinCash', 'xExpectedDrawer', 'xGrossTotal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '—';
        });
        showCustomAlert('Could Not Load X-Reading', 'Real sales data could not be fetched from the server. Please try again.', 'warning');
    }
}

function closeXReadingModal() {
    const modal = document.getElementById('xReadingModal');
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
}

// --------------------------------------------------------------------------
// Z-READING MODAL & REGISTER LOCK LOGIC
// --------------------------------------------------------------------------
async function openZReadingModal() {
    if (isRegisterLocked) {
        showCustomAlert("Shift Already Closed", "This operational shift has already been concluded with a final Z-Reading.", "warning");
        return;
    }

    const modal = document.getElementById('zReadingModal');
    if (!modal) return;

    const dateSub = document.getElementById('zModalSubDate');
    if (dateSub) {
        dateSub.textContent = `Official Shift Cut-Off: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: '2-digit', year: 'numeric' })} at 03:00 PM`;
    }

    const cashInput = document.getElementById('zActualCashInput');
    if (cashInput) cashInput.value = '';

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Show a loading state while we fetch the real numbers, rather than
    // flashing whatever static placeholder is baked into the HTML.
    const zFieldIds = ['zPreOrdersCount', 'zClaimedAmount', 'zEwalletAmount', 'zUnclaimedAmount', 'zPresetsCount', 'zExpectedCash'];
    zFieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = 'Loading…';
    });

    // Always fetch the current expected-drawer figure fresh - don't rely on
    // whatever X-Reading was last opened, since more sales may have come in
    // since then (or it may never have been opened this session at all).
    try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const headers = {};
        if (userId) headers['x-user-id'] = userId;

        const response = await fetch('/api/sales-officer/x-reading', { headers });
        if (!response.ok) throw new Error(await SalesCommon.errorMessage(response));
        const data = await response.json();
        expectedCounterCash = data.expectedDrawer;
        latestXReading = data;

        document.getElementById('zPreOrdersCount').textContent = `${data.preordersCount} Orders`;
        document.getElementById('zClaimedAmount').textContent = '₱' + data.claimedAmount.toFixed(2);
        document.getElementById('zEwalletAmount').textContent = '₱' + data.eWalletTotal.toFixed(2);
        document.getElementById('zUnclaimedAmount').textContent = '₱' + data.unclaimedAmount.toFixed(2);
        document.getElementById('zPresetsCount').textContent = `${data.cupsSold} Cups Sold`;
        document.getElementById('zExpectedCash').textContent = '₱' + data.expectedDrawer.toFixed(2);
    } catch (error) {
        console.error('Could not refresh expected drawer amount:', error);
        zFieldIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '—';
        });
        showCustomAlert('Could Not Load Live Totals', 'Real sales data could not be fetched, so the figures shown may be out of date. Please try again before closing the shift.', 'warning');
    }

    calculateZVariance();
}

function closeZReadingModal() {
    const modal = document.getElementById('zReadingModal');
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
}

function calculateZVariance() {
    const actualInput = parseFloat(document.getElementById('zActualCashInput')?.value || 0);
    const variance = actualInput - expectedCounterCash;

    const varNumEl = document.getElementById('zVarianceValue');
    const varPillEl = document.getElementById('zVarianceStatus');

    if (!varNumEl || !varPillEl) return;

    if (isNaN(actualInput) || actualInput === 0) {
        varNumEl.textContent = '₱0.00';
        varNumEl.style.color = '#8C6D6D';
        varPillEl.className = 'var-status-pill neutral';
        varPillEl.textContent = 'Awaiting Count';
        return;
    }

    const varFormatted = '₱' + Math.abs(variance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (variance === 0) {
        varNumEl.textContent = '₱0.00';
        varNumEl.style.color = '#2E7D32';
        varPillEl.className = 'var-status-pill exact';
        varPillEl.textContent = 'Exact Balanced';
    } else if (variance < 0) {
        varNumEl.textContent = `-${varFormatted}`;
        varNumEl.style.color = '#C9302C';
        varPillEl.className = 'var-status-pill short';
        varPillEl.textContent = 'Shortage';
    } else {
        varNumEl.textContent = `+${varFormatted}`;
        varNumEl.style.color = '#B26A00';
        varPillEl.className = 'var-status-pill over';
        varPillEl.textContent = 'Overage';
    }
}

// --------------------------------------------------------------------------
// CUSTOM DIALOG & CONFIRMATION HANDLERS (REPLACING NATIVE ALERTS)
// --------------------------------------------------------------------------
function showCustomAlert(title, message, type = "notice") {
    const modal = document.getElementById('customAlertModal');
    if (!modal) return;

    document.getElementById('alertModalTitle').textContent = title;
    document.getElementById('alertModalMessage').textContent = message;

    const iconWrap = document.getElementById('alertDialogIconWrap');
    if (iconWrap) {
        iconWrap.className = 'dialog-icon-circle ' + (type === 'warning' ? 'warning' : (type === 'success' ? 'success' : ''));
    }

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeCustomAlert() {
    const modal = document.getElementById('customAlertModal');
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
}

function promptZReadingConfirmation() {
    const actualCash = parseFloat(document.getElementById('zActualCashInput')?.value);
    if (isNaN(actualCash) || actualCash < 0) {
        showCustomAlert("Incomplete Cash Count", "Please enter the actual physical cash counted in the drawer before locking.", "warning");
        return;
    }

    const variance = actualCash - expectedCounterCash;

    document.getElementById('confirmExpectedCash').textContent = '₱' + expectedCounterCash.toFixed(2);
    document.getElementById('confirmActualCash').textContent = '₱' + actualCash.toFixed(2);
    document.getElementById('confirmVariance').textContent = `${variance >= 0 ? '+' : ''}₱${variance.toFixed(2)}`;

    const confirmModal = document.getElementById('customConfirmModal');
    if (confirmModal) {
        confirmModal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closeCustomConfirm() {
    const confirmModal = document.getElementById('customConfirmModal');
    if (confirmModal) {
        confirmModal.classList.remove('open');
        document.body.style.overflow = '';
    }
}

async function executeLockdown() {
    closeCustomConfirm();

    const actualCash = parseFloat(document.getElementById('zActualCashInput')?.value) || 0;
    const variance = actualCash - expectedCounterCash;

    const lockBtn = document.getElementById('zConfirmLockBtn');
    if (lockBtn) lockBtn.disabled = true;

    try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const headers = { 'Content-Type': 'application/json' };
        if (userId) headers['x-user-id'] = userId;

        const payload = {
            actual_cash: actualCash,
            expected_cash: expectedCounterCash,
            variance: variance,
            notes: `Z-Reading | E-Wallet/QR Ph: ₱${(latestXReading?.eWalletTotal ?? 0).toFixed(2)} | Walk-in Cash: ₱${(latestXReading?.walkinCashTotal ?? 0).toFixed(2)}`
        };

        const response = await fetch('/api/sales-officer/z-reading', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw new Error(data.message || 'The server rejected the Z-Reading.');
        }

        // Only mark the register locked once the save to the database is
        // actually confirmed - not before, and not if it fails.
        localStorage.setItem('latestZReport', JSON.stringify(data.record));
        localStorage.setItem('isRegisterLocked', 'true');
        isRegisterLocked = true;

        closeZReadingModal();
        checkRegisterLockState();

        showCustomAlert(
            "Z-READING TRANSMITTED!",
            "The sales counter has been locked for this shift. The finalized collection summary has been saved and is visible to the Financial Officer for collection reconciliation.",
            "success"
        );
    } catch (error) {
        console.error('Z-Reading save failed:', error);
        showCustomAlert(
            "Z-Reading Not Saved",
            `The shift could not be closed because the save failed: ${error.message}. The register remains unlocked - please try again.`,
            "warning"
        );
    } finally {
        if (lockBtn) lockBtn.disabled = false;
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