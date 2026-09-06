class ApiClient {
  getToken() {
    if (typeof window === 'undefined') return null;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tokenFromUrl = urlParams.get('token');
      if (tokenFromUrl) {
        localStorage.setItem('ingames_token', tokenFromUrl);
        return tokenFromUrl;
      }
      if (window.IN_GAMES_AUTH_TOKEN) return window.IN_GAMES_AUTH_TOKEN;
      return localStorage.getItem('ingames_token');
    } catch (_) {
      return window.IN_GAMES_AUTH_TOKEN || null;
    }
  }

  getBaseUrl() {
    if (typeof window !== 'undefined' && window.IN_GAMES_SERVER_URL) {
      return window.IN_GAMES_SERVER_URL.replace(/\/$/, '');
    }
    return '';
  }

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async getUserProfile() {
    try {
      const res = await fetch(this.getBaseUrl() + '/api/user/profile', {
        headers: this.getHeaders()
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async getCurrentRound() {
    try {
      const res = await fetch(this.getBaseUrl() + '/api/games/7updown/current-round', {
        headers: this.getHeaders()
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async placeBet({ roundId, betType, stakeAmount, idempotencyKey }) {
    try {
      const res = await fetch(this.getBaseUrl() + '/api/games/join', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          gameId: 'game_7_up_down',
          roundId,
          betType,
          stakeAmount,
          idempotencyKey: idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp_${Date.now()}_${Math.random()}`)
        })
      });
      const json = await res.json();
      if (json && json.success && json.data && json.data.wallet) {
        const bal = json.data.wallet.totalBalance !== undefined ? json.data.wallet.totalBalance : json.data.wallet.cashBalance;
        this.notifyParentWallet(bal);
      }
      return json;
    } catch (e) {
      return null;
    }
  }

  notifyParentWallet(balance) {
    if (typeof window !== 'undefined') {
      const msg = JSON.stringify({
        source: 'ingames-game',
        version: 1,
        type: 'WALLET_UPDATED',
        balance
      });
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(msg, '*');
        }
      } catch (_) {}
      try {
        if (window.InGamesNativeBridge && typeof window.InGamesNativeBridge.postMessage === 'function') {
          window.InGamesNativeBridge.postMessage(msg);
        }
      } catch (_) {}
    }
  }
}

export const apiClient = new ApiClient();
