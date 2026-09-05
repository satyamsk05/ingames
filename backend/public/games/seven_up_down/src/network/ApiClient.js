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
      return localStorage.getItem('ingames_token');
    } catch (_) {
      return null;
    }
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
      const res = await fetch('/api/user/profile', {
        headers: this.getHeaders()
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async joinGame(gameId, betType, entryFee) {
    try {
      const res = await fetch('/api/games/join', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ gameId, betType, entryFee })
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async claimWinnings({ score, prizeAmount, diceResult, gameTitle }) {
    try {
      const res = await fetch('/api/games/claim-winnings', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ score, prizeAmount, diceResult, gameTitle })
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  notifyParentWallet(balance) {
    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage({
        source: 'ingames-game',
        version: 1,
        type: 'WALLET_UPDATED',
        balance
      }, '*');
    }
  }
}

export const apiClient = new ApiClient();
