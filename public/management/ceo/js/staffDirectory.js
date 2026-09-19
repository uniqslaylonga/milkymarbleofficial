let currentSort = 'none'; // 'none' -> 'desc' (newest) -> 'asc' (oldest)
let activeDepartment = 'all';
let staffEmployeesList = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchCeoStaffDirectoryData();

    // Search input event listener
    const searchInput = document.getElementById('employeeSearchInput');
    if (searchInput) {
        searchInput.addEventListener('keyup', filterEmployees);
    }

    // Close dropdown on outside click
    window.addEventListener('click', (e) => {
        const dropdown = document.getElementById('deptDropdown');
        if (dropdown && !dropdown.contains(e.target)) {
            dropdown.classList.remove('open');
        }
    });
});

async function fetchCeoStaffDirectoryData() {
    try {
        const response = await fetch('/api/ceo/staff-directory');
        if (!response.ok) throw new Error('Failed to fetch staff directory data');

        const data = await response.json();

        // User Profile & Avatar
        document.getElementById('userFullNameDisplay').textContent = data.user.fullName || 'Gabriel Louis M. Espadilla';
        const userAvatarEl = document.getElementById('userAvatarImg');

        if (userAvatarEl && data.user.avatar) {
            let avatarPath = data.user.avatar;
            if (avatarPath === '/images/account.png' || avatarPath === 'account.png') {
                avatarPath = '../images/account.png';
            }
            userAvatarEl.src = avatarPath;
        }

        // Populate Department Menu
        renderDepartmentMenu(data.departments);

        // Populate Employee Rows
        staffEmployeesList = data.employees || [];
        renderEmployeeRows(staffEmployeesList);

    } catch (error) {
        console.error('Error loading CEO staff directory:', error);
        const container = document.getElementById('tableRowsWrapper');
        if (container) {
            container.innerHTML = `
                <div style="padding: 30px; text-align: center; color: red; font-weight: 500;">
                    Failed to load staff records.
                </div>
            `;
        }
    }
}

function renderDepartmentMenu(departments) {
    const menu = document.getElementById('deptMenu');
    if (!menu) return;

    let itemsHtml = `
        <div class="dropdown-item active" onclick="selectDept('all', 'All Departments')">
            <i class="fa-solid fa-layer-group"></i> All Departments
        </div>
    `;

    if (departments && departments.length > 0) {
        departments.forEach(dept => {
            const deptEscaped = escapeHtml(dept);
            itemsHtml += `
                <div class="dropdown-item" onclick="selectDept('${deptEscaped}', '${deptEscaped}')">
                    <i class="fa-solid fa-circle-dot"></i> ${deptEscaped}
                </div>
            `;
        });
    }

    menu.innerHTML = itemsHtml;
}

function renderEmployeeRows(employees) {
    const wrapper = document.getElementById('tableRowsWrapper');
    if (!wrapper) return;

    if (!employees || employees.length === 0) {
        wrapper.innerHTML = `
            <div style="padding: 30px; text-align: center; color: #7a6564; font-weight: 500;">
                No staff records found in the system.
            </div>
        `;
        return;
    }

    wrapper.innerHTML = employees.map((emp, index) => {
        const usernameEscaped = escapeHtml(emp.username);
        const deptEscaped = escapeHtml(emp.department);
        const dateFormattedEscaped = escapeHtml(emp.date_joined_formatted);
        const emailEscaped = escapeHtml(emp.email);
        const avatarEscaped = escapeHtml(emp.avatar || '../images/account.png');

        return `
            <div class="table-row-card" 
                 data-index="${index}" 
                 data-department="${deptEscaped}" 
                 data-date="${emp.date_joined}"
                 data-name="${usernameEscaped.toLowerCase()}"
                 data-email="${emailEscaped.toLowerCase()}">
                <div class="user-cell">
                    <img class="user-cell-avatar" src="${avatarEscaped}" alt="${usernameEscaped}" style="object-fit: cover; border-radius: 50%;">
                    <span class="user-cell-name">${usernameEscaped}</span>
                </div>
                <div class="cell-text">${deptEscaped}</div>
                <div class="cell-text">${dateFormattedEscaped}</div>
                <div class="cell-email">${emailEscaped}</div>
            </div>
        `;
    }).join('');
}

function toggleDeptMenu(e) {
    e.stopPropagation();
    document.getElementById('deptDropdown').classList.toggle('open');
}

function selectDept(deptValue, deptLabel) {
    activeDepartment = deptValue;
    document.getElementById('selectedDeptText').textContent = deptLabel;

    const items = document.querySelectorAll('.dropdown-item');
    items.forEach(item => {
        if (item.textContent.trim().includes(deptLabel)) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    document.getElementById('deptDropdown').classList.remove('open');
    filterEmployees();
}

function toggleDateSort() {
    const wrapper = document.getElementById('tableRowsWrapper');
    const rows = Array.from(wrapper.getElementsByClassName('table-row-card'));
    const btnWrapper = document.querySelector('.sort-btn-wrapper');
    const btn = document.getElementById('dateSortBtn');
    const icon = document.getElementById('dateSortIcon');

    if (!rows || rows.length === 0) return;

    if (currentSort === 'none') {
        currentSort = 'desc';
        btn.classList.add('active');
        icon.className = 'fa-solid fa-arrow-down-wide-short';
        btnWrapper.setAttribute('data-tooltip', 'Newest to Oldest');
        rows.sort((a, b) => new Date(b.dataset.date) - new Date(a.dataset.date));
    } else if (currentSort === 'desc') {
        currentSort = 'asc';
        btn.classList.add('active');
        icon.className = 'fa-solid fa-arrow-up-wide-short';
        btnWrapper.setAttribute('data-tooltip', 'Oldest to Newest');
        rows.sort((a, b) => new Date(a.dataset.date) - new Date(b.dataset.date));
    } else {
        currentSort = 'none';
        btn.classList.remove('active');
        icon.className = 'fa-solid fa-arrow-down-wide-short';
        btnWrapper.setAttribute('data-tooltip', 'Sort: Newest to Oldest');
        rows.sort((a, b) => parseInt(a.dataset.index, 10) - parseInt(b.dataset.index, 10));
    }

    rows.forEach(row => wrapper.appendChild(row));
}

function filterEmployees() {
    const selectedDept = activeDepartment.toLowerCase();
    const searchKeyword = document.getElementById('employeeSearchInput').value.toLowerCase().trim();
    const rows = document.getElementsByClassName('table-row-card');

    Array.from(rows).forEach(row => {
        const deptMatch = selectedDept === 'all' || row.dataset.department.toLowerCase() === selectedDept;
        const searchMatch = !searchKeyword ||
            row.dataset.name.includes(searchKeyword) ||
            row.dataset.email.includes(searchKeyword) ||
            row.dataset.department.toLowerCase().includes(searchKeyword);

        row.style.display = (deptMatch && searchMatch) ? 'grid' : 'none';
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