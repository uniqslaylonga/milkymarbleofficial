document.addEventListener('DOMContentLoaded', () => {
    fetchPromotionsData();

    const promoModalOverlay = document.getElementById('promoModalOverlay');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closePromoModal);
    if (modalCancelBtn) modalCancelBtn.addEventListener('click', closePromoModal);

    if (promoModalOverlay) {
        promoModalOverlay.addEventListener('click', (e) => {
            if (e.target === promoModalOverlay) closePromoModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePromoModal();
    });

    const createPromoForm = document.getElementById('createPromoForm');
    if (createPromoForm) {
        createPromoForm.addEventListener('submit', handleCreatePromo);
    }

    const discountTypeSelect = document.getElementById('inputDiscountType');
    if (discountTypeSelect) {
        discountTypeSelect.addEventListener('change', updateDiscountPlaceholder);
    }
});

async function fetchPromotionsData() {
    try {
        const userId = localStorage.getItem('userId');
        const headers = userId ? { 'x-user-id': userId } : {};

        const response = await fetch('/api/sales-officer/promotions', { headers });
        if (!response.ok) throw new Error('Failed to load promotions data');

        const data = await response.json();

        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');
        if (userNameEl) userNameEl.textContent = data.user.fullName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        const totalPromosEl = document.getElementById('totalPromosCount');
        const activePromosEl = document.getElementById('activePromosCount');
        if (totalPromosEl) totalPromosEl.textContent = Number(data.metrics.totalPromosCount).toLocaleString();
        if (activePromosEl) activePromosEl.textContent = Number(data.metrics.activePromosCount).toLocaleString();

        renderCampaigns(data.promotions);
    } catch (error) {
        console.error('Error fetching promotions:', error);
        const campaignGrid = document.getElementById('campaignGrid');
        if (campaignGrid) {
            campaignGrid.innerHTML = '<p style="padding: 20px; color: red;">Failed to load promotions.</p>';
        }
    }
}

function renderCampaigns(promotions) {
    const campaignGrid = document.getElementById('campaignGrid');
    if (!campaignGrid) return;

    if (!promotions || promotions.length === 0) {
        campaignGrid.innerHTML = '<p style="padding: 20px;">No promotional codes recorded in the database.</p>';
        return;
    }

    campaignGrid.innerHTML = promotions.map(promo => {
        const isPaused = promo.status !== 'ACTIVE';
        const newStatus = isPaused ? 'ACTIVE' : 'EXPIRED';
        const toggleLabel = isPaused ? 'Activate' : 'Pause';
        const discountText = promo.discount_type === 'percent' 
            ? `${promo.discount_value}% OFF` 
            : `₱${Number(promo.discount_value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} OFF`;

        return `
            <div class="campaign-card ${isPaused ? 'paused' : ''}">
                <div class="camp-top">
                    <div class="promo-badge-tag">${escapeHtml(promo.status)}</div>
                    <button type="button" 
                            style="background:none; border:none; cursor:pointer; color:var(--brown-soft); font-weight:bold;"
                            onclick="togglePromoStatus(${promo.id}, '${newStatus}')">
                        ${toggleLabel}
                    </button>
                </div>
                <div class="camp-main">
                    <div class="promo-code-wrap">
                        <span class="promo-code">${escapeHtml(promo.code)}</span>
                        <span class="discount-pill">${discountText}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function handleCreatePromo(e) {
    e.preventDefault();

    const code = document.getElementById('inputPromoCode').value.toUpperCase().trim();
    const discount_type = document.getElementById('inputDiscountType').value;
    const discount_value = parseFloat(document.getElementById('inputDiscountVal').value);

    if (!code || isNaN(discount_value) || discount_value <= 0) {
        alert('Please provide a valid code and discount value.');
        return;
    }

    try {
        const response = await fetch('/api/sales-officer/promotions/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, discount_type, discount_value })
        });

        const result = await response.json();
        if (result.status === 'success') {
            closePromoModal();
            document.getElementById('createPromoForm').reset();
            updateDiscountPlaceholder();
            fetchPromotionsData();
        } else {
            alert('Failed to create promotion: ' + (result.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating promotion:', error);
        alert('An error occurred while creating promotion.');
    }
}

async function togglePromoStatus(promoId, newStatus) {
    try {
        const response = await fetch('/api/sales-officer/promotions/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toggle_id: promoId, new_status: newStatus })
        });

        const result = await response.json();
        if (result.status === 'success') {
            fetchPromotionsData();
        } else {
            alert('Failed to update status: ' + (result.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error toggling promo status:', error);
        alert('An error occurred while updating status.');
    }
}

function openPromoModal() {
    const modal = document.getElementById('promoModalOverlay');
    if (modal) {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closePromoModal() {
    const modal = document.getElementById('promoModalOverlay');
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
}

function updateDiscountPlaceholder() {
    const type = document.getElementById('inputDiscountType').value;
    const label = document.getElementById('discountValueLabel');
    const input = document.getElementById('inputDiscountVal');

    if (!label || !input) return;

    if (type === 'percent') {
        label.textContent = 'Discount Value * (%)';
        input.placeholder = 'e.g. 10';
    } else {
        label.textContent = 'Discount Value * (₱)';
        input.placeholder = 'e.g. 50.00';
    }
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