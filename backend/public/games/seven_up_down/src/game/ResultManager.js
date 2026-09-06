import { gameState } from './GameState.js';
import { soundManager } from '../core/SoundManager.js';
import { apiClient } from '../network/ApiClient.js';
import { eventBus } from '../core/EventBus.js';

class ResultManager {
  processResult(result) {
    if (!result) return;
    const total = typeof result === 'number'
      ? result
      : (result.sum ?? result.total ?? ((result.dice1 || 0) + (result.dice2 || 0)));

    if (!total || isNaN(total)) return;

    const bets = gameState.bets;
    let winAmt = 0;

    if (total >= 2 && total <= 6 && bets.down > 0) {
      winAmt += bets.down * 2;
    }
    if (total === 7 && bets.seven > 0) {
      winAmt += bets.seven * 5;
    }
    if (total >= 8 && total <= 12 && bets.up > 0) {
      winAmt += bets.up * 2;
    }
    if (bets.specific && bets.specific[total]) {
      const oddsMap = { 2: 26, 3: 12, 4: 8, 5: 6, 6: 5, 8: 5, 9: 6, 10: 8, 11: 12, 12: 26 };
      const mult = oddsMap[total] || 6;
      winAmt += bets.specific[total] * mult;
    }

    gameState.addHistoryResult(total);

    if (winAmt > 0) {
      soundManager.playWin();
      const newBal = gameState.userBalance + winAmt;
      gameState.setBalance(newBal);
      eventBus.emit('WIN_OCCURRED', { winAmount: winAmt });
    }

    // Refresh profile balance from backend server to stay 100% synced with DB
    setTimeout(() => {
      apiClient.getUserProfile().then(res => {
        if (res && res.data) {
          const profile = res.data.profile || res.data;
          const balance = profile.balance !== undefined ? profile.balance : (profile.totalBalance !== undefined ? profile.totalBalance : 0);
          gameState.setBalance(balance);
        }
      }).catch(() => {});
    }, 1500);
  }
}

export const resultManager = new ResultManager();
