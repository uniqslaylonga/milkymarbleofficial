let allCustomers = [];
let filteredCustomers = [];
let activeCustomerType = 'all'; // 'all', 'registered', 'guest'
let currentCustomerPage = 1;
const CUSTOMERS_PAGE_SIZE = 5;

// Acquisition Timeframe Storage
let acquisitionTimeframeData = {
    today: 0,
    week: 0,
    month: 0,
    last3Months: 0,
    last6Months: 0
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Timeframe filter listener for Acquisition Analytics Section
    const acqSelect = document.getElementById('acquisitionPeriodSelect');
    if (acqSelect) {
        acqSelect.addEventListener('change', updateAcquisitionAnalyticsPanel);
    }

    // 2. Directory Tab Listeners (All / Members / Guests)
    const tabBtns = document.querySelectorAll('.dir-tabs .tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabBtns.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            activeCustomerType = e.currentTarget.getAttribute('data-type') || 'all';
            applyDirectoryFilters();
        });
    });

    // 3. Search & Date Filter Listeners
    const searchInput = document.getElementById('customerSearchInput');
    const dateFilter = document.getElementById('customerDateFilter');
    const customDate = document.getElementById('customerCustomDate');

    if (searchInput) {
        searchInput.addEventListener('input', applyDirectoryFilters);
    }

    if (dateFilter) {
        dateFilter.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customDate.style.display = 'inline-block';
                if (!customDate.value) {
                    customDate.value = SalesCommon.localDate(new Date());
                }
            } else {
                customDate.style.display = 'none';
            }
            applyDirectoryFilters();
        });
    }

    if (customDate) {
        customDate.addEventListener('change', applyDirectoryFilters);
    }

    // 4. Pagination Buttons
    const prevBtn = document.getElementById('prevCustomerBtn');
    const nextBtn = document.getElementById('nextCustomerBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentCustomerPage > 1) {
                currentCustomerPage--;
                renderCustomerTable();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredCustomers.length / CUSTOMERS_PAGE_SIZE) || 1;
            if (currentCustomerPage < totalPages) {
                currentCustomerPage++;
                renderCustomerTable();
            }
        });
    }

    // 5. Modal Listeners
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalOverlay = document.getElementById('profileModalOverlay');

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    fetchCustomerRecords();
});

async function fetchCustomerRecords() {
    try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const headers = userId ? { 'x-user-id': userId } : {};
        
        const response = await fetch('/api/sales-officer/customer-records', { headers });
        if (!response.ok) throw new Error(await SalesCommon.errorMessage(response));

        const data = await response.json();

        // 1. User Header
        if (data.user) {
            const userNameEl = document.getElementById('userName');
            const userAvatarEl = document.getElementById('userAvatar');
            if (userNameEl) userNameEl.textContent = data.user.fullName || 'Sales Officer';
            if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;
        }

        // 2. Overview Counters
        if (data.metrics) {
            document.getElementById('totalRegistered').textContent = Number(data.metrics.totalRegistered || 0).toLocaleString();
            document.getElementById('totalRegisteredGrowth').textContent = data.metrics.registeredGrowth || '+0% vs last month';
            document.getElementById('todayNewAccounts').textContent = Number(data.metrics.todaySignups || 0).toLocaleString();
            document.getElementById('activeBuyersToday').textContent = Number(data.metrics.activeToday || 0).toLocaleString();
            document.getElementById('repeatRate').textContent = data.metrics.repeatRate || '0%';

            if (data.metrics.acquisition) {
                acquisitionTimeframeData = {
                    today: data.metrics.acquisition.today || 0,
                    week: data.metrics.acquisition.week || 0,
                    month: data.metrics.acquisition.month || 0,
                    last3Months: data.metrics.acquisition.last3Months || 0,
                    last6Months: data.metrics.acquisition.last6Months || 0
                };
            }
        }

        // 3. Segmentation (Guest vs Member)
        if (data.segmentation) {
            updateSegmentationDisplay(data.segmentation);
        }

        allCustomers = data.customers || [];
        updateTabBadges();
        applyDirectoryFilters();
        updateAcquisitionAnalyticsPanel();

    } catch (error) {
        console.error('Could not load live data from the server:', error);
        SalesCommon.showError(error);
        SalesCommon.failTables();
    }
}

// Segmentation Display & Pure English Strategic Recommendation
function updateSegmentationDisplay(seg) {
    const memRevPct = Math.round(Number(seg.memberRevenuePercent || 0));
    const guestRevPct = Math.round(Number(seg.guestRevenuePercent || 0));

    document.getElementById('memberCountDisplay').textContent = `${Number(seg.memberCount || 0).toLocaleString()} customers`;
    document.getElementById('guestCountDisplay').textContent = `${Number(seg.guestCount || 0).toLocaleString()} guests`;

    document.getElementById('memberRevenuePercent').textContent = `${memRevPct}% Revenue`;
    document.getElementById('guestRevenuePercent').textContent = `${guestRevPct}% Revenue`;

    document.getElementById('memberOrdersTotal').textContent = `${Number(seg.memberOrders || 0).toLocaleString()} completed orders`;
    document.getElementById('guestOrdersTotal').textContent = `${Number(seg.guestOrders || 0).toLocaleString()} guest checkouts`;

    const barMemFill = document.getElementById('barMemberFill');
    const barGuestFill = document.getElementById('barGuestFill');
    const barMemLabel = document.getElementById('barMemberLabel');
    const barGuestLabel = document.getElementById('barGuestLabel');
    const insightBox = document.getElementById('decisionInsightMessage');

    if (barMemFill) barMemFill.style.width = `${memRevPct}%`;
    if (barGuestFill) barGuestFill.style.width = `${guestRevPct}%`;
    if (barMemLabel) barMemLabel.textContent = `${memRevPct}%`;
    if (barGuestLabel) barGuestLabel.textContent = `${guestRevPct}%`;

    if (insightBox) {
        if (guestRevPct > memRevPct) {
            insightBox.innerHTML = `<strong>Strategic Alert:</strong> Guest Checkouts represent a larger revenue share (<strong>${guestRevPct}%</strong>). This indicates active purchasing volume without customer account retention. <em>Actionable Advice:</em> Launch a 10% first-registration voucher in the "Promotions" desk to convert guest traffic into loyal registered members.`;
        } else {
            insightBox.innerHTML = `<strong>Healthy Customer Loyalty:</strong> Registered Members generate the primary share of gross revenue (<strong>${memRevPct}%</strong>). High repeat purchase engagement is confirmed. Maintain current loyalty rewards to foster sustained retention.`;
        }
    }
}

function updateTabBadges() {
    const memCount = allCustomers.filter(c => c.type === 'registered').length;
    const guestCount = allCustomers.filter(c => c.type === 'guest').length;

    document.getElementById('countAllBadge').textContent = allCustomers.length;
    document.getElementById('countMemberBadge').textContent = memCount;
    document.getElementById('countGuestBadge').textContent = guestCount;
}

// Update the Dedicated Acquisition Section based on the Period Dropdown
function updateAcquisitionAnalyticsPanel() {
    const select = document.getElementById('acquisitionPeriodSelect');
    const countEl = document.getElementById('periodSignupsCount');
    const footerEl = document.getElementById('periodSignupsFooter');
    const avgEl = document.getElementById('dailyAvgAcquisition');
    const paceTextEl = document.getElementById('acquisitionPaceText');
    const paceDescEl = document.getElementById('acquisitionPaceDesc');

    const selected = select ? select.value : 'week';

    const timeframeConfig = {
        today: { days: 1, footer: "Registered today" },
        week: { days: 7, footer: "Registered past 7 days" },
        month: { days: 30, footer: "Registered current month" },
        last3Months: { days: 90, footer: "Registered past 90 days" },
        last6Months: { days: 180, footer: "Registered past 180 days" }
    };

    const config = timeframeConfig[selected] || timeframeConfig.week;
    const count = Number(acquisitionTimeframeData[selected] || 0);
    const dailyAvg = (count / config.days).toFixed(1);

    if (countEl) countEl.textContent = count.toLocaleString();
    if (footerEl) footerEl.textContent = config.footer;
    if (avgEl) avgEl.textContent = dailyAvg;

    if (paceTextEl && paceDescEl) {
        if (dailyAvg >= 1.5) {
            paceTextEl.textContent = 'Rapid Growth';
            paceTextEl.className = 'growth-stat-number status-pace-good';
            paceDescEl.textContent = 'High account sign-up velocity';
        } else if (dailyAvg >= 0.5) {
            paceTextEl.textContent = 'Steady';
            paceTextEl.className = 'growth-stat-number status-pace-good';
            paceDescEl.textContent = 'Consistent member acquisition';
        } else {
            paceTextEl.textContent = 'Moderate';
            paceTextEl.className = 'growth-stat-number';
            paceDescEl.textContent = 'Consider launching signup incentives';
        }
    }
}

// Filter Directory: Tab (All / Member / Guest) + Date + Search
function applyDirectoryFilters() {
    const query = document.getElementById('customerSearchInput')?.value.toLowerCase().trim() || '';
    const dateFilterVal = document.getElementById('customerDateFilter')?.value || 'all';
    const customDateVal = document.getElementById('customerCustomDate')?.value;

    const now = new Date();
    const todayStr = SalesCommon.localDate(now);
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    filteredCustomers = allCustomers.filter(c => {
        // Tab Filter
        if (activeCustomerType === 'registered' && c.type !== 'registered') return false;
        if (activeCustomerType === 'guest' && c.type !== 'guest') return false;

        // Search Filter
        const nameMatch = (c.full_name || '').toLowerCase().includes(query);
        const emailMatch = (c.email || '').toLowerCase().includes(query);
        const phoneMatch = (c.phone || '').toLowerCase().includes(query);
        const idMatch = String(c.id || '').includes(query);
        if (query && !nameMatch && !emailMatch && !phoneMatch && !idMatch) return false;

        // Date Filter (Based on last order or registration date)
        if (dateFilterVal !== 'all' && c.last_order_at) {
            const ordDate = new Date(c.last_order_at);
            const ordDateStr = SalesCommon.localDate(c.last_order_at);

            if (dateFilterVal === 'today' && ordDateStr !== todayStr) return false;
            if (dateFilterVal === 'week' && ordDate < weekAgo) return false;
            if (dateFilterVal === 'month' && ordDate < startOfMonth) return false;
            if (dateFilterVal === 'custom' && ordDateStr !== customDateVal) return false;
        }

        return true;
    });

    currentCustomerPage = 1;
    renderCustomerTable();
}

// Render Table Rows with Pagination
function renderCustomerTable() {
    const tbody = document.getElementById('customerTableBody');
    const pageInfo = document.getElementById('customerPageInfo');
    const prevBtn = document.getElementById('prevCustomerBtn');
    const nextBtn = document.getElementById('nextCustomerBtn');

    if (!tbody) return;

    if (filteredCustomers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-state-text">No customer records match your filter criteria.</td></tr>';
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 customers';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        renderCustomerPagerButtons(1, 1);
        return;
    }

    const totalPages = Math.ceil(filteredCustomers.length / CUSTOMERS_PAGE_SIZE) || 1;
    const startIndex = (currentCustomerPage - 1) * CUSTOMERS_PAGE_SIZE;
    const pageItems = filteredCustomers.slice(startIndex, startIndex + CUSTOMERS_PAGE_SIZE);

    if (pageInfo) {
        const startNum = startIndex + 1;
        const endNum = Math.min(startIndex + CUSTOMERS_PAGE_SIZE, filteredCustomers.length);
        pageInfo.textContent = `Showing ${startNum}-${endNum} of ${filteredCustomers.length} customers`;
    }
    if (prevBtn) prevBtn.disabled = currentCustomerPage <= 1;
    if (nextBtn) nextBtn.disabled = currentCustomerPage >= totalPages;

    renderCustomerPagerButtons(totalPages, currentCustomerPage);

    tbody.innerHTML = pageItems.map(cust => {
        const orderCount = cust.total_orders || 0;
        const totalSpent = Number(cust.total_spent || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const avatar = cust.avatar ? cust.avatar : '../images/account.png';
        const isGuest = cust.type === 'guest';
        const badgeClass = isGuest ? 'badge-guest' : 'badge-member';
        const badgeText = isGuest ? 'Guest' : 'Member';

        return `
            <tr>
                <td>
                    <div class="cust-cell">
                        <div class="cust-avatar-sm">
                            <img src="${avatar}" alt="${escapeHtml(cust.full_name)}" class="cust-avatar-img" onerror="this.onerror=null; this.src='../images/account.png';">
                        </div>
                        <div>
                            <div class="cust-name-row">
                                <span class="cust-name-text">${escapeHtml(cust.full_name)}</span>
                                <span class="client-badge ${badgeClass}">${badgeText}</span>
                            </div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="contact-text">${escapeHtml(cust.phone || 'N/A')}</div>
                    <div class="email-sub">${escapeHtml(cust.email || 'No email provided')}</div>
                </td>
                <td><strong class="order-count">${orderCount} order(s)</strong></td>
                <td><span class="spent-val">₱${totalSpent}</span></td>
                <td><span class="method-pill">${escapeHtml(cust.preferred_payment || 'GCash')}</span></td>
                <td style="text-align: center;">
                    <button type="button" class="view-profile-btn" onclick="openProfileModal('${cust.id}')">View Summary</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Numbered Page Buttons: 1, 2, 3...
function renderCustomerPagerButtons(totalPages, activePage) {
    const pagerNumbers = document.getElementById('customerPagerNumbers');
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
            if (page && page !== currentCustomerPage) {
                currentCustomerPage = page;
                renderCustomerTable();
            }
        });
    });
}

function openProfileModal(customerId) {
    const cust = allCustomers.find(c => String(c.id) === String(customerId));
    if (!cust) return;

    document.getElementById('modalAvatar').src = cust.avatar || '../images/account.png';
    document.getElementById('modalName').textContent = cust.full_name;
    document.getElementById('modalSub').textContent = `${cust.email || 'No email'} • ${cust.phone || 'No phone'}`;
    document.getElementById('modalCallBtn').href = cust.phone ? `tel:${cust.phone}` : '#';
    document.getElementById('modalSmsBtn').href = cust.phone ? `sms:${cust.phone}` : '#';
    document.getElementById('modalAddress').textContent = cust.address || 'Counter Pick-Up / No default delivery address.';
    
    const paymentBox = document.getElementById('modalPaymentBox');
    paymentBox.innerHTML = `<span class="method-pill">${escapeHtml(cust.preferred_payment || 'GCash')}</span>`;

    const historyList = document.getElementById('modalHistoryList');
    if (cust.recent_orders && cust.recent_orders.length > 0) {
        historyList.innerHTML = cust.recent_orders.map(ord => {
            const dateFormatted = new Date(ord.placed_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
            const amount = Number(ord.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return `
                <div class="history-item">
                    <div>
                        <div class="history-id">${escapeHtml(ord.order_number)}</div>
                        <div class="history-date">${dateFormatted} • ${ord.item_count || 1} item(s)</div>
                    </div>
                    <div class="history-price">₱${amount}</div>
                </div>
            `;
        }).join('');
    } else {
        historyList.innerHTML = '<div class="history-item"><div>No past orders recorded.</div></div>';
    }

    const modal = document.getElementById('profileModalOverlay');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('profileModalOverlay');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
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