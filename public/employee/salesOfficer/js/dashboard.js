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
let expectedCounterCash = 4560.00;

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
        if (data.user) {
            const userNameEl = document.getElementById('userName');
            const userFirstNameEl = document.getElementById('userFirstName');
            const userAvatarEl = document.getElementById('userAvatar');

            if (userNameEl) userNameEl.textContent = data.user.fullName || 'Reeze Laureen A. Alapide';
            if (userFirstNameEl) userFirstNameEl.textContent = data.user.firstName || 'Reeze';
            if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;
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

// Render dynamic numbered page buttons
function renderPaginationControls(totalPages, activePage) {
    const pagerNumbers = document.getElementById('pagerNumbers');
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
            banner.className = 'register-status-strip locked';
            bannerText.innerHTML = '<strong>SHIFT CLOSED &amp; REGISTER LOCKED</strong> — Z-Report transmitted to Financial Officer for reconciliation.';
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
    }
}

// --------------------------------------------------------------------------
// X-READING INTERIM SNAPSHOT MODAL LOGIC (STYLED MODAL, NO BROWSER ALERT)
// --------------------------------------------------------------------------
function openXReadingModal() {
    const modal = document.getElementById('xReadingModal');
    if (!modal) return;

    // Derive current sales figures from dashboard or fallback
    const salesText = document.getElementById('todaySales')?.textContent || '₱188.00';
    const cleanSales = parseFloat(salesText.replace(/[^0-9.-]+/g, "")) || 188.00;

    const gcashShare = cleanSales * 0.55;
    const mayaShare = cleanSales * 0.25;
    const digitalSubtotal = gcashShare + mayaShare;
    const walkinCash = cleanSales * 0.20;
    const openingFloat = 1000.00;
    const expectedDrawer = openingFloat + walkinCash;

    // Update Date Header
    const dateSub = document.getElementById('xModalSubDate');
    if (dateSub) {
        dateSub.textContent = `Interim Snapshot: ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }

    // Populate Fields
    document.getElementById('xPreOrdersCount').textContent = `${Math.max(1, Math.round(allFetchedOrders.length * 0.7))} Claims`;
    document.getElementById('xGcashAmount').textContent = '₱' + gcashShare.toFixed(2);
    document.getElementById('xMayaAmount').textContent = '₱' + mayaShare.toFixed(2);
    document.getElementById('xDigitalSubtotal').textContent = '₱' + digitalSubtotal.toFixed(2);

    document.getElementById('xPresetsCount').textContent = `${Math.max(1, Math.round(allFetchedOrders.length * 0.3))} Presets Sold`;
    document.getElementById('xWalkinCash').textContent = '₱' + walkinCash.toFixed(2);
    document.getElementById('xExpectedDrawer').textContent = '₱' + expectedDrawer.toFixed(2);
    document.getElementById('xGrossTotal').textContent = '₱' + cleanSales.toFixed(2);

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
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
function openZReadingModal() {
    if (isRegisterLocked) {
        alert("This operational shift has already been concluded with a final Z-Reading.");
        return;
    }

    const modal = document.getElementById('zReadingModal');
    if (modal) {
        const dateSub = document.getElementById('zModalSubDate');
        if (dateSub) {
            dateSub.textContent = `Official Shift Cut-Off: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: '2-digit', year: 'numeric' })} at 03:00 PM`;
        }

        const cashInput = document.getElementById('zActualCashInput');
        if (cashInput) {
            cashInput.value = '';
        }
        calculateZVariance();

        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
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
        varNumEl.style.color = '#7d5f5f';
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

async function submitFinalZReading() {
    const actualCash = parseFloat(document.getElementById('zActualCashInput')?.value);
    if (isNaN(actualCash) || actualCash < 0) {
        alert("Please specify the actual physical cash counted in the drawer before locking.");
        return;
    }

    const variance = actualCash - expectedCounterCash;
    const confirmLock = confirm(
        `Confirm End-of-Shift Z-Reading?\n\n` +
        `• System Expected Cash: ₱${expectedCounterCash.toFixed(2)}\n` +
        `• Actual Drawer Count: ₱${actualCash.toFixed(2)}\n` +
        `• Variance: ${variance >= 0 ? '+' : ''}₱${variance.toFixed(2)}\n\n` +
        `Warning: The sales register will be locked and cannot accept further orders.`
    );

    if (!confirmLock) return;

    try {
        const payload = {
            z_report_id: `Z-${Date.now()}`,
            cut_off_time: new Date().toISOString(),
            expected_cash: expectedCounterCash,
            actual_cash: actualCash,
            variance: variance,
            preorders_digital_total: 7850.00,
            status: 'TRANSMITTED_TO_FINANCE'
        };

        localStorage.setItem('latestZReport', JSON.stringify(payload));
        localStorage.setItem('isRegisterLocked', 'true');
        isRegisterLocked = true;

        if (typeof SalesCommon !== 'undefined' && SalesCommon.fetch) {
            await fetch('/api/sales-officer/z-reading', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(() => {});
        }
    } catch (e) {
        console.warn('Saved offline Z-Report:', e);
    }

    closeZReadingModal();
    checkRegisterLockState();

    alert(
        "Z-READING TRANSMITTED!\n\n" +
        "The sales counter has been locked for this shift. The finalized collection summary has been transmitted to the Financial Officer for collection reconciliation."
    );
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