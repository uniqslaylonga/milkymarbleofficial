document.addEventListener('DOMContentLoaded', () => {
    fetchBudgetRecords();
});

async function fetchBudgetRecords() {
    try {
        const response = await employeeFetch('/api/finance-officer/budget');
        if (!response.ok) throw new Error('Failed to load budget data');

        const data = await response.json();

        // Populate User Profile
        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userNameEl) userNameEl.textContent = data.user.fullName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        // Render Table Rows
        renderBudgetTable(data.records);
    } catch (error) {
        console.error('Error fetching budget records:', error);
        const tbody = document.getElementById('budgetTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red; padding: 20px;">Failed to load budget records.</td></tr>';
        }
    }
}

function renderBudgetTable(records) {
    const tbody = document.getElementById('budgetTableBody');
    if (!tbody) return;

    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">No budget records found in database.</td></tr>';
        return;
    }

    tbody.innerHTML = records.map(row => {
        const capital = formatAmount(row.capital);
        const rawMaterial = formatAmount(row.raw_material);
        const emergencyFunds = formatAmount(row.emergency_funds);
        const manpowerCost = formatAmount(row.manpower_cost);

        return `
            <tr>
                <td>${escapeHtml(row.date)}</td>
                <td>${capital}</td>
                <td>${rawMaterial}</td>
                <td>${emergencyFunds}</td>
                <td>${manpowerCost}</td>
            </tr>
        `;
    }).join('');
}

function formatAmount(val) {
    return Number(val || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
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