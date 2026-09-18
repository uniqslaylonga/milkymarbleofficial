let allProductsRank = [];
let filteredProductsRank = [];
let currentReportPage = 1;
const REPORTS_PAGE_SIZE = 5;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Date Filter Listeners
    const filterSelect = document.getElementById('reportDateFilter');
    const customDateInput = document.getElementById('reportCustomDate');
    const searchInput = document.getElementById('reportSearchInput');

    if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customDateInput.style.display = 'inline-block';
                if (!customDateInput.value) {
                    customDateInput.value = new Date().toISOString().split('T')[0];
                }
            } else {
                customDateInput.style.display = 'none';
            }
            applyReportFilters();
        });
    }

    if (customDateInput) {
        customDateInput.addEventListener('change', applyReportFilters);
    }

    if (searchInput) {
        searchInput.addEventListener('input', applyReportFilters);
    }

    // 2. Pagination Buttons
    const prevBtn = document.getElementById('prevReportBtn');
    const nextBtn = document.getElementById('nextReportBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentReportPage > 1) {
                currentReportPage--;
                renderPaginatedProductRankings();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredProductsRank.length / REPORTS_PAGE_SIZE) || 1;
            if (currentReportPage < totalPages) {
                currentReportPage++;
                renderPaginatedProductRankings();
            }
        });
    }

    fetchSalesReportsData();
});

async function fetchSalesReportsData() {
    try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const headers = userId ? { 'x-user-id': userId } : {};

        const response = await fetch('/api/sales-officer/sales-reports', { headers });
        if (!response.ok) throw new Error('Failed to load sales reports data');

        const data = await response.json();

        // User Profile
        if (data.user) {
            const userNameEl = document.getElementById('userName');
            const userAvatarEl = document.getElementById('userAvatar');
            if (userNameEl) userNameEl.textContent = data.user.fullName || 'Sales Officer';
            if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;
        }

        // Financial Highlights
        const grossSalesEl = document.getElementById('grossSales');
        const netSalesEl = document.getElementById('netSales');
        const aovEl = document.getElementById('aov');

        if (grossSalesEl) {
            grossSalesEl.textContent = '₱' + Number(data.metrics.grossSales || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
        if (netSalesEl) {
            netSalesEl.textContent = '₱' + Number(data.metrics.netSales || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
        if (aovEl) {
            aovEl.textContent = '₱' + Number(data.metrics.aov || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }

        allProductsRank = data.productsRank || [];
        applyReportFilters();

    } catch (error) {
        console.warn('Backend unavailable, loading fallback product ranking records:', error);

        // Fallback demo data para sa SKU Rankings
        allProductsRank = [
            { id: 1, name: 'Classic Pearl Milk Tea (16oz)', sku: 'MM-SKU-101', units_sold: 142, revenue: 15620.00, sold_date: new Date().toISOString() },
            { id: 2, name: 'Brown Sugar Marble Latte (22oz)', sku: 'MM-SKU-102', units_sold: 98, revenue: 13720.00, sold_date: new Date().toISOString() },
            { id: 3, name: 'Matcha Cream Marble (16oz)', sku: 'MM-SKU-103', units_sold: 76, revenue: 10488.00, sold_date: new Date().toISOString() },
            { id: 4, name: 'Wintermelon Milk Tea (22oz)', sku: 'MM-SKU-104', units_sold: 64, revenue: 8000.00, sold_date: new Date().toISOString() },
            { id: 5, name: 'Okinawa Roasted Milk Tea (16oz)', sku: 'MM-SKU-105', units_sold: 52, revenue: 6240.00, sold_date: new Date().toISOString() },
            { id: 6, name: 'Taro Cream Cheese (22oz)', sku: 'MM-SKU-106', units_sold: 41, revenue: 5945.00, sold_date: new Date().toISOString() }
        ];

        document.getElementById('grossSales').textContent = '₱59,973.00';
        document.getElementById('netSales').textContent = '₱54,200.00';
        document.getElementById('aov').textContent = '₱245.50';

        applyReportFilters();
    }
}

// Filter Logic: Date + Search Query
function applyReportFilters() {
    const filterType = document.getElementById('reportDateFilter')?.value || 'month';
    const customDateVal = document.getElementById('reportCustomDate')?.value;
    const searchVal = document.getElementById('reportSearchInput')?.value.trim().toLowerCase() || '';

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    filteredProductsRank = allProductsRank.filter(p => {
        // Date Check
        let passDate = true;
        if (p.sold_date) {
            const pDate = new Date(p.sold_date);
            const pDateStr = p.sold_date.split('T')[0];

            if (filterType === 'today') {
                passDate = pDateStr === todayStr;
            } else if (filterType === 'week') {
                passDate = pDate >= weekAgo;
            } else if (filterType === 'month') {
                passDate = pDate >= startOfMonth;
            } else if (filterType === 'custom') {
                passDate = pDateStr === customDateVal;
            }
        }

        // Search Check
        let passSearch = true;
        if (searchVal) {
            const name = (p.name || '').toLowerCase();
            const sku = (p.sku || '').toLowerCase();
            passSearch = name.includes(searchVal) || sku.includes(searchVal);
        }

        return passDate && passSearch;
    });

    currentReportPage = 1;
    renderPaginatedProductRankings();
}

// Render Table Rows with Pagination
function renderPaginatedProductRankings() {
    const tbody = document.getElementById('productsTableBody');
    const pageInfo = document.getElementById('reportPageInfo');
    const prevBtn = document.getElementById('prevReportBtn');
    const nextBtn = document.getElementById('nextReportBtn');

    if (!tbody) return;

    if (filteredProductsRank.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="loading-state-text">No product performance records found for the selected period.</td></tr>';
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 products';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        renderReportPagerButtons(1, 1);
        return;
    }

    const totalPages = Math.ceil(filteredProductsRank.length / REPORTS_PAGE_SIZE) || 1;
    const startIndex = (currentReportPage - 1) * REPORTS_PAGE_SIZE;
    const pageItems = filteredProductsRank.slice(startIndex, startIndex + REPORTS_PAGE_SIZE);

    if (pageInfo) {
        const startNum = startIndex + 1;
        const endNum = Math.min(startIndex + REPORTS_PAGE_SIZE, filteredProductsRank.length);
        pageInfo.textContent = `Showing ${startNum}-${endNum} of ${filteredProductsRank.length} products`;
    }
    if (prevBtn) prevBtn.disabled = currentReportPage <= 1;
    if (nextBtn) nextBtn.disabled = currentReportPage >= totalPages;

    renderReportPagerButtons(totalPages, currentReportPage);

    tbody.innerHTML = pageItems.map((prod, index) => {
        const absoluteIndex = startIndex + index + 1;
        const unitsSold = Number(prod.units_sold || 0).toLocaleString();
        const revenue = Number(prod.revenue || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        return `
            <tr>
                <td>
                    <div class="prod-cell">
                        <span class="rank-badge top">#${absoluteIndex}</span>
                        <div>
                            <div class="prod-title">${escapeHtml(prod.name)}</div>
                            <div class="prod-sku">SKU: ${escapeHtml(prod.sku || 'N/A')}</div>
                        </div>
                    </div>
                </td>
                <td><strong>${unitsSold} units</strong></td>
                <td><span class="spent-val">₱${revenue}</span></td>
            </tr>
        `;
    }).join('');
}

// Numbered Page Buttons: 1, 2, 3...
function renderReportPagerButtons(totalPages, activePage) {
    const pagerNumbers = document.getElementById('reportPagerNumbers');
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
            if (page && page !== currentReportPage) {
                currentReportPage = page;
                renderPaginatedProductRankings();
            }
        });
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