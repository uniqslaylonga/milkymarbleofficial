document.addEventListener('DOMContentLoaded', () => {
    fetchPaymentsData();
});

async function fetchPaymentsData() {
    try {
        const response = await fetch('/api/finance-officer/payments');
        if (!response.ok) throw new Error('Failed to load payments data');

        const data = await response.json();

        // Populate User Profile
        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userNameEl) userNameEl.textContent = data.user.fullName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        // Populate Summary Cards
        const monthlyTotalEl = document.getElementById('monthlyTotal');
        const quarterlyTotalEl = document.getElementById('quarterlyTotal');
        const yearlyTotalEl = document.getElementById('yearlyTotal');

        if (monthlyTotalEl) monthlyTotalEl.textContent = formatAmount(data.summary.monthlyTotal);
        if (quarterlyTotalEl) quarterlyTotalEl.textContent = formatAmount(data.summary.quarterlyTotal);
        if (yearlyTotalEl) yearlyTotalEl.textContent = formatAmount(data.summary.yearlyTotal);

        // Render Table Rows
        renderPaymentsTable(data.payments);
    } catch (error) {
        console.error('Error fetching payments data:', error);
        const tbody = document.getElementById('paymentsTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red; padding: 20px;">Failed to load payment transactions.</td></tr>';
        }
    }
}

function renderPaymentsTable(payments) {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;

    if (!payments || payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">No payment transactions found in database.</td></tr>';
        return;
    }

    tbody.innerHTML = payments.map(row => {
        const dateFormatted = new Date(row.created_at).toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
        });
        const amount = formatAmount(row.amount);

        return `
            <tr>
                <td>${dateFormatted}</td>
                <td>${escapeHtml(row.customer_name)}</td>
                <td>${escapeHtml(row.user_identifier)}</td>
                <td>${escapeHtml(row.transaction_id)}</td>
                <td>₱${amount}</td>
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