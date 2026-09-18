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
    // 1. Timeframe filter listener for New Sign-ups
    const acqSelect = document.getElementById('acquisitionPeriodSelect');
    if (acqSelect) {
        acqSelect.addEventListener('change', updateAcquisitionCardDisplay);
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
                    customDate.value = new Date().toISOString().split('T')[0];
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
        if (!response.ok) throw new Error('Failed to fetch customer records');

        const data = await response.json();

        // 1. User Header
        if (data.user) {
            const userNameEl = document.getElementById('userName');
            const userAvatarEl = document.getElementById('userAvatar');
            if (userNameEl) userNameEl.textContent = data.user.fullName || 'Sales Officer';
            if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;
        }

        // 2. Metrics & Counters
        if (data.metrics) {
            document.getElementById('totalRegistered').textContent = Number(data.metrics.totalRegistered || 0).toLocaleString();
            document.getElementById('totalRegisteredGrowth').textContent = data.metrics.registeredGrowth || '+0% vs last month';
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
        updateAcquisitionCardDisplay();

    } catch (error) {
        console.warn('Backend unavailable, loading comprehensive demo customer data:', error);

        // Fallback demo data para magamit agad kahit offline
        allCustomers = [
            {
                id: 1,
                type: 'registered',
                full_name: 'Maria Elena Santos',
                email: 'maria.santos@gmail.com',
                phone: '+63 917 123 4567',
                total_orders: 8,
                total_spent: 1240.00,
                preferred_payment: 'GCash',
                address: '123 Sampaguita St, North Caloocan',
                last_order_at: new Date().toISOString(),
                recent_orders: [
                    { order_number: 'MM-2026-091', placed_at: new Date().toISOString(), total_amount: 160.00, item_count: 1 },
                    { order_number: 'MM-2026-074', placed_at: '2026-09-12T14:20:00Z', total_amount: 310.00, item_count: 2 }
                ]
            },
            {
                id: 2,
                type: 'guest',
                full_name: 'Angelo Reyes (Guest)',
                email: 'angeloreyes@yahoo.com',
                phone: '+63 928 987 6543',
                total_orders: 1,
                total_spent: 145.00,
                preferred_payment: 'Cash on Pick-Up',
                address: 'Counter Pick-Up',
                last_order_at: new Date().toISOString(),
                recent_orders: [
                    { order_number: 'MM-2026-090', placed_at: new Date().toISOString(), total_amount: 145.00, item_count: 1 }
                ]
            },
            {
                id: 3,
                type: 'registered',
                full_name: 'Juan Carlos Dela Cruz',
                email: 'jdelacruz@gmail.com',
                phone: '+63 995 444 8821',
                total_orders: 14,
                total_spent: 2450.00,
                preferred_payment: 'GCash',
                address: 'Block 5 Lot 12, Phase 2, Bagong Silang',
                last_order_at: '2026-09-18T18:30:00Z',
                recent_orders: [
                    { order_number: 'MM-2026-085', placed_at: '2026-09-18T18:30:00Z', total_amount: 280.00, item_count: 2 }
                ]
            },
            {
                id: 4,
                type: 'guest',
                full_name: 'Patricia Gomez (Guest)',
                email: 'patricia.g@gmail.com',
                phone: '+63 908 333 1122',
                total_orders: 2,
                total_spent: 290.00,
                preferred_payment: 'GCash',
                address: 'Counter Pick-Up',
                last_order_at: '2026-09-17T15:10:00Z',
                recent_orders: [
                    { order_number: 'MM-2026-079', placed_at: '2026-09-17T15:10:00Z', total_amount: 145.00, item_count: 1 }
                ]
            },
            {
                id: 5,
                type: 'registered',
                full_name: 'Kristine May Alcantara',
                email: 'km.alcantara@gmail.com',
                phone: '+63 919 555 7766',
                total_orders: 5,
                total_spent: 780.00,
                preferred_payment: 'Maya',
                address: 'Camarin, North Caloocan',
                last_order_at: '2026-09-16T12:00:00Z',
                recent_orders: [
                    { order_number: 'MM-2026-068', placed_at: '2026-09-16T12:00:00Z', total_amount: 155.00, item_count: 1 }
                ]
            },
            {
                id: 6,
                type: 'registered',
                full_name: 'Daniel Joshua Mendoza',
                email: 'djmendoza@outlook.com',
                phone: '+63 927 888 9900',
                total_orders: 3,
                total_spent: 465.00,
                preferred_payment: 'GCash',
                address: 'Grace Park, Caloocan',
                last_order_at: '2026-09-15T16:40:00Z',
                recent_orders: [
                    { order_number: 'MM-2026-062', placed_at: '2026-09-15T16:40:00Z', total_amount: 155.00, item_count: 1 }
                ]
            }
        ];

        acquisitionTimeframeData = {
            today: 3,
            week: 11,
            month: 24,
            last3Months: 68,
            last6Months: 142
        };

        // Populate fallback UI
        document.getElementById('totalRegistered').textContent = '4';
        document.getElementById('totalRegisteredGrowth').textContent = '+18% vs last month';
        document.getElementById('activeBuyersToday').textContent = '2';
        document.getElementById('repeatRate').textContent = '75%';

        updateSegmentationDisplay({
            memberCount: 4,
            guestCount: 2,
            memberRevenue: 4935.00,
            guestRevenue: 435.00,
            memberRevenuePercent: 92,
            guestRevenuePercent: 8,
            memberOrders: 30,
            guestOrders: 3
        });

        updateTabBadges();
        applyDirectoryFilters();
        updateAcquisitionCardDisplay();
    }
}

// Segmentation Display & Strategic Insight
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
            insightBox.innerHTML = `<strong>Strategic Alert:</strong> Mas malaki ang bahagi ng Guest Checkouts (<strong>${guestRevPct}%</strong>). Senyales ito na bumibili ang tao ngunit hindi gumagawa ng account. <em>Rekomendasyon:</em> Maglunsad ng 10% first-signup promo voucher sa "Promotions" tab upang ma-convert ang guests sa loyal registered members.`;
        } else {
            insightBox.innerHTML = `<strong>Healthy Customer Loyalty:</strong> Pinangungunahan ng mga Registered Members ang bentahan (<strong>${memRevPct}%</strong>). Maganda ang repeat order engagement. Panatilihin ang points rewards para sa customer retention.`;
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

// Update card display kapag pinalitan ang timeframe sa dropdown
function updateAcquisitionCardDisplay() {
    const select = document.getElementById('acquisitionPeriodSelect');
    const valueEl = document.getElementById('filteredNewAccounts');
    const footerEl = document.getElementById('acquisitionPeriodFooter');

    const selected = select ? select.value : 'today';

    const timeframeConfig = {
        today: { footer: "Registered today" },
        week: { footer: "Past 7 days" },
        month: { footer: "Current calendar month" },
        last3Months: { footer: "Past 90 days" },
        last6Months: { footer: "Past 180 days" }
    };

    const config = timeframeConfig[selected] || timeframeConfig.today;

    if (valueEl) {
        valueEl.textContent = Number(acquisitionTimeframeData[selected] || 0).toLocaleString();
    }
    if (footerEl) {
        footerEl.textContent = config.footer;
    }
}

// Filter Directory: Tab (All / Member / Guest) + Date + Search
function applyDirectoryFilters() {
    const query = document.getElementById('customerSearchInput')?.value.toLowerCase().trim() || '';
    const dateFilterVal = document.getElementById('customerDateFilter')?.value || 'all';
    const customDateVal = document.getElementById('customerCustomDate')?.value;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
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

        // Date Filter (Batay sa huling order o sign-up)
        if (dateFilterVal !== 'all' && c.last_order_at) {
            const ordDate = new Date(c.last_order_at);
            const ordDateStr = c.last_order_at.split('T')[0];

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
                <td><strong class="order-count">${orderCount} orders</strong></td>
                <td><span class="spent-val">₱${totalSpent}</span></td>
                <td><span class="method-pill">${escapeHtml(cust.preferred_payment || 'GCash')}</span></td>
                <td style="text-align: center;">
                    <button type="button" class="view-profile-btn" onclick="openProfileModal('${cust.id}')">View Profile</button>
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
        historyList.innerHTML = '<div class="history-item"><div>No recent orders recorded.</div></div>';
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