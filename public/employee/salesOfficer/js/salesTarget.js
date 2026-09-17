document.addEventListener('DOMContentLoaded', () => {
    fetchSalesTargetData();
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

async function fetchSalesTargetData() {
    try {
        const response = await fetch('/api/sales-officer/sales-target');
        if (!response.ok) throw new Error('Failed to load sales target data');

        const data = await response.json();

        // User Profile Setup
        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');
        if (userNameEl) userNameEl.textContent = data.user.fullName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        // Daily Gauge Metrics
        const dailyPctEl = document.getElementById('dailyPct');
        const todaySalesEl = document.getElementById('todaySales');
        const dailyTargetEl = document.getElementById('dailyTarget');
        const dailyGaugeFill = document.getElementById('dailyGaugeFill');

        if (dailyPctEl) dailyPctEl.textContent = `${data.metrics.dailyPct}%`;
        if (todaySalesEl) {
            todaySalesEl.textContent = '₱' + Number(data.metrics.todaySales).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
        if (dailyTargetEl) {
            dailyTargetEl.textContent = 'Target: ₱' + Number(data.metrics.dailyTarget).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
        if (dailyGaugeFill) dailyGaugeFill.style.width = `${data.metrics.dailyPct}%`;

        // Monthly Gauge Metrics
        const monthlyPctEl = document.getElementById('monthlyPct');
        const monthSalesEl = document.getElementById('monthSales');
        const monthlyTargetEl = document.getElementById('monthlyTarget');
        const monthlyGaugeFill = document.getElementById('monthlyGaugeFill');

        if (monthlyPctEl) monthlyPctEl.textContent = `${data.metrics.monthlyPct}%`;
        if (monthSalesEl) {
            monthSalesEl.textContent = '₱' + Number(data.metrics.monthSales).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
        if (monthlyTargetEl) {
            monthlyTargetEl.textContent = 'Target: ₱' + Number(data.metrics.monthlyTarget).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
        if (monthlyGaugeFill) monthlyGaugeFill.style.width = `${data.metrics.monthlyPct}%`;

    } catch (error) {
        console.error('Error fetching sales target data:', error);
    }
}