document.addEventListener('DOMContentLoaded', () => {
    fetchSalesReportsData();
});

async function loadPageData() {
    try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const headers = {};
        if (userId) {
            headers['x-user-id'] = userId;
        }

        const response = await fetch('/api/sales-officer/dashboard', { headers });
        if (!response.ok) throw new Error('Failed to load page data');

        const data = await response.json();

        // 1. Update User Header
        if (data.user) {
            const userNameEl = document.getElementById('userName');
            const userAvatarEl = document.getElementById('userAvatar');
            if (userNameEl) userNameEl.textContent = data.user.fullName;
            if (userAvatarEl) userAvatarEl.src = data.user.avatarSrc;
        }

        // 2. Render Tables & Metrics
        renderContent(data);
    } catch (error) {
        console.error('Data load error:', error);
        // Clear "Loading..." indicators on failure so the user doesn't see broken placeholders
        const tableBody = document.querySelector('tbody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; color:#d9534f;">Unable to load records. Check database connection.</td></tr>';
        }
    }
}

async function fetchSalesReportsData() {
    try {
        const response = await fetch('/api/sales-officer/sales-reports');
        if (!response.ok) throw new Error('Failed to load sales reports data');

        const data = await response.json();

        // User Profile
        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');
        if (userNameEl) userNameEl.textContent = data.user.fullName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        // Financial Highlights
        const grossSalesEl = document.getElementById('grossSales');
        const netSalesEl = document.getElementById('netSales');
        const aovEl = document.getElementById('aov');

        if (grossSalesEl) {
            grossSalesEl.textContent = '₱' + Number(data.metrics.grossSales).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
        if (netSalesEl) {
            netSalesEl.textContent = '₱' + Number(data.metrics.netSales).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
        if (aovEl) {
            aovEl.textContent = '₱' + Number(data.metrics.aov).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }

        // Render Product Performance Table
        renderProductRankings(data.productsRank);
    } catch (error) {
        console.error('Error fetching sales reports:', error);
        const tbody = document.getElementById('productsTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: red; padding: 20px;">Failed to load reports data.</td></tr>';
        }
    }
}

function renderProductRankings(productsRank) {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;

    if (!productsRank || productsRank.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">No product performance data available.</td></tr>';
        return;
    }

    tbody.innerHTML = productsRank.map((prod, index) => {
        const unitsSold = Number(prod.units_sold || 0).toLocaleString();
        const revenue = Number(prod.revenue || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        return `
            <tr>
                <td>
                    <div class="prod-cell">
                        <span class="rank-badge top">#${index + 1}</span>
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

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}