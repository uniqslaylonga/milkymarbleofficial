let currentOrderId = 0;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentOrderId = parseInt(urlParams.get('order_id') || '0', 10);

    fetchOrderProductionData(currentOrderId);

    const completeForm = document.getElementById('completeOrderForm');
    if (completeForm) {
        completeForm.addEventListener('submit', handleCompleteOrder);
    }
});

async function fetchOrderProductionData(orderId) {
    try {
        const response = await fetch(`/api/production-supervisor/order-production?order_id=${orderId}`);
        if (!response.ok) throw new Error('Failed to load order production data');

        const data = await response.json();

        // User profile setup
        const userFullNameEl = document.getElementById('userFullName');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userFullNameEl) userFullNameEl.textContent = data.user.fullName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        currentOrderId = data.order.id;

        // Order Summary Setup
        document.getElementById('orderCode').textContent = data.order.orderCode;
        document.getElementById('orderClient').textContent = data.order.orderClient;
        document.getElementById('itemLabel').textContent = data.order.itemLabel;

        const flavorTagEl = document.getElementById('flavorTag');
        const variationTagEl = document.getElementById('variationTag');

        if (flavorTagEl) {
            flavorTagEl.textContent = data.order.flavorTag;
            flavorTagEl.className = `tag tag-${data.order.flavorTag.toLowerCase()}`;
        }

        if (variationTagEl) {
            variationTagEl.textContent = data.order.variationTag;
            variationTagEl.className = `tag tag-${data.order.variationTag.toLowerCase()}`;
        }

        // Render Materials Inventory
        renderMaterials(data.materials);

    } catch (error) {
        console.error('Error fetching order production data:', error);
        const container = document.getElementById('materialsList');
        if (container) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Failed to load order materials.</div>';
        }
    }
}

function renderMaterials(materials) {
    const container = document.getElementById('materialsList');
    if (!container) return;

    if (!materials || materials.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No inventory materials recorded.</div>';
        return;
    }

    container.innerHTML = materials.map((mat, index) => {
        const isLast = index === materials.length - 1;

        return `
            <div class="materials-row ${isLast ? 'last-row' : ''}">
                <span class="col-name">${escapeHtml(mat.name)}</span>
                
                <div class="col-amount stepper-wrap">
                    <button type="button" class="btn-stepper btn-minus" onclick="adjustAmount(${mat.id}, -${mat.step}, ${mat.min}, ${mat.max})" title="Decrease">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    
                    <input 
                        type="number" 
                        name="materials[${mat.id}]" 
                        id="input_${mat.id}" 
                        class="amount-input" 
                        value="${mat.amount}" 
                        step="${mat.step}" 
                        min="${mat.min}" 
                        max="${mat.max}"
                        onchange="validateInput(this, ${mat.min}, ${mat.max})"
                    >
                    
                    <button type="button" class="btn-stepper btn-plus" onclick="adjustAmount(${mat.id}, ${mat.step}, ${mat.min}, ${mat.max})" title="Increase">
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>

                <span class="col-unit">${escapeHtml(mat.unit)}</span>
            </div>
        `;
    }).join('');
}

async function handleCompleteOrder(e) {
    e.preventDefault();

    if (currentOrderId <= 0) {
        alert('No active order selected for completion.');
        return;
    }

    const orderCode = document.getElementById('orderCode').textContent;
    if (!confirm(`Confirm and mark order ${orderCode} ready for pickup?`)) {
        return;
    }

    try {
        const response = await fetch('/api/production-supervisor/complete-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: currentOrderId })
        });

        const result = await response.json();
        if (result.status === 'success') {
            window.location.href = `orderList.html?completed=${currentOrderId}`;
        } else {
            alert('Failed to complete order: ' + (result.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error completing order:', error);
        alert('An error occurred while completing the order.');
    }
}

function adjustAmount(id, step, min, max) {
    const inputElem = document.getElementById('input_' + id);
    if (!inputElem) return;

    let currentVal = parseFloat(inputElem.value) || 0;
    let newVal = currentVal + step;

    if (newVal < min) newVal = min;
    if (newVal > max) newVal = max;

    newVal = Math.round(newVal * 10) / 10;
    inputElem.value = newVal;
}

function validateInput(elem, min, max) {
    let val = parseFloat(elem.value) || 0;
    if (val < min) val = min;
    if (val > max) val = max;
    elem.value = val;
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