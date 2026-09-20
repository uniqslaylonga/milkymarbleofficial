let allPlans = [];
let filteredPlans = [];
let currentPlanPage = 1;
const PLANS_PAGE_SIZE = 5;

document.addEventListener('DOMContentLoaded', () => {
    fetchProductionPlanningData();

    // Set default add due date to today
    const addDueDateInput = document.getElementById('addDueDate');
    if (addDueDateInput) {
        addDueDateInput.value = new Date().toISOString().split('T')[0];
    }

    // View switchers (Board vs List)
    const btnBoard = document.getElementById('btnViewBoard');
    const btnList = document.getElementById('btnViewList');

    if (btnBoard) btnBoard.addEventListener('click', () => switchPlanView('board'));
    if (btnList) btnList.addEventListener('click', () => switchPlanView('list'));

    // Recipe selection auto-fill handler
    const recipeSelect = document.getElementById('recipeSelect');
    if (recipeSelect) {
        recipeSelect.addEventListener('change', function() {
            if (this.value) {
                document.getElementById('addOpInput').value = this.value;
                if (this.value.includes('Tapioca Pearls')) {
                    document.getElementById('addYieldInput').value = '2.5 kg (50 cups yield)';
                } else if (this.value.includes('Assam Black Tea')) {
                    document.getElementById('addYieldInput').value = '6.0 Liters (~30 cups)';
                } else if (this.value.includes('Jasmine Green Tea')) {
                    document.getElementById('addYieldInput').value = '5.0 Liters (~25 cups)';
                } else if (this.value.includes('Gulaman')) {
                    document.getElementById('addYieldInput').value = '2 Trays molded';
                }
            }
        });
    }

    // Form Submissions
    document.getElementById('addPlanForm')?.addEventListener('submit', handleAddPlan);
    document.getElementById('editPlanForm')?.addEventListener('submit', handleEditPlan);

    // Search input filtering
    document.getElementById('planningSearchInput')?.addEventListener('input', filterPlans);

    // Timeline Filter
    document.getElementById('timeRangeFilter')?.addEventListener('change', filterByTimeRange);

    // Pagination buttons
    const prevBtn = document.getElementById('prevPlanBtn');
    const nextBtn = document.getElementById('nextPlanBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPlanPage > 1) {
                currentPlanPage--;
                renderListTable();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredPlans.length / PLANS_PAGE_SIZE) || 1;
            if (currentPlanPage < totalPages) {
                currentPlanPage++;
                renderListTable();
            }
        });
    }
});

async function fetchProductionPlanningData() {
    try {
        let response;
        if (typeof employeeFetch === 'function') {
            response = await employeeFetch('/api/production-supervisor/production-planning');
        } else {
            const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
            const headers = userId ? { 'x-user-id': userId } : {};
            response = await fetch('/api/production-supervisor/production-planning', { headers });
        }

        if (!response.ok) throw new Error(await EmployeeUI.errorMessage(response));

        const data = await response.json();

        // User profile setup
        const userFullNameEl = document.getElementById('userFullName');
        const userAvatarEl = document.getElementById('userAvatar');
        if (userFullNameEl) userFullNameEl.textContent = data.user.fullName || 'Production Supervisor';
        if (userAvatarEl && data.user.avatarSrc) userAvatarEl.src = data.user.avatarSrc;

        allPlans = data.allPlans || [];
        filteredPlans = [...allPlans];

        renderAllViews();

    } catch (error) {
        console.error('Could not load live data from the server:', error);
        if (window.EmployeeUI) { EmployeeUI.showError(error); EmployeeUI.failTables(); }
    }
}

function renderAllViews() {
    renderKanbanBoard();
    renderListTable();
    updateKpiBadges();
}

function renderKanbanBoard() {
    const scheduledContainer = document.getElementById('scheduledPlansList');
    const inProgressContainer = document.getElementById('inProgressPlansList');
    const readyContainer = document.getElementById('readyPlansList');

    const scheduled = filteredPlans.filter(p => p.status === 'PLANNED');
    const inProgress = filteredPlans.filter(p => p.status === 'IN PROGRESS');
    const ready = filteredPlans.filter(p => p.status === 'COMPLETED');

    document.getElementById('scheduledCount').textContent = scheduled.length;
    document.getElementById('inProgressCount').textContent = inProgress.length;
    document.getElementById('readyCount').textContent = ready.length;

    renderColumnCards(scheduledContainer, scheduled, 'scheduled');
    renderColumnCards(inProgressContainer, inProgress, 'inProgress');
    renderColumnCards(readyContainer, ready, 'ready');
}

function renderColumnCards(container, plans, stageType) {
    if (!container) return;

    if (!plans || plans.length === 0) {
        container.innerHTML = `<div class="loading-state-text">No batches in this stage.</div>`;
        return;
    }

    container.innerHTML = plans.map(plan => {
        let cardClass = '';
        let nextBtnLabel = 'Advance ➔';
        let nextStatus = 'IN PROGRESS';

        if (stageType === 'inProgress') {
            cardClass = 'active-stage';
            nextBtnLabel = 'Mark in Warmer ✓';
            nextStatus = 'COMPLETED';
        } else if (stageType === 'ready') {
            cardClass = 'ready-stage';
            nextBtnLabel = 'Re-boil / Reset';
            nextStatus = 'IN PROGRESS';
        }

        return `
            <div class="plan-card ${cardClass}">
                <div class="card-top">
                    <span class="card-time"><i class="fa-regular fa-clock"></i> ${escapeHtml(plan.schedule_time)}</span>
                    <span class="status-pill badge-${stageType === 'ready' ? 'complete' : (stageType === 'inProgress' ? 'progress' : 'planned')}">
                        ${escapeHtml(plan.status)}
                    </span>
                </div>
                <div class="card-title">${escapeHtml(plan.operation)}</div>
                <div><span class="card-yield-info">Yield: <strong>${escapeHtml(plan.yield_volume || 'Standard')}</strong></span></div>
                <div class="card-bottom">
                    <button type="button" class="btn-stage-advance" onclick="advanceBatchStage(${plan.id}, '${nextStatus}')">
                        ${nextBtnLabel}
                    </button>
                    <button class="btn-edit-plan" onclick="openEditPlanByData('${plan.id}')" title="Edit Run">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderListTable() {
    const tbody = document.getElementById('allPlansTableBody');
    const pageInfo = document.getElementById('planPageInfo');
    const prevBtn = document.getElementById('prevPlanBtn');
    const nextBtn = document.getElementById('nextPlanBtn');

    if (!tbody) return;

    if (filteredPlans.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-state-text">No scheduled batch cooking runs found.</td></tr>';
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 plans';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        renderPlanPagerButtons(1, 1);
        return;
    }

    const totalPages = Math.ceil(filteredPlans.length / PLANS_PAGE_SIZE) || 1;
    const startIndex = (currentPlanPage - 1) * PLANS_PAGE_SIZE;
    const pageItems = filteredPlans.slice(startIndex, startIndex + PLANS_PAGE_SIZE);

    if (pageInfo) {
        const startNum = startIndex + 1;
        const endNum = Math.min(startIndex + PLANS_PAGE_SIZE, filteredPlans.length);
        pageInfo.textContent = `Showing ${startNum}-${endNum} of ${filteredPlans.length} plans`;
    }
    if (prevBtn) prevBtn.disabled = currentPlanPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPlanPage >= totalPages;

    renderPlanPagerButtons(totalPages, currentPlanPage);

    tbody.innerHTML = pageItems.map(p => {
        const status = String(p.status || '').toUpperCase();
        let badgeClass = 'badge-planned';
        if (status === 'IN PROGRESS') badgeClass = 'badge-progress';
        else if (status === 'COMPLETED') badgeClass = 'badge-complete';

        return `
            <tr>
                <td><strong>${escapeHtml(p.order_code || 'BATCH-RUN')}</strong></td>
                <td>
                    <div style="font-weight: 700; color: var(--text-dark);">${escapeHtml(p.operation)}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(p.holding_note || '')}</div>
                </td>
                <td><strong style="color: var(--brown-soft);">${escapeHtml(p.yield_volume || 'N/A')}</strong></td>
                <td><span style="font-size: 11.5px; font-weight: 700; color: var(--text-muted);">${formatDate(p.due_date)} · ${escapeHtml(p.schedule_time || '07:30 AM')}</span></td>
                <td><span class="status-pill ${badgeClass}">${escapeHtml(status)}</span></td>
                <td style="text-align: right;">
                    <button class="btn-edit-plan" onclick="openEditPlanByData('${p.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPlanPagerButtons(totalPages, activePage) {
    const pagerNumbers = document.getElementById('planPagerNumbers');
    if (!pagerNumbers) return;

    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        const isActive = i === activePage ? 'active' : '';
        html += `<button type="button" class="pager-num-btn ${isActive}" data-page="${i}">${i}</button>`;
    }
    pagerNumbers.innerHTML = html;

    pagerNumbers.querySelectorAll('.pager-num-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const page = parseInt(e.currentTarget.getAttribute('data-page'), 10);
            if (page && page !== currentPlanPage) {
                currentPlanPage = page;
                renderListTable();
            }
        });
    });
}

function updateKpiBadges() {
    document.getElementById('totalRunsCount').textContent = `${allPlans.length} Runs`;
}

function advanceBatchStage(planId, newStatus) {
    const plan = allPlans.find(p => p.id === planId);
    if (plan) {
        plan.status = newStatus;
        renderAllViews();
    }
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
        listArea.style.display = 'flex';
        btnList.classList.add('active');
        btnBoard.classList.remove('active');
    }
}

function filterPlans() {
    const q = document.getElementById('planningSearchInput')?.value.toLowerCase().trim() || '';
    filteredPlans = allPlans.filter(p => {
        if (!q) return true;
        const op = (p.operation || '').toLowerCase();
        const code = (p.order_code || '').toLowerCase();
        const y = (p.yield_volume || '').toLowerCase();
        return op.includes(q) || code.includes(q) || y.includes(q);
    });
    currentPlanPage = 1;
    renderAllViews();
}

function filterByTimeRange() {
    const filter = document.getElementById('timeRangeFilter')?.value;
    if (filter === 'tue_run') {
        filteredPlans = allPlans.filter(p => (p.operation || '').includes('Tapioca') || (p.operation || '').includes('Assam'));
    } else if (filter === 'thu_run') {
        filteredPlans = allPlans.filter(p => (p.operation || '').includes('Jasmine') || (p.operation || '').includes('Gulaman'));
    } else {
        filteredPlans = [...allPlans];
    }
    currentPlanPage = 1;
    renderAllViews();
}

async function handleAddPlan(e) {
    e.preventDefault();

    const operation = document.getElementById('addOpInput').value.trim();
    const yield_volume = document.getElementById('addYieldInput').value.trim();
    const due_date = document.getElementById('addDueDate').value;
    const schedule_time = document.getElementById('addScheduleTime').value;
    const status = document.getElementById('addStatus').value;

    const newPlan = {
        id: Date.now(),
        order_code: `BATCH-B0${allPlans.length + 1}`,
        operation,
        yield_volume,
        due_date,
        schedule_time,
        status,
        holding_note: 'Assigned to morning cook'
    };

    allPlans.push(newPlan);
    filteredPlans = [...allPlans];
    renderAllViews();
    closeModal('addPlanModal');
    e.target.reset();

    alert(`Batch cooking plan for "${operation}" scheduled successfully!`);
}

function openEditPlanByData(planId) {
    const plan = allPlans.find(p => String(p.id) === String(planId));
    if (!plan) return;

    document.getElementById('editPlanId').value = plan.id;
    document.getElementById('editProductName').value = plan.operation || '';
    document.getElementById('editYieldInput').value = plan.yield_volume || '';
    document.getElementById('editDueDate').value = plan.due_date ? plan.due_date.split('T')[0] : new Date().toISOString().split('T')[0];
    document.getElementById('editScheduleTime').value = plan.schedule_time || '07:30';
    document.getElementById('editStatus').value = plan.status || 'PLANNED';
    openModal('editPlanModal');
}

async function handleEditPlan(e) {
    e.preventDefault();

    const planId = parseInt(document.getElementById('editPlanId').value, 10);
    const plan = allPlans.find(p => p.id === planId);
    if (plan) {
        plan.operation = document.getElementById('editProductName').value.trim();
        plan.yield_volume = document.getElementById('editYieldInput').value.trim();
        plan.due_date = document.getElementById('editDueDate').value;
        plan.schedule_time = document.getElementById('editScheduleTime').value;
        plan.status = document.getElementById('editStatus').value;

        renderAllViews();
        closeModal('editPlanModal');
    }
}

function openModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.classList.remove('open');
        document.body.style.overflow = '';
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
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