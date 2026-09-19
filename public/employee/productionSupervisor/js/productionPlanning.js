let allPlans = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchProductionPlanningData();

    // Set default add due date to today
    const addDueDateInput = document.getElementById('addDueDate');
    if (addDueDateInput) {
        addDueDateInput.value = new Date().toISOString().split('T')[0];
    }

    // View switchers
    const btnBoard = document.getElementById('btnViewBoard');
    const btnList = document.getElementById('btnViewList');

    if (btnBoard) btnBoard.addEventListener('click', () => switchPlanView('board'));
    if (btnList) btnList.addEventListener('click', () => switchPlanView('list'));

    // Recipe selection handler
    const recipeSelect = document.getElementById('recipeSelect');
    if (recipeSelect) {
        recipeSelect.addEventListener('change', function() {
            if (this.value) {
                document.getElementById('addOpInput').value = this.value;
            }
        });
    }

    // Form Submissions
    document.getElementById('addPlanForm')?.addEventListener('submit', handleAddPlan);
    document.getElementById('editPlanForm')?.addEventListener('submit', handleEditPlan);

    // Real-time table search filtering
    document.getElementById('planningSearchInput')?.addEventListener('input', filterPlans);
});

async function fetchProductionPlanningData() {
    try {
        const response = await employeeFetch('/api/production-supervisor/production-planning');
        if (!response.ok) throw new Error('Failed to load production planning data');

        const data = await response.json();

        // User profile setup
        const userFullNameEl = document.getElementById('userFullName');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userFullNameEl) userFullNameEl.textContent = data.user.fullName;
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        // Date range display
        document.getElementById('dateRangeText').textContent = data.dateRangeText || '';

        // Recipes dropdown
        populateRecipesDropdown(data.recipesList);

        // Columns and All Plans
        allPlans = data.allPlans || [];
        document.getElementById('todayCount').textContent = data.todayPlans ? data.todayPlans.length : 0;
        document.getElementById('tomorrowCount').textContent = data.tomorrowPlans ? data.tomorrowPlans.length : 0;

        renderBoardCards('todayPlansList', data.todayPlans, true);
        renderBoardCards('tomorrowPlansList', data.tomorrowPlans, false);
        renderListTable(allPlans);

    } catch (error) {
        console.error('Error fetching production planning data:', error);
    }
}

function renderBoardCards(containerId, plans, isToday) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!plans || plans.length === 0) {
        container.innerHTML = `<div style="padding: 16px; color: #888; font-size: 13px;">No tasks scheduled for ${isToday ? 'today' : 'tomorrow'}.</div>`;
        return;
    }

    container.innerHTML = plans.map(plan => {
        const status = String(plan.status || '').toUpperCase();
        let badgeClass = 'badge-planned';
        let statusLabel = 'PLANNED';

        if (status === 'IN PROGRESS') {
            badgeClass = 'badge-progress';
            statusLabel = 'IN PROGRESS';
        } else if (status === 'COMPLETED') {
            badgeClass = 'badge-complete';
            statusLabel = 'COMPLETED';
        }

        const dateStr = isToday ? 'Today' : formatDate(plan.due_date);
        const timeStr = plan.schedule_time || '08:00';
        const jsonPlan = escapeHtml(JSON.stringify(plan));

        return `
            <div class="plan-card">
                <div class="card-top">
                    <span class="card-time">${dateStr} · ${escapeHtml(timeStr)}</span>
                    <span class="status-pill ${badgeClass}">${statusLabel}</span>
                </div>
                <div class="card-indicator-line ${isToday ? '' : 'alt'}"></div>
                <div class="card-title">${escapeHtml(plan.operation)}</div>
                <div class="card-bottom">
                    <button class="btn-edit-plan" onclick="openEditPlanByData('${plan.id}')" title="Edit Run">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderListTable(plans) {
    const tbody = document.getElementById('allPlansTableBody');
    if (!tbody) return;

    if (!plans || plans.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #888;">No scheduled production plans.</td></tr>';
        return;
    }

    tbody.innerHTML = plans.map(p => {
        const status = String(p.status || '').toUpperCase();
        let badgeClass = 'badge-planned';
        if (status === 'IN PROGRESS') badgeClass = 'badge-progress';
        else if (status === 'COMPLETED') badgeClass = 'badge-complete';

        return `
            <tr>
                <td><strong>${escapeHtml(p.order_code)}</strong></td>
                <td>${escapeHtml(p.operation)}</td>
                <td>${formatDate(p.due_date)} · ${escapeHtml(p.schedule_time || '08:00')}</td>
                <td><span class="status-pill ${badgeClass}">${escapeHtml(status)}</span></td>
                <td style="text-align: right;">
                    <button class="btn-edit-plan" onclick="openEditPlanByData('${p.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function populateRecipesDropdown(recipes) {
    const select = document.getElementById('recipeSelect');
    if (!select) return;

    select.innerHTML = '<option value="">-- Choose from Recipes (Optional) --</option>' +
        (recipes || []).map(rec => 
            `<option value="${escapeHtml(rec.flavor_name)} Batch">${escapeHtml(rec.flavor_name)} (Yield: ${rec.yield_servings} cups)</option>`
        ).join('');
}

function switchPlanView(view) {
    const boardArea = document.getElementById('boardViewArea');
    const listArea = document.getElementById('listViewArea');
    const btnBoard = document.getElementById('btnViewBoard');
    const btnList = document.getElementById('btnViewList');

    if (view === 'board') {
        boardArea.style.display = 'grid';
        listArea.style.display = 'none';
        btnBoard.classList.add('active');
        btnList.classList.remove('active');
    } else {
        boardArea.style.display = 'none';
        listArea.style.display = 'block';
        btnList.classList.add('active');
        btnBoard.classList.remove('active');
    }
}

async function handleAddPlan(e) {
    e.preventDefault();

    const operation = document.getElementById('addOpInput').value.trim();
    const due_date = document.getElementById('addDueDate').value;
    const schedule_time = document.getElementById('addScheduleTime').value;
    const status = document.getElementById('addStatus').value;

    if (!operation || !due_date || !schedule_time) {
        alert('Please complete all required fields.');
        return;
    }

    try {
        const response = await employeeFetch('/api/production-supervisor/add-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operation, due_date, schedule_time, status })
        });

        const result = await response.json();
        if (result.status === 'success') {
            closeModal('addPlanModal');
            document.getElementById('addPlanForm').reset();
            fetchProductionPlanningData();
        } else {
            alert('Failed to save plan: ' + (result.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error adding plan:', error);
    }
}

async function handleEditPlan(e) {
    e.preventDefault();

    const plan_id = document.getElementById('editPlanId').value;
    const operation = document.getElementById('editProductName').value.trim();
    const due_date = document.getElementById('editDueDate').value;
    const schedule_time = document.getElementById('editScheduleTime').value;
    const status = document.getElementById('editStatus').value;

    try {
        const response = await employeeFetch('/api/production-supervisor/edit-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id, operation, due_date, schedule_time, status })
        });

        const result = await response.json();
        if (result.status === 'success') {
            closeModal('editPlanModal');
            fetchProductionPlanningData();
        } else {
            alert('Failed to update plan: ' + (result.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error editing plan:', error);
    }
}

function openEditPlanByData(planId) {
    const plan = allPlans.find(p => String(p.id) === String(planId));
    if (!plan) return;

    document.getElementById('editPlanId').value = plan.id;
    document.getElementById('editProductName').value = plan.operation || '';
    document.getElementById('editDueDate').value = plan.due_date ? plan.due_date.split('T')[0] : new Date().toISOString().split('T')[0];
    document.getElementById('editScheduleTime').value = plan.schedule_time || '08:00';
    document.getElementById('editStatus').value = plan.status || 'PENDING';
    openModal('editPlanModal');
}

function filterPlans() {
    const q = this.value.toLowerCase().trim();
    const rows = document.querySelectorAll('#allPlansTableBody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = (!q || text.includes(q)) ? '' : 'none';
    });
}

function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('active');
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal-backdrop')) {
        event.target.classList.remove('active');
    }
};

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
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