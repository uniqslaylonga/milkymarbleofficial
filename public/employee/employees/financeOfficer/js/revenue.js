document.addEventListener('DOMContentLoaded', () => {
    Chart.defaults.font.family = "'Urbanist', sans-serif";
    fetchRevenueData();
});

async function fetchRevenueData() {
    try {
        const response = await fetch('/api/finance-officer/revenue');
        if (!response.ok) throw new Error('Failed to load revenue data');

        const data = await response.json();

        // User Profile
        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userNameEl) userNameEl.textContent = data.user.fullName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        // Metrics Text
        document.getElementById('totalBudget').textContent = '₱' + formatAmount(data.metrics.totalBudget);
        document.getElementById('totalRevenue').textContent = '₱' + formatAmount(data.metrics.totalRevenue);
        document.getElementById('totalExpenses').textContent = '₱' + formatAmount(data.metrics.totalExpenses);
        document.getElementById('totalPayments').textContent = '₱' + formatAmount(data.metrics.totalPayments);

        // Percentage Text
        document.getElementById('budgetPct').textContent = `${data.percentages.budget}%`;
        document.getElementById('revenuePct').textContent = `${data.percentages.revenue}%`;
        document.getElementById('expensesPct').textContent = `${data.percentages.expenses}%`;
        document.getElementById('paymentsPct').textContent = `${data.percentages.payments}%`;

        // Render Gauges
        initGauges(data.metrics);

        // Render Multi-Line Chart
        initRevenueLineChart(data.monthly);
    } catch (error) {
        console.error('Error fetching revenue data:', error);
    }
}

function initGauges(metrics) {
    const gaugeOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: { tooltip: { enabled: false }, legend: { display: false } }
    };

    new Chart(document.getElementById('budgetGauge').getContext('2d'), {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [metrics.totalBudget, metrics.totalBudget === 0 ? 1 : 0],
                backgroundColor: ['#61D095', '#EAE0DA'],
                borderWidth: 0
            }]
        },
        options: gaugeOptions
    });

    new Chart(document.getElementById('revenueGauge').getContext('2d'), {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [metrics.totalRevenue, metrics.totalRevenue === 0 ? 1 : 0],
                backgroundColor: ['#CE93D8', '#EAE0DA'],
                borderWidth: 0
            }]
        },
        options: gaugeOptions
    });

    new Chart(document.getElementById('expensesGauge').getContext('2d'), {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [metrics.totalExpenses, metrics.totalExpenses === 0 ? 1 : 0],
                backgroundColor: ['#4FC3F7', '#EAE0DA'],
                borderWidth: 0
            }]
        },
        options: gaugeOptions
    });

    new Chart(document.getElementById('paymentsGauge').getContext('2d'), {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [metrics.totalPayments, metrics.totalPayments === 0 ? 1 : 0],
                backgroundColor: ['#8D6E63', '#EAE0DA'],
                borderWidth: 0
            }]
        },
        options: gaugeOptions
    });
}

function initRevenueLineChart(monthly) {
    const ctxLine = document.getElementById('revenueLineChart').getContext('2d');
    new Chart(ctxLine, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            datasets: [
                {
                    label: 'Total Budget',
                    data: monthly.budget || Array(12).fill(0),
                    borderColor: '#61D095',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointBackgroundColor: '#FFFFFF',
                    pointBorderColor: '#61D095',
                    pointBorderWidth: 2,
                    pointRadius: 4
                },
                {
                    label: 'Total Revenue',
                    data: monthly.revenue || Array(12).fill(0),
                    borderColor: '#CE93D8',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointBackgroundColor: '#FFFFFF',
                    pointBorderColor: '#CE93D8',
                    pointBorderWidth: 2,
                    pointRadius: 4
                },
                {
                    label: 'Total Expenses',
                    data: monthly.expenses || Array(12).fill(0),
                    borderColor: '#4FC3F7',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointBackgroundColor: '#FFFFFF',
                    pointBorderColor: '#4FC3F7',
                    pointBorderWidth: 2,
                    pointRadius: 4
                },
                {
                    label: 'Total Payments',
                    data: monthly.payments || Array(12).fill(0),
                    borderColor: '#8D6E63',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointBackgroundColor: '#FFFFFF',
                    pointBorderColor: '#8D6E63',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    grid: { color: 'rgba(0, 0, 0, 0.08)', borderDash: [2, 2] },
                    ticks: { color: '#5D4037', font: { family: 'Urbanist', size: 11 } }
                },
                y: {
                    min: 0,
                    ticks: { color: '#5D4037', font: { family: 'Urbanist', size: 11 } },
                    grid: { color: 'rgba(0, 0, 0, 0.08)', borderDash: [2, 2] }
                }
            }
        }
    });
}

function formatAmount(val) {
    return Number(val || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}