document.addEventListener('DOMContentLoaded', async () => {
    await loadPageData();
});

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

        // 1. Populate User Profile
        if (data.user) {
            const userNameEl = document.getElementById('userName');
            const userFirstNameEl = document.getElementById('userFirstName');
            const userAvatarEl = document.getElementById('userAvatar');

            if (userNameEl) userNameEl.textContent = data.user.fullName || 'Sales Officer';
            if (userFirstNameEl) userFirstNameEl.textContent = data.user.firstName || 'Officer';
            if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;
        }

        // 2. Populate Today's Performance Metrics
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

        // 3. Populate Customer Acquisition Metrics (New Accounts)
        if (data.newAccounts) {
            const elToday = document.getElementById('newAccountsToday');
            const elWeek = document.getElementById('newAccountsWeek');
            const elMonth = document.getElementById('newAccountsMonth');
            const el3Months = document.getElementById('newAccounts3Months');

            if (elToday) elToday.textContent = Number(data.newAccounts.today || 0).toLocaleString();
            if (elWeek) elWeek.textContent = Number(data.newAccounts.week || 0).toLocaleString();
            if (elMonth) elMonth.textContent = Number(data.newAccounts.month || 0).toLocaleString();
            if (el3Months) el3Months.textContent = Number(data.newAccounts.last3Months || 0).toLocaleString();
        }

        // 4. Populate Guest vs. Registered Revenue & Decision Intelligence
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

            // Update Progress Bar
            if (barRegLabel) barRegLabel.textContent = `${regPct}%`;
            if (barGuestLabel) barGuestLabel.textContent = `${guestPct}%`;
            if (barRegFill) barRegFill.style.width = `${regPct}%`;
            if (barGuestFill) barGuestFill.style.width = `${guestPct}%`;

            // Actionable Decision Intelligence Recommendation
            if (insightMessage) {
                if (guestPct > regPct) {
                    insightMessage.innerHTML = `<strong>Strategic Alert:</strong> Mas malaki ang kita mula sa Guest Checkouts (<strong>${guestPct}%</strong>). Senyales ito na bumibili ang tao ngunit hindi nag-aabalang gumawa ng account. <em>Rekomendasyon:</em> Mag-alok ng 10% voucher sa "Promotions" desk para sa first-time sign-ups upang ma-convert sila sa registered loyalty members.`;
                } else if (regPct > 0 || guestPct > 0) {
                    insightMessage.innerHTML = `<strong>Healthy Engagement:</strong> Pinangungunahan ng mga Registered Members ang kabuuang benta (<strong>${regPct}%</strong>). Maganda ang loyalty retention. Panatilihin ang points system at maglunsad ng exclusive member-only flavors.`;
                } else {
                    insightMessage.textContent = 'Wala pang sapat na sales record upang makagawa ng ratio insight.';
                }
            }
        }

        // 5. Render Recent Transactions
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

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}