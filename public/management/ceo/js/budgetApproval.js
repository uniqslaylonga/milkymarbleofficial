let pendingRequestsList = [];
let currentSort = 'none';
let currentSelectedExpenseId = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchCeoBudgetApprovalData();

    const modal = document.getElementById('requestModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'requestModal') closeModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
});

async function fetchCeoBudgetApprovalData() {
    try {
        const response = await fetch('/api/ceo/budget-approval');
        if (!response.ok) throw new Error('Failed to fetch budget approval data');

        const data = await response.json();

        // Update User Profile & Avatar
        document.getElementById('userFullNameDisplay').textContent = data.user.fullName || 'Gabriel Louis M. Espadilla';

        const userAvatarEl = document.getElementById('userAvatarImg');
        if (userAvatarEl && data.user.avatar) {
            let avatarPath = data.user.avatar;
            // Correct the root path to your local folder structure
            if (avatarPath === '/images/account.png' || avatarPath === 'account.png') {
                avatarPath = '../images/account.png';
            }
            userAvatarEl.src = avatarPath;
        }
        // Update Overview Cards
        document.getElementById('statPending').textContent = Number(data.overview.pending || 0).toLocaleString();
        document.getElementById('statApproved').textContent = Number(data.overview.approved || 0).toLocaleString();
        document.getElementById('statRejected').textContent = Number(data.overview.rejected || 0).toLocaleString();

        // Render Pending Requests Grid
        pendingRequestsList = data.pendingRequests || [];
        renderRequestsGrid(pendingRequestsList);

    } catch (error) {
        console.error('Error fetching budget approval data:', error);
        const grid = document.getElementById('requestsGrid');
        if (grid) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: red; font-weight: 500;">
                    Failed to load pending requests.
                </div>
            `;
        }
    }
}

function renderRequestsGrid(requests) {
    const grid = document.getElementById('requestsGrid');
    if (!grid) return;

    if (!requests || requests.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: #7a6564; font-weight: 500;">
                No pending expense requests awaiting CEO approval.
            </div>
        `;
        return;
    }

    grid.innerHTML = requests.map((req, index) => {
        const nameEscaped = escapeHtml(req.name);
        const roleEscaped = escapeHtml(req.role);
        const amountEscaped = escapeHtml(req.amount);
        const purposeEscaped = escapeHtml(req.purpose);

        return `
            <div class="request-card" data-index="${index}" data-amount="${req.amount_raw}" onclick="openModalByIndex(${index})">
                <div class="request-top">
                    <div class="applicant-info">
                        <div class="applicant-avatar"><i class="fa-solid fa-user"></i></div>
                        <div>
                            <div class="applicant-name">${nameEscaped}</div>
                            <div class="applicant-role">${roleEscaped}</div>
                        </div>
                    </div>
                    <div class="request-amount-box">
                        <div class="request-amount">${amountEscaped}</div>
                        <div class="request-subtext">Expense Request</div>
                    </div>
                </div>

                <div class="request-bottom">
                    <div class="request-purpose">Request for <strong>${purposeEscaped}</strong></div>
                    <div class="action-buttons" onclick="event.stopPropagation()">
                        <button type="button" class="btn-icon-action" title="Approve" onclick="handleExpenseAction(${req.id}, 'approve')">
                            <i class="fa-solid fa-check"></i>
                        </button>
                        <button type="button" class="btn-icon-action" title="Reject" onclick="handleExpenseAction(${req.id}, 'reject')">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function openModalByIndex(index) {
    const req = pendingRequestsList[index];
    if (!req) return;

    currentSelectedExpenseId = req.id;

    document.getElementById('modalName').textContent = req.name;
    document.getElementById('modalRole').textContent = req.role;
    document.getElementById('modalAmount').textContent = req.amount;
    document.getElementById('modalPurpose').textContent = req.purpose;
    document.getElementById('modalNotes').textContent = req.notes;
    document.getElementById('modalFilename').textContent = req.filename;
    document.getElementById('modalFilesize').textContent = req.filesize;

    const modal = document.getElementById('requestModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeModal() {
    const modal = document.getElementById('requestModal');
    if (modal) {
        modal.classList.remove('active');
    }
    currentSelectedExpenseId = null;
}

async function handleExpenseAction(expenseId, action) {
    try {
        const response = await fetch('/api/ceo/budget-approval/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expense_id: expenseId, action: action })
        });

        const data = await response.json();
        if (data.status === 'success') {
            closeModal();
            fetchCeoBudgetApprovalData();
        } else {
            alert('Action failed: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error executing budget decision:', error);
        alert('Network error submitting request decision.');
    }
}

function submitModalDecision(action) {
    if (currentSelectedExpenseId) {
        handleExpenseAction(currentSelectedExpenseId, action);
    }
}

function toggleSort() {
    const grid = document.getElementById('requestsGrid');
    const cards = Array.from(grid.getElementsByClassName('request-card'));
    const wrapper = document.querySelector('.sort-btn-wrapper');
    const btn = document.getElementById('sortToggleBtn');
    const icon = document.getElementById('sortIcon');

    if (!cards || cards.length === 0) return;

    if (currentSort === 'none') {
        currentSort = 'desc';
        btn.classList.add('active');
        icon.className = 'fa-solid fa-arrow-down-wide-short';
        wrapper.setAttribute('data-tooltip', 'Highest to Lowest');
        cards.sort((a, b) => parseFloat(b.dataset.amount) - parseFloat(a.dataset.amount));
    } else if (currentSort === 'desc') {
        currentSort = 'asc';
        btn.classList.add('active');
        icon.className = 'fa-solid fa-arrow-up-wide-short';
        wrapper.setAttribute('data-tooltip', 'Lowest to Highest');
        cards.sort((a, b) => parseFloat(a.dataset.amount) - parseFloat(b.dataset.amount));
    } else {
        currentSort = 'none';
        btn.classList.remove('active');
        icon.className = 'fa-solid fa-arrow-down-wide-short';
        wrapper.setAttribute('data-tooltip', 'Sort: Highest to Lowest');
        cards.sort((a, b) => parseInt(a.dataset.index, 10) - parseInt(b.dataset.index, 10));
    }

    cards.forEach(card => grid.appendChild(card));
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