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
const TX_PAGE_SIZE = 4; // 4 orders bawat page para sakto sa taas ng left graphs

document.addEventListener('DOMContentLoaded', async () => {
    initCharts();

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

    await loadPageData();
});

// Setup Chart.js
function initCharts() {
    // 1. Mini Horizontal Bar Chart para sa Acquisition
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

    // 2. Donut Chart para sa Guest vs Member Revenue
    const revCtx = document.getElementById('revenueDonutChart');
    if (revCtx) {
        revenueDonutChartInstance = new Chart(revCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Registered', 'Guest'],
                datasets: [{
                    data: [50, 50],
                    backgroundColor: ['#F69299', '#E89E80'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '74%',
                plugins: {
                    legend: { display: false }
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

            if (userNameEl) userNameEl.textContent = data.user.fullName || 'Sales Officer';
            if (userFirstNameEl) userFirstNameEl.textContent = data.user.firstName || 'Officer';
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

        // 4. Revenue Split Donut & Insights
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
            const regPct = Math.round(Number(data.revenueSplit.registeredPercent || 0));
            const guestPct = Math.round(Number(data.revenueSplit.guestPercent || 0));

            if (regAmountEl) regAmountEl.textContent = '₱' + regRev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (regPctEl) regPctEl.textContent = `${regPct}%`;

            if (guestAmountEl) guestAmountEl.textContent = '₱' + guestRev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (guestPctEl) guestPctEl.textContent = `${guestPct}%`;

            if (revenueDonutChartInstance) {
                const total = regRev + guestRev;
                revenueDonutChartInstance.data.datasets[0].data = total === 0 ? [50, 50] : [regRev, guestRev];
                revenueDonutChartInstance.update();
            }

            if (barRegLabel) barRegLabel.textContent = `${regPct}%`;
            if (barGuestLabel) barGuestLabel.textContent = `${guestPct}%`;
            if (barRegFill) barRegFill.style.width = `${regPct}%`;
            if (barGuestFill) barGuestFill.style.width = `${guestPct}%`;

            if (insightMessage) {
                if (guestPct > regPct) {
                    insightMessage.innerHTML = `<strong>Strategic Alert:</strong> Mas mataas ang kita mula sa Guest Checkouts (<strong>${guestPct}%</strong>). Mag-alok ng 10% voucher para sa first-time sign-ups upang ma-convert sila.`;
                } else if (regPct > 0 || guestPct > 0) {
                    insightMessage.innerHTML = `<strong>Healthy Engagement:</strong> Pinangungunahan ng Registered Members ang benta (<strong>${regPct}%</strong>). Maganda ang customer loyalty retention.`;
                } else {
                    insightMessage.textContent = 'Wala pang sapat na sales record upang makagawa ng ratio insight.';
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

// Logic para sa Recent Transactions Date Filter
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
        return true; // 'all'
    });

    currentTxPage = 1;
    renderPaginatedTransactions();
}

// Render ang orders sa aktibong page kasama ang permanenteng pager bar
function renderPaginatedTransactions() {
    const ordersGrid = document.getElementById('recentOrdersGrid');
    const paginationBar = document.getElementById('txPaginationBar');
    const pageInfo = document.getElementById('txPageInfo');
    const prevBtn = document.getElementById('prevTxBtn');
    const nextBtn = document.getElementById('nextTxBtn');

    if (!ordersGrid) return;

    // Laging visible ang pagination bar
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

    // Update Text & Button States
    if (pageInfo) {
        const startNum = startIndex + 1;
        const endNum = Math.min(startIndex + TX_PAGE_SIZE, filteredOrders.length);
        pageInfo.textContent = `Showing ${startNum}-${endNum} of ${filteredOrders.length} orders`;
    }
    if (prevBtn) prevBtn.disabled = currentTxPage <= 1;
    if (nextBtn) nextBtn.disabled = currentTxPage >= totalPages;

    renderPaginationControls(totalPages, currentTxPage);

    // Render Cards
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

// Render dynamic numbered page buttons: 1, 2, 3...
function renderPaginationControls(totalPages, activePage) {
    const pagerNumbers = document.getElementById('pagerNumbers');
    if (!pagerNumbers) return;

    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        const isActive = i === activePage ? 'active' : '';
        html += `<button type="button" class="pager-num-btn ${isActive}" data-page="${i}">${i}</button>`;
    }
    pagerNumbers.innerHTML = html;

    // Attach click listener sa bawat numbered button
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

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}