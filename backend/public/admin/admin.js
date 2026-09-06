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
  switchTab(currentTab);
}

function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('adminUser').value;
  const password = document.getElementById('adminPass').value;
  const errDiv = document.getElementById('loginError');
  errDiv.style.display = 'none';

  fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  .then(res => res.json())
  .then(json => {
    if (json.success && json.data && json.data.token) {
      adminToken = json.data.token;
      localStorage.setItem('ingames_admin_token', adminToken);
      showApp();
    } else {
      errDiv.innerText = json.error?.message || json.message || 'Invalid admin credentials';
      errDiv.style.display = 'block';
    }
  })
  .catch(() => {
    errDiv.innerText = 'Unable to connect to server backend';
    errDiv.style.display = 'block';
  });
}

function handleLogout() {
  adminToken = null;
  localStorage.removeItem('ingames_admin_token');
  showLogin();
}

function switchTab(tabName) {
  currentTab = tabName;
  
  // Update sidebar active buttons
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeBtn = document.getElementById(`nav-${tabName}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Show selected tab page
  document.querySelectorAll('.tab-page').forEach(el => el.style.display = 'none');
  const page = document.getElementById(`tab-${tabName}`);
  if (page) page.style.display = 'block';

  // Update header text
  const titles = {
    overview: ['Overview & Analytics', 'Real-time gaming platform performance summary'],
    users: ['Users & Wallet Accounts', 'Manage player accounts, adjust balance & account status'],
    withdrawals: ['UPI Withdrawal Payouts', 'Review and process user cashout requests'],
    games: ['Game Config & Status', 'Live game availability and bet limits control'],
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
      document.getElementById('statDeposits').innerText = `₹${(d.totalDeposits || 0).toLocaleString('en-IN')}`;
      document.getElementById('statWithdrawals').innerText = `₹${(d.totalWithdrawals || 0).toLocaleString('en-IN')}`;
      document.getElementById('statProfit').innerText = `₹${(d.netProfit || 0).toLocaleString('en-IN')}`;
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
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No users registered in database.</td></tr>';
    }
  } catch (_) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty text-orange">Unable to load users data.</td></tr>';
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!users || users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No matching users found.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="avatar-sm" style="background: rgba(99, 102, 241, 0.2); color: #818cf8;">${(u.username || 'U').substring(0, 2).toUpperCase()}</div>
          <div>
            <strong style="color: #fff; font-weight: 600;">${u.username || 'User'}</strong>
            <div style="font-size: 11px; color: var(--text-dim);">ID: ${u.id.substring(0, 8)}...</div>
          </div>
        </div>
      </td>
      <td><span style="font-family: monospace; font-weight: 600;">${u.phone}</span></td>
      <td><strong style="color:#10b981; font-size: 14px;">₹${(u.wallet?.totalBalance || 0).toLocaleString('en-IN')}</strong></td>
      <td>₹${(u.wallet?.cashBalance || 0).toLocaleString('en-IN')}</td>
      <td>₹${(u.wallet?.winningsBalance || 0).toLocaleString('en-IN')}</td>
      <td>₹${(u.wallet?.bonusBalance || 0).toLocaleString('en-IN')}</td>
      <td>
        <span class="badge-status ${u.isBlocked ? 'red' : 'green'}">${u.isBlocked ? 'Blocked' : 'Active'}</span>
      </td>
      <td style="text-align: right;">
        <button class="btn-action-sm purple" onclick="openBalanceModal('${u.id}', '${u.username || u.phone}')">💳 Balance</button>
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
    (u.username && u.username.toLowerCase().includes(query)) || 
    (u.phone && u.phone.includes(query)) ||
    (u.id && u.id.toLowerCase().includes(query))
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
      loadOverview();
    } else {
      alert(json.error?.message || json.message || 'Failed to update balance');
    }
  } catch (err) {
    alert('Error updating user balance');
  }
}

async function toggleUserBlock(userId, isBlocked) {
  if (!confirm(`Confirm action: ${isBlocked ? 'BLOCK' : 'UNBLOCK'} user?`)) return;

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
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No pending withdrawal requests.</td></tr>';
        return;
      }

      tbody.innerHTML = json.data.map(w => `
        <tr>
          <td><code style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">${w.id.substring(0, 8)}</code></td>
          <td><span style="font-weight: 600;">${w.user_id}</span></td>
          <td><strong style="color: #60a5fa;">${w.upi_id || 'N/A'}</strong></td>
          <td><strong style="color: #f59e0b; font-size: 14px;">₹${(w.amount || 0).toLocaleString('en-IN')}</strong></td>
          <td><span class="badge-status ${w.status === 'APPROVED' ? 'green' : (w.status === 'REJECTED' ? 'red' : 'orange')}">${w.status}</span></td>
          <td>${new Date(w.created_at).toLocaleString()}</td>
          <td style="text-align: right;">
            ${w.status === 'PENDING' ? `
              <button class="btn-action-sm green" onclick="approveWithdrawal('${w.id}')">Approve</button>
              <button class="btn-action-sm red" onclick="rejectWithdrawal('${w.id}')">Reject</button>
            ` : '<span style="color: var(--text-dim); font-size: 12px;">Processed</span>'}
          </td>
        </tr>
      `).join('');
    }
  } catch (_) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Failed to load withdrawal requests.</td></tr>';
  }
}

async function approveWithdrawal(requestId) {
  if (!confirm('Approve this withdrawal cashout payout?')) return;
  try {
    const json = await apiFetch('/api/admin/withdrawals/approve', {
      method: 'POST',
      body: JSON.stringify({ requestId }),
    });
    if (json.success) {
      loadWithdrawals();
      loadOverview();
    }
  } catch (_) {}
}

async function rejectWithdrawal(requestId) {
  const reason = prompt('Reason for rejection (Amount will be refunded to user):', 'UPI details mismatch');
  if (!reason) return;

  try {
    const json = await apiFetch('/api/admin/withdrawals/reject', {
      method: 'POST',
      body: JSON.stringify({ requestId, reason }),
    });
    if (json.success) {
      loadWithdrawals();
      loadOverview();
    }
  } catch (_) {}
}

async function loadGames() {
  const grid = document.getElementById('gamesConfigGrid');
  try {
    const json = await apiFetch('/api/admin/games/configs');
    if (json.success && Array.isArray(json.data)) {
      grid.innerHTML = json.data.map(g => `
        <div class="game-config-card">
          <div class="game-card-top">
            <div class="game-info">
              <div class="game-icon-box">🎲</div>
              <div>
                <div class="game-title">${g.title || g.gameId}</div>
                <div class="game-id">ID: ${g.gameId}</div>
              </div>
            </div>
            <span class="badge-status ${g.isAvailable ? 'green' : 'orange'}">
              ${g.isAvailable ? 'Active' : 'Maintenance'}
            </span>
          </div>

          <div class="bet-inputs-row">
            <div class="bet-input-wrap">
              <label>Min Bet (₹)</label>
              <input type="number" id="minBet_${g.gameId}" value="${g.minBet || 10}" />
            </div>
            <div class="bet-input-wrap">
              <label>Max Bet (₹)</label>
              <input type="number" id="maxBet_${g.gameId}" value="${g.maxBet || 10000}" />
            </div>
          </div>

          <div style="display:flex; gap:8px; margin-top:8px;">
            <button class="btn-secondary" style="flex:1; font-size:12px; padding:6px;" onclick="updateGameConfig('${g.gameId}', ${!g.isAvailable})">
              ${g.isAvailable ? 'Disable' : 'Enable'}
            </button>
            <button class="btn-primary" style="flex:1; font-size:12px; padding:6px;" onclick="saveGameBetLimits('${g.gameId}', ${g.isAvailable})">
              Save Limits
            </button>
          </div>
        </div>
      `).join('');
    }
  } catch (_) {
    grid.innerHTML = '<div style="color:var(--text-muted);">Failed to load game configurations.</div>';
  }
}

async function updateGameConfig(gameId, isAvailable) {
  const minBet = parseFloat(document.getElementById(`minBet_${gameId}`).value) || 10;
  const maxBet = parseFloat(document.getElementById(`maxBet_${gameId}`).value) || 10000;
  try {
    const json = await apiFetch(`/api/admin/games/configs/${gameId}`, {
      method: 'POST',
      body: JSON.stringify({ isAvailable, minBet, maxBet }),
    });
    if (json.success) loadGames();
  } catch (_) {}
}

async function saveGameBetLimits(gameId, currentAvailability) {
  updateGameConfig(gameId, currentAvailability);
}
