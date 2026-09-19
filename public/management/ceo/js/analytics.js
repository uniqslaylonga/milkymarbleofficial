let revenueChart = null;
let salesChart = null;
let customersChart = null;

let analyticsData = {
    monthsLabels: [],
    yearsLabels: [],
    monthlyRevCoffee: [],
    monthlyRevStrawberry: [],
    monthlyRevPandan: [],
    yearlyRevCoffee: [],
    yearlyRevStrawberry: [],
    yearlyRevPandan: [],
    salesCoffee: [],
    salesStrawberry: [],
    salesPandan: [],
    customerLabels: [],
    customerData: []
};

document.addEventListener('DOMContentLoaded', () => {
    fetchCeoAnalyticsData();
});

async function fetchCeoAnalyticsData() {
    try {
        const response = await fetch('/api/ceo/analytics');
        if (!response.ok) throw new Error('Failed to fetch CEO analytics data');

        const data = await response.json();

        // User Profile & Avatar
        const fullName = data.user.fullName || 'Gabriel Louis M. Espadilla';
        document.getElementById('userFullNameDisplay').textContent = fullName;

        const userAvatarEl = document.getElementById('userAvatarImg');
        if (userAvatarEl && data.user.avatar) {
            let avatarPath = data.user.avatar;
            // Correct the root path to your local folder structure
            if (avatarPath === '/images/account.png' || avatarPath === 'account.png') {
                avatarPath = '../images/account.png';
            }
            userAvatarEl.src = avatarPath;
        }

        // Overview Cards
        document.getElementById('statNewOrders').textContent = Number(data.overview.newOrders || 0).toLocaleString();
        document.getElementById('statPreOrders').textContent = Number(data.overview.preOrders || 0).toLocaleString();
        document.getElementById('statFinishedGoods').textContent = Number(data.overview.finishedGoods || 0).toLocaleString();
        document.getElementById('statSales').textContent = `₱${Number(data.overview.totalSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Chart Datasets
        analyticsData.monthsLabels = data.charts.monthsLabels;
        analyticsData.yearsLabels = data.charts.yearsLabels;
        analyticsData.monthlyRevCoffee = data.charts.monthlyRevCoffee;
        analyticsData.monthlyRevStrawberry = data.charts.monthlyRevStrawberry;
        analyticsData.monthlyRevPandan = data.charts.monthlyRevPandan;

        analyticsData.yearlyRevCoffee = data.charts.yearlyRevCoffee;
        analyticsData.yearlyRevStrawberry = data.charts.yearlyRevStrawberry;
        analyticsData.yearlyRevPandan = data.charts.yearlyRevPandan;

        analyticsData.salesCoffee = data.charts.salesCoffee;
        analyticsData.salesStrawberry = data.charts.salesStrawberry;
        analyticsData.salesPandan = data.charts.salesPandan;

        analyticsData.customerLabels = data.charts.customerLabels;
        analyticsData.customerData = data.charts.customerData;

        // Render All Charts
        initCharts();

    } catch (error) {
        console.error('Error loading CEO analytics:', error);
    }
}

function initCharts() {
    const commonScaleOptions = {
        x: {
            grid: { color: 'rgba(230, 200, 200, 0.35)', drawBorder: false },
            ticks: { font: { size: 10, family: 'Urbanist', weight: '600' }, color: '#7a6564' }
        },
        y: {
            beginAtZero: true,
            ticks: { font: { size: 10, family: 'Urbanist', weight: '600' }, color: '#7a6564' },
            grid: { color: 'rgba(230, 200, 200, 0.35)', drawBorder: false }
        }
    };

    const commonLegendOptions = {
        position: 'bottom',
        labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 6,
            padding: 15,
            font: { size: 11, family: 'Urbanist', weight: '600' }
        }
    };

    // 1. Revenue Chart
    const ctxRev = document.getElementById('revenueChart').getContext('2d');
    revenueChart = new Chart(ctxRev, {
        type: 'line',
        data: {
            labels: analyticsData.monthsLabels,
            datasets: [
                {
                    label: 'Coffee',
                    data: analyticsData.monthlyRevCoffee,
                    borderColor: '#8b78ff',
                    backgroundColor: '#8b78ff',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#8b78ff',
                    tension: 0.1
                },
                {
                    label: 'Strawberry',
                    data: analyticsData.monthlyRevStrawberry,
                    borderColor: '#ff8579',
                    backgroundColor: '#ff8579',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#ff8579',
                    tension: 0.1
                },
                {
                    label: 'Pandan',
                    data: analyticsData.monthlyRevPandan,
                    borderColor: '#38c8db',
                    backgroundColor: '#38c8db',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#38c8db',
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: commonLegendOptions },
            scales: {
                x: commonScaleOptions.x,
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) { return '₱' + Number(value).toLocaleString(); },
                        font: { size: 10, family: 'Urbanist', weight: '600' },
                        color: '#7a6564'
                    },
                    grid: commonScaleOptions.y.grid
                }
            }
        }
    });

    // Revenue Toggle Handler (Months vs Years)
    const btnMonths = document.getElementById('btnMonths');
    const btnYears = document.getElementById('btnYears');

    btnMonths.addEventListener('click', function () {
        btnMonths.classList.add('active');
        btnYears.classList.remove('active');

        revenueChart.data.labels = analyticsData.monthsLabels;
        revenueChart.data.datasets[0].data = analyticsData.monthlyRevCoffee;
        revenueChart.data.datasets[1].data = analyticsData.monthlyRevStrawberry;
        revenueChart.data.datasets[2].data = analyticsData.monthlyRevPandan;
        revenueChart.update();
    });

    btnYears.addEventListener('click', function () {
        btnYears.classList.add('active');
        btnMonths.classList.remove('active');

        revenueChart.data.labels = analyticsData.yearsLabels;
        revenueChart.data.datasets[0].data = analyticsData.yearlyRevCoffee;
        revenueChart.data.datasets[1].data = analyticsData.yearlyRevStrawberry;
        revenueChart.data.datasets[2].data = analyticsData.yearlyRevPandan;
        revenueChart.update();
    });

    // 2. Sales Volume Chart (Units Sold)
    const ctxSales = document.getElementById('salesChart').getContext('2d');
    salesChart = new Chart(ctxSales, {
        type: 'line',
        data: {
            labels: analyticsData.monthsLabels,
            datasets: [
                {
                    label: 'Coffee',
                    data: analyticsData.salesCoffee,
                    borderColor: '#8b78ff',
                    backgroundColor: '#8b78ff',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#8b78ff',
                    tension: 0.1
                },
                {
                    label: 'Strawberry',
                    data: analyticsData.salesStrawberry,
                    borderColor: '#ff8579',
                    backgroundColor: '#ff8579',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#ff8579',
                    tension: 0.1
                },
                {
                    label: 'Pandan',
                    data: analyticsData.salesPandan,
                    borderColor: '#38c8db',
                    backgroundColor: '#38c8db',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#38c8db',
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: commonLegendOptions },
            scales: commonScaleOptions
        }
    });

    // 3. Customers Breakdown Pie Chart
    const ctxCust = document.getElementById('customersChart').getContext('2d');
    customersChart = new Chart(ctxCust, {
        type: 'pie',
        data: {
            labels: analyticsData.customerLabels,
            datasets: [{
                data: analyticsData.customerData,
                backgroundColor: ['#8b78ff', '#ff8579', '#38c8db'],
                borderWidth: 0
            }]
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
                        boxWidth: 6,
                        padding: 15,
                        font: { size: 10, family: 'Urbanist', weight: '600' }
                    }
                }
            }
        }
    });
}