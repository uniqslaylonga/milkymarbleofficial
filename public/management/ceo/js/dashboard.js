let revenueChart = null;
let chartData = {
    monthsLabels: [],
    monthlyCoffee: [],
    monthlyStrawberry: [],
    monthlyPandan: [],
    yearsLabels: [],
    yearlyCoffee: [],
    yearlyStrawberry: [],
    yearlyPandan: []
};

document.addEventListener('DOMContentLoaded', () => {
    fetchCeoDashboardData();
});

async function fetchCeoDashboardData() {
    try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');

        const response = await fetch('/api/ceo/dashboard', {
            method: 'GET',
            headers: {
                'x-user-id': userId || '',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error('Failed to load dashboard data');
        const data = await response.json();

        // 1. Update Top Right Profile
        const userFullNameEl = document.getElementById('userFullNameDisplay');
        const userAvatarEl = document.getElementById('userAvatarImg');
        const greetingNameEl = document.getElementById('greetingName');

        if (userFullNameEl) userFullNameEl.textContent = data.user.fullName;
        if (greetingNameEl) greetingNameEl.textContent = data.user.fullName.split(' ')[0];

        if (userAvatarEl && data.user.avatar) {
            let avatarPath = data.user.avatar;
            // If the database sends the root path, correct it to your folder structure
            if (avatarPath === '/images/account.png' || avatarPath === 'account.png') {
                avatarPath = '../images/account.png';
            }
            userAvatarEl.src = avatarPath;
        }

        // 2. Update KPI Stats
        document.getElementById('statSales').textContent = '₱' + Number(data.stats.totalSales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
        document.getElementById('statCustomers').textContent = Number(data.stats.totalCustomers || 0).toLocaleString();

        // 3. Inject Real Supabase Chart Data
        chartData.monthsLabels = data.chart.months;
        chartData.yearsLabels = data.chart.years;

        chartData.monthlyCoffee = data.chart.monthlyCoffee;
        chartData.monthlyStrawberry = data.chart.monthlyStrawberry;
        chartData.monthlyPandan = data.chart.monthlyPandan;

        chartData.yearlyCoffee = data.chart.yearlyCoffee;
        chartData.yearlyStrawberry = data.chart.yearlyStrawberry;
        chartData.yearlyPandan = data.chart.yearlyPandan;

        // 4. Render the Graph
        if (revenueChart) {
            revenueChart.destroy(); // Prevent duplicate overlapping charts
        }
        initRevenueChart();

    } catch (error) {
        console.error('Error fetching CEO dashboard data:', error);
    }
}

document.addEventListener('DOMContentLoaded', fetchCeoDashboardData);


function initRevenueChart() {
    const ctx = document.getElementById('revenueChart').getContext('2d');

    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.monthsLabels,
            datasets: [
                {
                    label: 'Coffee',
                    data: chartData.monthlyCoffee,
                    borderColor: '#8b78ff',
                    backgroundColor: '#8b78ff',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#8b78ff',
                    tension: 0.2
                },
                {
                    label: 'Strawberry',
                    data: chartData.monthlyStrawberry,
                    borderColor: '#ff8579',
                    backgroundColor: '#ff8579',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#ff8579',
                    tension: 0.2
                },
                {
                    label: 'Pandan',
                    data: chartData.monthlyPandan,
                    borderColor: '#38c8db',
                    backgroundColor: '#38c8db',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#38c8db',
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 20,
                        font: { size: 12, family: 'Urbanist', weight: '600' }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(230, 200, 200, 0.35)', drawBorder: false },
                    ticks: { font: { size: 11, family: 'Urbanist', weight: '600' }, color: '#7a6564' }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 400,
                        callback: function (value) { return '₱' + Number(value).toLocaleString(); },
                        font: { size: 11, family: 'Urbanist', weight: '600' },
                        color: '#7a6564'
                    },
                    grid: { color: 'rgba(230, 200, 200, 0.35)', drawBorder: false }
                }
            }
        }
    });

    // Toggle Handlers
    const btnMonths = document.getElementById('btnMonths');
    const btnYears = document.getElementById('btnYears');

    btnMonths.addEventListener('click', function () {
        btnMonths.classList.add('active');
        btnYears.classList.remove('active');

        revenueChart.data.labels = chartData.monthsLabels;
        revenueChart.data.datasets[0].data = chartData.monthlyCoffee;
        revenueChart.data.datasets[1].data = chartData.monthlyStrawberry;
        revenueChart.data.datasets[2].data = chartData.monthlyPandan;
        revenueChart.options.scales.y.ticks.stepSize = 400;
        revenueChart.update();
    });

    btnYears.addEventListener('click', function () {
        btnYears.classList.add('active');
        btnMonths.classList.remove('active');

        revenueChart.data.labels = chartData.yearsLabels;
        revenueChart.data.datasets[0].data = chartData.yearlyCoffee;
        revenueChart.data.datasets[1].data = chartData.yearlyStrawberry;
        revenueChart.data.datasets[2].data = chartData.yearlyPandan;
        revenueChart.options.scales.y.ticks.stepSize = 2000;
        revenueChart.update();
    });
}