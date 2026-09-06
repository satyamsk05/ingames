let adminToken = localStorage.getItem('ingames_admin_token') || null;
let currentTab = 'overview';
let cachedUsers = [];

document.addEventListener('DOMContentLoaded', () => {
  if (adminToken) {
    showApp();
  } else {
    showLogin();
  }
});

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  loadTab(currentTab);
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('adminUser').value;
  const password = document.getElementById('adminPass').value;
  const errDiv = document.getElementById('loginError');
  errDiv.style.display = 'none';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const json = await res.json();
    if (json.success && json.data && json.data.token) {
      adminToken = json.data.token;
      localStorage.setItem('ingames_admin_token', adminToken);
      showApp();
    } else {
      errDiv.innerText = json.error?.message || 'Login failed';
      errDiv.style.display = 'block';
    }
  } catch (err) {
    errDiv.innerText = 'Network error connecting to backend';
    errDiv.style.display = 'block';
  }
}

function handleLogout() {
  adminToken = null;
  localStorage.removeItem('ingames_admin_token');
  showLogin();
}

function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-page').forEach(el => el.style.display = 'none');

  const activeBtn = document.querySelector(`.nav-item[onclick="switchTab('${tabName}')"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const page = document.getElementById(`tab-${tabName}`);
  if (page) page.style.display = 'block';

  const titles = {
    overview: ['Overview & Analytics', 'Live platform metrics & performance overview'],
    users: ['Users & Balances', 'Manage player accounts, adjust cash & block fraud users'],
    withdrawals: ['Payouts & Withdrawals', 'Manage pending UPI withdrawal approval requests'],
    games: ['Game Control & Config', 'Enable/disable games and set bet limits'],
  };

  if (titles[tabName]) {
    document.getElementById('tabTitle').innerText = titles[tabName][0];
    document.getElementById('tabSub').innerText = titles[tabName][1];
  }

  loadTab(tabName);
}

function refreshCurrentTab() {
  loadTab(currentTab);
}

async function apiFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  options.headers['Authorization'] = `Bearer ${adminToken}`;
  options.headers['Content-Type'] = 'application/json';

  const res = await fetch(endpoint, options);
  if (res.status === 401 || res.status === 403) {
    handleLogout();
    throw new Error('Unauthorized');
  }
  return await res.json();
}

function loadTab(tabName) {
  if (tabName === 'overview') loadOverview();
  else if (tabName === 'users') loadUsers();
  else if (tabName === 'withdrawals') loadWithdrawals();
  else if (tabName === 'games') loadGames();
}

async function loadOverview() {
  try {
    const json = await apiFetch('/api/admin/stats');
    if (json.success && json.data) {
      const d = json.data;
      document.getElementById('statUsers').innerText = d.totalUsers || 0;
      document.getElementById('statDeposits').innerText = `₹${(d.totalDeposits || 0).toLocaleString()}`;
      document.getElementById('statWithdrawals').innerText = `₹${(d.totalWithdrawals || 0).toLocaleString()}`;
      document.getElementById('statProfit').innerText = `₹${(d.netProfit || 0).toLocaleString()}`;
    }
  } catch (_) {}
}

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  try {
    const json = await apiFetch('/api/admin/users');
    if (json.success && Array.isArray(json.data)) {
      cachedUsers = json.data;
      renderUsersTable(cachedUsers);
    } else {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center">No users found.</td></tr>';
    }
  } catch (_) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-red">Failed to load users.</td></tr>';
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">No users found.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <img src="${u.avatarPath}" style="width:28px; height:28px; border-radius:50%; object-fit:cover;" onerror="this.src='/avatars/avatar_1.png'" />
          <strong>${u.username}</strong>
        </div>
      </td>
      <td>${u.phone}</td>
      <td><strong style="color:#00e676;">₹${(u.wallet.totalBalance || 0).toFixed(2)}</strong></td>
      <td>₹${(u.wallet.cashBalance || 0).toFixed(2)}</td>
      <td>₹${(u.wallet.winningsBalance || 0).toFixed(2)}</td>
      <td>₹${(u.wallet.bonusBalance || 0).toFixed(2)}</td>
      <td>
        <span class="stat-badge ${u.isBlocked ? 'red' : 'green'}">${u.isBlocked ? 'BLOCKED' : 'ACTIVE'}</span>
      </td>
      <td>
        <button class="btn-action-sm purple" onclick="openBalanceModal('${u.id}', '${u.username}')">💰 Adjust Cash</button>
        <button class="btn-action-sm ${u.isBlocked ? 'green' : 'red'}" onclick="toggleUserBlock('${u.id}', ${!u.isBlocked})">
          ${u.isBlocked ? 'Unblock' : 'Block'}
        </button>
      </td>
    </tr>
  `).join('');
}

function filterUsers() {
  const query = document.getElementById('userSearch').value.toLowerCase();
  const filtered = cachedUsers.filter(u => 
    u.username.toLowerCase().includes(query) || u.phone.includes(query)
  );
  renderUsersTable(filtered);
}

function openBalanceModal(userId, username) {
  document.getElementById('editUserId').value = userId;
  document.getElementById('editUserName').value = username;
  document.getElementById('editAmount').value = '';
  document.getElementById('editNote').value = '';
  document.getElementById('balanceModal').style.display = 'flex';
}

function closeBalanceModal() {
  document.getElementById('balanceModal').style.display = 'none';
}

async function submitBalanceUpdate(e) {
  e.preventDefault();
  const userId = document.getElementById('editUserId').value;
  const action = document.getElementById('editAction').value;
  const type = document.getElementById('editCategory').value;
  const amount = parseFloat(document.getElementById('editAmount').value);
  const note = document.getElementById('editNote').value;

  try {
    const json = await apiFetch('/api/admin/users/update-balance', {
      method: 'POST',
      body: JSON.stringify({ userId, action, type, amount, note }),
    });

    if (json.success) {
      closeBalanceModal();
      loadUsers();
      alert('User balance updated successfully!');
    } else {
      alert(json.error?.message || 'Failed to update balance');
    }
  } catch (err) {
    alert('Failed to update balance');
  }
}

async function toggleUserBlock(userId, isBlocked) {
  if (!confirm(`Are you sure you want to ${isBlocked ? 'BLOCK' : 'UNBLOCK'} this user?`)) return;

  try {
    const json = await apiFetch('/api/admin/users/toggle-block', {
      method: 'POST',
      body: JSON.stringify({ userId, isBlocked }),
    });

    if (json.success) {
      loadUsers();
    }
  } catch (_) {}
}

async function loadWithdrawals() {
  const tbody = document.getElementById('withdrawalsTableBody');
  try {
    const json = await apiFetch('/api/admin/withdrawals');
    if (json.success && Array.isArray(json.data)) {
      if (json.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No pending withdrawal requests.</td></tr>';
        return;
      }

      tbody.innerHTML = json.data.map(w => `
        <tr>
          <td><code>${w.id}</code></td>
          <td>${w.user_id}</td>
          <td><strong>${w.upi_id || 'N/A'}</strong></td>
          <td><strong style="color:#ff9800;">₹${w.amount}</strong></td>
          <td><span class="stat-badge ${w.status === 'APPROVED' ? 'green' : (w.status === 'REJECTED' ? 'red' : 'orange')}">${w.status}</span></td>
          <td>${new Date(w.created_at).toLocaleString()}</td>
          <td>
            ${w.status === 'PENDING' ? `
              <button class="btn-action-sm green" onclick="approveWithdrawal('${w.id}')">✓ Approve</button>
              <button class="btn-action-sm red" onclick="rejectWithdrawal('${w.id}')">✕ Reject</button>
            ` : '-'}
          </td>
        </tr>
      `).join('');
    }
  } catch (_) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Failed to load requests.</td></tr>';
  }
}

async function approveWithdrawal(requestId) {
  if (!confirm('Approve this withdrawal payout request?')) return;
  try {
    const json = await apiFetch('/api/admin/withdrawals/approve', {
      method: 'POST',
      body: JSON.stringify({ requestId }),
    });
    if (json.success) loadWithdrawals();
  } catch (_) {}
}

async function rejectWithdrawal(requestId) {
  const reason = prompt('Enter rejection reason (User will be refunded):', 'Details invalid');
  if (!reason) return;

  try {
    const json = await apiFetch('/api/admin/withdrawals/reject', {
      method: 'POST',
      body: JSON.stringify({ requestId, reason }),
    });
    if (json.success) loadWithdrawals();
  } catch (_) {}
}

async function loadGames() {
  const grid = document.getElementById('gamesConfigGrid');
  try {
    const json = await apiFetch('/api/admin/games/configs');
    if (json.success && Array.isArray(json.data)) {
      grid.innerHTML = json.data.map(g => `
        <div class="game-config-card">
          <div class="game-info">
            <img src="${g.imagePath}" class="game-img" />
            <div>
              <h4 style="font-size:16px;">${g.title}</h4>
              <span class="stat-badge ${g.isAvailable ? 'green' : 'orange'}">${g.isAvailable ? 'ACTIVE' : 'DISABLED'}</span>
            </div>
          </div>
          <div>
            <span style="font-size:12px; color:#aaa;">Status: Active</span>
          </div>
        </div>
      `).join('');
    }
  } catch (_) {}
}
