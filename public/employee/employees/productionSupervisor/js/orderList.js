document.addEventListener('DOMContentLoaded', () => {
    fetchOrderListData();

    const searchInput = document.getElementById('orderSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const q = this.value.toLowerCase().trim();
            const rows = document.querySelectorAll('#ordersTable tbody tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = (!q || text.includes(q)) ? '' : 'none';
            });
        });
    }
});

async function fetchOrderListData() {
    try {
        const response = await fetch('/api/production-supervisor/order-list');
        if (!response.ok) throw new Error('Failed to load order list data');

        const data = await response.json();

        // User profile setup
        const userFullNameEl = document.getElementById('userFullName');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userFullNameEl) userFullNameEl.textContent = data.user.fullName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        // KPI Counts
        document.getElementById('pendingCount').textContent = String(data.kpis.pendingCount || 0).padStart(2, '0');
        document.getElementById('inProgressCount').textContent = String(data.kpis.inProgressCount || 0).padStart(2, '0');
        document.getElementById('completedCount').textContent = String(data.kpis.completedCount || 0).padStart(2, '0');

        // Render Orders Table
        renderOrdersTable(data.ordersList);

        // Render Preset Cards
        renderPresetCards(data.presetCards);

    } catch (error) {
        console.error('Error fetching order list data:', error);
        const tbody = document.getElementById('ordersTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red; padding: 24px;">Failed to load orders.</td></tr>';
        }
    }
}

function renderOrdersTable(orders) {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;

    if (!orders || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 24px; color: #888;">No orders recorded in the system.</td></tr>';
        return;
    }

    tbody.innerHTML = orders.map(ord => {
        const amount = Number(ord.total_amount || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        return `
            <tr onclick="window.location.href='orderProduction.html?order_id=${ord.id}'" style="cursor: pointer;">
                <td class="order-col">
                    <div class="product-icon"><i class="fa-solid fa-mug-hot"></i></div>
                    <div class="product-copy">
                        <span class="product-name">${escapeHtml(ord.cleanTitle)}</span>
                        <small>${escapeHtml(ord.order_number)} &nbsp; ${escapeHtml(ord.size)}</small>
                    </div>
                </td>
                <td>${escapeHtml(ord.customer_name)}</td>
                <td>${parseInt(ord.quantity || 1, 10)}</td>
                <td>₱ ${amount}</td>
                <td><span class="status-pill ${escapeHtml(ord.statusClass)}">${escapeHtml(ord.statusLabel)}</span></td>
            </tr>
        `;
    }).join('');
}

function renderPresetCards(presets) {
    const container = document.getElementById('presetGrid');
    if (!container) return;

    if (!presets || presets.length === 0) {
        container.innerHTML = '<div style="color: #888;">No preset flavors available.</div>';
        return;
    }

    container.innerHTML = presets.map(card => {
        const cardClass = card.card_class || '';
        const tagClass = cardClass === 'green-card' ? 'green-tag' : (cardClass === 'pink-card' ? 'pink-tag' : '');

        const toppingsHtml = (card.toppings || []).map(top => 
            `<span class="ingredient-pill">${escapeHtml(top)}</span>`
        ).join('');

        return `
            <article class="preset-card ${escapeHtml(cardClass)}">
                <div class="preset-top">
                    <span class="preset-name">${escapeHtml(card.name)}</span>
                    <span class="preset-tag ${escapeHtml(tagClass)}">${escapeHtml(card.cut)}</span>
                </div>
                <div class="preset-body">
                    <span class="preset-label">${escapeHtml(card.flavor)}</span>
                    <div class="preset-size">
                        <button type="button" class="size-btn">8oz</button>
                        <button type="button" class="size-btn active">12oz</button>
                    </div>
                </div>
                <div class="ingredient-row">
                    ${toppingsHtml}
                </div>
            </article>
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