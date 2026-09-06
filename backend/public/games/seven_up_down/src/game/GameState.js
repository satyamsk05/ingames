import { gameConfig } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import { apiClient } from '../network/ApiClient.js';

class GameState {
  constructor() {
    this.userBalance = gameConfig.defaultBalance;
    this.selectedChip = 10;
    this.selectedChipColor = '#00e676';
    this.bets = {
      down: 0,
      seven: 0,
      up: 0,
      specific: {}
    };
    this.totalBet = 0;
    this.lastRoundBet = 0;
    this.isRolling = false;
    this.roundTimeLeft = 12;
    this.history = [7, 12, 6, 11, 9, 10, 8, 5, 7, 6, 9, 7];
  }

  setBalance(newBalance) {
    this.userBalance = Math.max(0, Number(newBalance) || 0);
    eventBus.emit('BALANCE_UPDATED', this.userBalance);
    apiClient.notifyParentWallet(this.userBalance);
  }

  setSelectedChip(value, color = '#00e676') {
    this.selectedChip = value;
    this.selectedChipColor = color;
    eventBus.emit('CHIP_CHANGED', { value, color });
  }

  addBet(type, amount) {
    if (type === 'specific') return;
    if (this.userBalance < amount) return;

    this.bets[type] += amount;
    this.totalBet += amount;
    this.userBalance = Math.max(0, this.userBalance - amount);

    eventBus.emit('BALANCE_UPDATED', this.userBalance);
    apiClient.notifyParentWallet(this.userBalance);
    eventBus.emit('BETS_UPDATED', { bets: this.bets, totalBet: this.totalBet });
  }

  addSpecificBet(number, amount) {
    if (this.userBalance < amount) return;

    this.bets.specific[number] = (this.bets.specific[number] || 0) + amount;
    this.totalBet += amount;
    this.userBalance = Math.max(0, this.userBalance - amount);

    eventBus.emit('BALANCE_UPDATED', this.userBalance);
    apiClient.notifyParentWallet(this.userBalance);
    eventBus.emit('BETS_UPDATED', { bets: this.bets, totalBet: this.totalBet });
  }

  clearBets() {
    if (this.totalBet > 0) {
      this.userBalance += this.totalBet;
      eventBus.emit('BALANCE_UPDATED', this.userBalance);
      apiClient.notifyParentWallet(this.userBalance);
    }
    this.bets = { down: 0, seven: 0, up: 0, specific: {} };
    this.totalBet = 0;
    eventBus.emit('BETS_UPDATED', { bets: this.bets, totalBet: this.totalBet });
  }

  doubleBets() {
    if (this.totalBet === 0 || this.userBalance < this.totalBet) return false;
    
    this.userBalance -= this.totalBet;
    this.bets.down *= 2;
    this.bets.seven *= 2;
    this.bets.up *= 2;
    for (const key in this.bets.specific) {
      this.bets.specific[key] *= 2;
    }
    this.totalBet *= 2;

    eventBus.emit('BALANCE_UPDATED', this.userBalance);
    apiClient.notifyParentWallet(this.userBalance);
    eventBus.emit('BETS_UPDATED', { bets: this.bets, totalBet: this.totalBet });
    return true;
  }

  resetRoundBets() {
    this.lastRoundBet = this.totalBet;
    this.bets = { down: 0, seven: 0, up: 0, specific: {} };
    this.totalBet = 0;
    eventBus.emit('BETS_UPDATED', { bets: this.bets, totalBet: this.totalBet });
  }

  setHistory(historyArray) {
    if (Array.isArray(historyArray) && historyArray.length > 0) {
      this.history = historyArray;
      eventBus.emit('HISTORY_UPDATED', this.history);
    }
  }

  addHistoryResult(total) {
    this.history.unshift(total);
    if (this.history.length > 100) this.history.pop();
    eventBus.emit('HISTORY_UPDATED', this.history);
  }
}

export const gameState = new GameState();
