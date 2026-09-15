document.addEventListener('DOMContentLoaded', () => {
    Chart.defaults.font.family = "'Urbanist', sans-serif";
    fetchFinanceDashboardData();
});

async function fetchFinanceDashboardData() {
    try {
        const response = await fetch('/api/finance-officer/dashboard');
        if (!response.ok) throw new Error('Failed to load dashboard data');

        const data = await response.json();

        // User profile setup
        const userNameEl = document.getElementById('userName');
        const userFirstNameEl = document.getElementById('userFirstName');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userNameEl) userNameEl.textContent = data.user.fullName;
        if (userFirstNameEl) userFirstNameEl.textContent = data.user.firstName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        // Metrics setup
        const totalBudgetEl = document.getElementById('totalBudget');
        const totalRevenueEl = document.getElementById('totalRevenue');
        const totalPaymentsEl = document.getElementById('totalPayments');
        const totalExpensesEl = document.getElementById('totalExpenses');

        if (totalBudgetEl) totalBudgetEl.textContent = '₱' + formatAmount(data.metrics.totalBudget);
        if (totalRevenueEl) totalRevenueEl.textContent = '₱' + formatAmount(data.metrics.totalRevenue);
        if (totalPaymentsEl) totalPaymentsEl.textContent = '₱' + formatAmount(data.metrics.totalPayments);
        if (totalExpensesEl) totalExpensesEl.textContent = '₱' + formatAmount(data.metrics.totalExpenses);

        // Donut percentages
        document.getElementById('pct2026').textContent = `${data.yearlyPercentages.p2026}%`;
        document.getElementById('pct2025').textContent = `${data.yearlyPercentages.p2025}%`;
        document.getElementById('pct2024').textContent = `${data.yearlyPercentages.p2024}%`;

        // Render Charts
        initWaveChart(data.weeklyWave);
        initBarChart(data.monthlyInflow, data.monthlyOutflow);
        initDonutChart(data.yearlyTotals);
    } catch (error) {
        console.error('Error fetching finance dashboard data:', error);
    }
}

function initWaveChart(waveData) {
    const ctxWave = document.getElementById('waveChart').getContext('2d');
    new Chart(ctxWave, {
        type: 'line',
        data: {
            labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            datasets: [
                {
                    data: (waveData && waveData.series1) || [0, 0, 0, 0, 0, 0, 0],
                    borderColor: '#E85D88',
                    backgroundColor: 'rgba(232, 93, 136, 0.45)',
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#E85D88',
                    pointRadius: 3
                },
                {
                    data: (waveData && waveData.series2) || [0, 0, 0, 0, 0, 0, 0],
                    borderColor: '#9C6ADE',
                    backgroundColor: 'rgba(156, 106, 222, 0.55)',
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#9C6ADE',
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0, ticks: { color: '#8C6D6D' }, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { ticks: { color: '#8C6D6D' }, grid: { display: false } }
            }
        }
    });
}

function initBarChart(inflow, outflow) {
    const ctxBar = document.getElementById('barChart').getContext('2d');
    new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            datasets: [
                {
                    label: 'InFlow',
                    data: inflow || Array(12).fill(0),
                    backgroundColor: '#E83269',
                    borderRadius: 4,
                    barThickness: 8
                },
                {
                    label: 'OutFlow',
                    data: outflow || Array(12).fill(0),
                    backgroundColor: '#AD1457',
                    borderRadius: 4,
                    barThickness: 8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0, ticks: { color: '#8C6D6D' }, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { ticks: { color: '#8C6D6D', font: { size: 10 } }, grid: { display: false } }
            }
        }
    });
}

function initDonutChart(yearlyTotals) {
    const ctxDonut = document.getElementById('donutChart').getContext('2d');
    const y2026 = (yearlyTotals && yearlyTotals.y2026) || 0;
    const y2025 = (yearlyTotals && yearlyTotals.y2025) || 0;
    const y2024 = (yearlyTotals && yearlyTotals.y2024) || 0;

    new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
            labels: ['2026', '2025', '2024'],
            datasets: [{
                data: [y2026, y2025, y2024],
                backgroundColor: ['#FCE762', '#61D095', '#FFABE1'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: { legend: { display: false } }
        }
    });
}

function formatAmount(val) {
    return Number(val || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}