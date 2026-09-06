import { gameState } from './GameState.js';
import { diceManager } from './DiceManager.js';
import { timerManager } from './TimerManager.js';
import { resultManager } from './ResultManager.js';
import { apiClient } from '../network/ApiClient.js';
import { eventBus } from '../core/EventBus.js';

class GameEngine {
  constructor() {
    this.currentRoundId = null;
  }

  init() {
    this.fetchUserProfile();
    this.syncCurrentRound();

    eventBus.on('ROUND_CREATED', (round) => {
      this.handleRoundCreated(round);
    });

    eventBus.on('BETTING_CLOSED', () => {
      this.handleBettingClosed();
    });

    eventBus.on('ROUND_RESULT', (result) => {
      this.handleRoundResult(result);
    });
  }

  fetchUserProfile() {
    apiClient.getUserProfile()
      .then(res => {
        if (res && res.data) {
          if (res.data.totalBalance !== undefined) {
            gameState.setBalance(res.data.totalBalance);
          }
          const name = res.data.username || res.data.phoneNumber || 'Player';
          const userNameEl = document.getElementById('userNameText');
          if (userNameEl) {
            userNameEl.innerText = name;
          }
        }
      })
      .catch(() => {});
  }

  syncCurrentRound() {
    apiClient.getCurrentRound()
      .then(res => {
        if (res && res.data) {
          this.handleRoundCreated(res.data);
        }
      })
      .catch(() => {});
  }

  handleRoundCreated(round) {
    if (!round || !round.roundId) return;
    this.currentRoundId = round.roundId;

    if (round.recentHistory && Array.isArray(round.recentHistory) && round.recentHistory.length > 0) {
      gameState.setHistory(round.recentHistory);
    }

    if (round.status === 'BETTING_CLOSED' || round.status === 'RESULT_GENERATED' || (round.timeRemainingSeconds !== undefined && round.timeRemainingSeconds <= 0)) {
      gameState.isRolling = true;
      timerManager.stopTimer();
      eventBus.emit('DICE_ROLL_START');
      return;
    }

    gameState.isRolling = false;
    gameState.resetRoundBets();

    const timeRemaining = round.timeRemainingSeconds !== undefined ? round.timeRemainingSeconds : 15;
    timerManager.startTimer(timeRemaining);
  }

  handleBettingClosed() {
    gameState.isRolling = true;
    timerManager.stopTimer();
    this.submitQueuedBets();
  }

  submitQueuedBets() {
    if (!this.currentRoundId || gameState.totalBet <= 0) return;

    const betPromises = [];
    if (gameState.bets.down > 0) {
      betPromises.push(apiClient.placeBet({ roundId: this.currentRoundId, betType: 'DOWN', stakeAmount: gameState.bets.down }));
    }
    if (gameState.bets.seven > 0) {
      betPromises.push(apiClient.placeBet({ roundId: this.currentRoundId, betType: 'SEVEN', stakeAmount: gameState.bets.seven }));
    }
    if (gameState.bets.up > 0) {
      betPromises.push(apiClient.placeBet({ roundId: this.currentRoundId, betType: 'UP', stakeAmount: gameState.bets.up }));
    }
    for (const num in gameState.bets.specific) {
      if (gameState.bets.specific[num] > 0) {
        betPromises.push(apiClient.placeBet({ roundId: this.currentRoundId, betType: num, stakeAmount: gameState.bets.specific[num] }));
      }
    }

    Promise.all(betPromises).catch(() => {});
  }

  handleRoundResult(result) {
    gameState.isRolling = true;
    timerManager.stopTimer();
    diceManager.rollDiceAnimation(result, (diceResult) => {
      resultManager.processResult(result);
    });
  }
}

export const gameEngine = new GameEngine();
