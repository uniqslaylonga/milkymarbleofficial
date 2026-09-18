// Global store for acquisition metrics
let customerAcquisitionData = {
    today: 0,
    week: 0,
    month: 0,
    last3Months: 0,
    last6Months: 0
};

// Chart instances
let acquisitionChartInstance = null;
let revenueDonutChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    initCharts();

    const acqFilter = document.getElementById('acquisitionFilter');
    if (acqFilter) {
        acqFilter.addEventListener('change', updateAcquisitionDisplay);
    }

    await loadPageData();
});

// Initialize compact Chart.js
function initCharts() {
    // 1. Mini Acquisition Trend Chart
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

    // 2. Revenue Share Donut Chart
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
        if (!response.ok) throw new Error('Failed to load dashboard data');

        const data = await response.json();

        // 1. User Profile & Avatar
        if (data.user) {
            const userNameEl = document.getElementById('userName');
            const userFirstNameEl = document.getElementById('userFirstName');
            const userAvatarEl = document.getElementById('userAvatar');
            const userAvatarSvg = document.getElementById('userAvatarSvg');

            if (userNameEl) userNameEl.textContent = data.user.fullName || 'Sales Officer';
            if (userFirstNameEl) userFirstNameEl.textContent = (data.user.firstName || 'Officer') + '!';

            if (data.user.avatarSrc && userAvatarEl) {
                userAvatarEl.src = data.user.avatarSrc;
                userAvatarEl.style.display = 'block';
                if (userAvatarSvg) userAvatarSvg.style.display = 'none';
            }
        }

        // 2. Performance Metrics
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

        // 4. Revenue Split & Donut Chart
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

            if (regAmountEl) {
                regAmountEl.textContent = '₱' + regRev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            if (regPctEl) regPctEl.textContent = `${regPct}%`;

            if (guestAmountEl) {
                guestAmountEl.textContent = '₱' + guestRev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            if (guestPctEl) guestPctEl.textContent = `${guestPct}%`;

            // Update Donut Chart
            if (revenueDonutChartInstance) {
                const total = regRev + guestRev;
                revenueDonutChartInstance.data.datasets[0].data = total === 0 ? [50, 50] : [regRev, guestRev];
                revenueDonutChartInstance.update();
            }

            // Progress Bar
            if (barRegLabel) barRegLabel.textContent = `${regPct}%`;
            if (barGuestLabel) barGuestLabel.textContent = `${guestPct}%`;
            if (barRegFill) barRegFill.style.width = `${regPct}%`;
            if (barGuestFill) barGuestFill.style.width = `${guestPct}%`;

            // Decision Intelligence
            if (insightMessage) {
                if (guestPct > regPct) {
                    insightMessage.innerHTML = `<strong>Strategic Alert:</strong> Mas malaki ang kita mula sa Guest Checkouts (<strong>${guestPct}%</strong>). Mag-alok ng 10% voucher para sa first-time sign-ups upang ma-convert sila.`;
                } else if (regPct > 0 || guestPct > 0) {
                    insightMessage.innerHTML = `<strong>Healthy Engagement:</strong> Pinangungunahan ng Registered Members ang benta (<strong>${regPct}%</strong>). Maganda ang loyalty retention.`;
                } else {
                    insightMessage.textContent = 'Analyzing revenue trends to formulate promotional strategy...';
                }
            }
        }

        // 5. Recent Transactions
        const ordersGrid = document.getElementById('recentOrdersGrid');
        if (ordersGrid) {
            if (data.recentOrders && data.recentOrders.length > 0) {
                ordersGrid.innerHTML = data.recentOrders.map(ord => {
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
                        <div class="order-card">
                            <div class="card-main">
                                <div class="info-col">
                                    <div class="name-row">
                                        <span class="person-name">${displayName}</span>
                                        <span class="client-badge ${badgeClass}">${badgeText}</span>
                                    </div>
                                    <div class="person-role">${escapeHtml(ord.order_number || '')} • ${dateFormatted}</div>
                                </div>
                                <div class="price-col">₱${amount}</div>
                            </div>
                            <div class="card-bottom">
                                <span>Payment: <strong>${escapeHtml(ord.payment_method || 'Cash')}</strong></span>
                                <span class="purpose-label">Status: <strong>${escapeHtml(ord.status || 'PENDING')}</strong></span>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                ordersGrid.innerHTML = '<p style="padding: 20px; color: var(--text-muted);">No recent transactions recorded.</p>';
            }
        }

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        const ordersGrid = document.getElementById('recentOrdersGrid');
        if (ordersGrid) {
            ordersGrid.innerHTML = '<p style="padding: 20px; color: #d9534f;">Failed to load data. Please ensure backend server and Supabase are running.</p>';
        }
    }
}

function updateAcquisitionDisplay() {
    const filterEl = document.getElementById('acquisitionFilter');
    const valueEl = document.getElementById('filteredNewAccounts');
    const titleEl = document.getElementById('acquisitionPeriodTitle');
    const footerEl = document.getElementById('acquisitionPeriodFooter');

    const selected = filterEl ? filterEl.value : 'today';

    const timeframeConfig = {
        today: {
            title: "Today's New Accounts",
            footer: "Registered today"
        },
        week: {
            title: "This Week's New Accounts",
            footer: "Past 7 days"
        },
        month: {
            title: "This Month's New Accounts",
            footer: "Current calendar month"
        },
        last3Months: {
            title: "Last 3 Months' New Accounts",
            footer: "Quarterly acquisition (past 90 days)"
        },
        last6Months: {
            title: "Last 6 Months' New Accounts",
            footer: "Semi-annual acquisition (past 180 days)"
        }
    };

    const config = timeframeConfig[selected] || timeframeConfig.today;

    if (valueEl) {
        valueEl.textContent = Number(customerAcquisitionData[selected] || 0).toLocaleString();
    }
    if (titleEl) {
        titleEl.textContent = config.title;
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