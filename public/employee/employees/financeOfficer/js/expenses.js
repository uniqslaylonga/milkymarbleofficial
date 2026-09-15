document.addEventListener('DOMContentLoaded', () => {
    fetchExpenseRecords();
});

async function fetchExpenseRecords() {
    try {
        const response = await fetch('/api/finance-officer/expenses');
        if (!response.ok) throw new Error('Failed to load expense data');

        const data = await response.json();

        // User profile setup
        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userNameEl) userNameEl.textContent = data.user.fullName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        // Render Table Rows
        renderExpenseTable(data.records);
    } catch (error) {
        console.error('Error fetching expense records:', error);
        const tbody = document.getElementById('expenseTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red; padding: 20px;">Failed to load expense records.</td></tr>';
        }
    }
}

function renderExpenseTable(records) {
    const tbody = document.getElementById('expenseTableBody');
    if (!tbody) return;

    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">No expense records found in database.</td></tr>';
        return;
    }

    tbody.innerHTML = records.map(row => {
        const marketing = formatAmount(row.marketing);
        const taxes = formatAmount(row.taxes);
        const cogs = formatAmount(row.cogs);

        return `
            <tr>
                <td>${escapeHtml(row.date)}</td>
                <td>${marketing}</td>
                <td>${taxes}</td>
                <td>${cogs}</td>
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