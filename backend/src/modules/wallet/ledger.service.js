const db = require('../../config/db');
const crypto = require('crypto');

class LedgerService {
  /**
   * Get wallet or create default wallet for user
   */
  static getOrCreateWallet(userId) {
    let wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
    if (!wallet) {
      const now = new Date().toISOString();
      const walletId = 'wlt_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO wallets (id, user_id, cash_balance_paise, winnings_balance_paise, bonus_balance_paise, locked_balance_paise, currency, version, created_at, updated_at)
        VALUES (?, ?, 0, 0, 0, 0, 'INR', 1, ?, ?)
      `).run(walletId, userId, now, now);

      wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
    }
    return wallet;
  }

  /**
   * Get clean summary of user balances in INR & Paise
   */
  static getWalletSummary(userId) {
    const wallet = this.getOrCreateWallet(userId);
    const totalPaise = wallet.cash_balance_paise + wallet.winnings_balance_paise + wallet.bonus_balance_paise;
    return {
      userId,
      walletId: wallet.id,
      cashBalance: wallet.cash_balance_paise / 100,
      winningsBalance: wallet.winnings_balance_paise / 100,
      bonusBalance: wallet.bonus_balance_paise / 100,
      lockedBalance: wallet.locked_balance_paise / 100,
      totalBalance: totalPaise / 100,
      cashBalancePaise: wallet.cash_balance_paise,
      winningsBalancePaise: wallet.winnings_balance_paise,
      bonusBalancePaise: wallet.bonus_balance_paise,
      lockedBalancePaise: wallet.locked_balance_paise,
      totalBalancePaise: totalPaise,
      version: wallet.version,
    };
  }

  /**
   * Credit deposit to user wallet atomically
   */
  static creditDeposit({ userId, amountPaise, referenceId, paymentMethod, idempotencyKey = null }) {
    if (amountPaise <= 0) throw new Error('Invalid deposit amount');

    const executeTransaction = db.transaction(() => {
      // Check idempotency if key provided
      if (idempotencyKey) {
        const existing = db.prepare('SELECT * FROM deposits WHERE idempotency_key = ?').get(idempotencyKey);
        if (existing && existing.status === 'SUCCESS') {
          return this.getWalletSummary(userId);
        }
      }

      const wallet = this.getOrCreateWallet(userId);
      const balanceBefore = wallet.cash_balance_paise + wallet.winnings_balance_paise + wallet.bonus_balance_paise;
      const newCashBalance = wallet.cash_balance_paise + amountPaise;
      const balanceAfter = balanceBefore + amountPaise;
      const now = new Date().toISOString();

      // Update wallet balance & bump version
      db.prepare(`
        UPDATE wallets 
        SET cash_balance_paise = ?, version = version + 1, updated_at = ? 
        WHERE id = ? AND version = ?
      `).run(newCashBalance, now, wallet.id, wallet.version);

      // Create ledger entry
      const ledgerId = 'ldg_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO wallet_ledger 
        (id, user_id, wallet_id, reference_type, reference_id, direction, amount_paise, balance_before_paise, balance_after_paise, category, metadata_json, created_at)
        VALUES (?, ?, ?, 'DEPOSIT', ?, 'CREDIT', ?, ?, ?, 'Deposit', ?, ?)
      `).run(ledgerId, userId, wallet.id, referenceId, amountPaise, balanceBefore, balanceAfter, JSON.stringify({ paymentMethod }), now);

      // Create public transaction record
      const txId = 'tx_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO transactions (id, user_id, type, amount_paise, is_credit, title, category, reference_id, created_at)
        VALUES (?, ?, 'DEPOSIT', ?, 1, ?, 'Deposit', ?, ?)
      `).run(txId, userId, amountPaise, `Cash Deposited (${paymentMethod || 'UPI'})`, referenceId, now);

      // Record deposit record status
      if (idempotencyKey) {
        db.prepare(`
          INSERT INTO deposits (id, user_id, amount_paise, payment_method, gateway_ref, status, idempotency_key, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?)
          ON CONFLICT(idempotency_key) DO UPDATE SET status = 'SUCCESS', updated_at = excluded.updated_at
        `).run(referenceId, userId, amountPaise, paymentMethod || 'UPI', referenceId, idempotencyKey, now, now);
      }

      return this.getWalletSummary(userId);
    });

    return executeTransaction();
  }

  /**
   * Request withdrawal - locks funds in locked_balance_paise
   */
  static requestWithdrawal({ userId, amountPaise, upiId, idempotencyKey }) {
    if (amountPaise <= 0) throw new Error('Invalid withdrawal amount');

    const executeTransaction = db.transaction(() => {
      if (idempotencyKey) {
        const existing = db.prepare('SELECT * FROM withdrawals WHERE idempotency_key = ?').get(idempotencyKey);
        if (existing) return existing;
      }

      const wallet = this.getOrCreateWallet(userId);
      if (wallet.winnings_balance_paise < amountPaise) {
        throw new Error('INSUFFICIENT_WINNINGS_BALANCE');
      }

      const balanceBefore = wallet.cash_balance_paise + wallet.winnings_balance_paise + wallet.bonus_balance_paise;
      const newWinnings = wallet.winnings_balance_paise - amountPaise;
      const newLocked = wallet.locked_balance_paise + amountPaise;
      const balanceAfter = balanceBefore - amountPaise;
      const now = new Date().toISOString();

      // Deduct winnings and add to locked balance
      db.prepare(`
        UPDATE wallets 
        SET winnings_balance_paise = ?, locked_balance_paise = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
      `).run(newWinnings, newLocked, now, wallet.id, wallet.version);

      const withdrawalId = 'wdr_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO withdrawals (id, user_id, amount_paise, upi_id, status, idempotency_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)
      `).run(withdrawalId, userId, amountPaise, upiId, idempotencyKey, now, now);

      // Ledger entry
      const ledgerId = 'ldg_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO wallet_ledger 
        (id, user_id, wallet_id, reference_type, reference_id, direction, amount_paise, balance_before_paise, balance_after_paise, category, metadata_json, created_at)
        VALUES (?, ?, ?, 'WITHDRAWAL', ?, 'DEBIT', ?, ?, ?, 'Withdrawal', ?, ?)
      `).run(ledgerId, userId, wallet.id, withdrawalId, amountPaise, balanceBefore, balanceAfter, JSON.stringify({ upiId }), now);

      // Transaction entry
      const txId = 'tx_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO transactions (id, user_id, type, amount_paise, is_credit, title, category, reference_id, created_at)
        VALUES (?, ?, 'WITHDRAWAL', ?, 0, ?, 'Withdrawal', ?, ?)
      `).run(txId, userId, amountPaise, `Withdrawal to ${upiId}`, withdrawalId, now);

      return {
        withdrawalId,
        status: 'PENDING',
        wallet: this.getWalletSummary(userId),
      };
    });

    return executeTransaction();
  }

  /**
   * Deduct bet stake from wallet (Deposit balance first, then Winnings balance)
   */
  static deductBetStake({ userId, stakePaise, referenceId, betTitle, idempotencyKey }) {
    if (stakePaise <= 0) throw new Error('Invalid stake amount');

    const executeTransaction = db.transaction(() => {
      if (idempotencyKey) {
        const existingBet = db.prepare('SELECT * FROM bets WHERE idempotency_key = ?').get(idempotencyKey);
        if (existingBet) return existingBet;
      }

      const wallet = this.getOrCreateWallet(userId);
      const totalAvailable = wallet.cash_balance_paise + wallet.winnings_balance_paise;
      if (totalAvailable < stakePaise) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const balanceBefore = totalAvailable + wallet.bonus_balance_paise;
      let newCash = wallet.cash_balance_paise;
      let newWinnings = wallet.winnings_balance_paise;

      if (newCash >= stakePaise) {
        newCash -= stakePaise;
      } else {
        const rem = stakePaise - newCash;
        newCash = 0;
        newWinnings -= rem;
      }

      const balanceAfter = balanceBefore - stakePaise;
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE wallets 
        SET cash_balance_paise = ?, winnings_balance_paise = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
      `).run(newCash, newWinnings, now, wallet.id, wallet.version);

      const ledgerId = 'ldg_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO wallet_ledger 
        (id, user_id, wallet_id, reference_type, reference_id, direction, amount_paise, balance_before_paise, balance_after_paise, category, metadata_json, created_at)
        VALUES (?, ?, ?, 'BET', ?, 'DEBIT', ?, ?, ?, 'Game', ?, ?)
      `).run(ledgerId, userId, wallet.id, referenceId, stakePaise, balanceBefore, balanceAfter, JSON.stringify({ betTitle }), now);

      const txId = 'tx_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO transactions (id, user_id, type, amount_paise, is_credit, title, category, reference_id, created_at)
        VALUES (?, ?, 'BET', ?, 0, ?, 'Game', ?, ?)
      `).run(txId, userId, stakePaise, betTitle, referenceId, now);

      return this.getWalletSummary(userId);
    });

    return executeTransaction();
  }

  /**
   * Credit bet winnings to winnings_balance_paise
   */
  static creditBetWinnings({ userId, payoutPaise, referenceId, gameTitle, diceResult, betId }) {
    if (payoutPaise <= 0) return this.getWalletSummary(userId);

    const executeTransaction = db.transaction(() => {
      // Idempotency check on settlement
      const existingSettlement = db.prepare('SELECT * FROM settlements WHERE bet_id = ?').get(betId);
      if (existingSettlement) {
        return this.getWalletSummary(userId);
      }

      const wallet = this.getOrCreateWallet(userId);
      const balanceBefore = wallet.cash_balance_paise + wallet.winnings_balance_paise + wallet.bonus_balance_paise;
      const newWinnings = wallet.winnings_balance_paise + payoutPaise;
      const balanceAfter = balanceBefore + payoutPaise;
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE wallets 
        SET winnings_balance_paise = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
      `).run(newWinnings, now, wallet.id, wallet.version);

      // Settlement log
      const settlementId = 'stl_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO settlements (id, bet_id, round_id, user_id, payout_amount_paise, status, settled_at)
        VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?)
      `).run(settlementId, betId, referenceId, userId, payoutPaise, now);

      // Ledger entry
      const ledgerId = 'ldg_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO wallet_ledger 
        (id, user_id, wallet_id, reference_type, reference_id, direction, amount_paise, balance_before_paise, balance_after_paise, category, metadata_json, created_at)
        VALUES (?, ?, ?, 'WIN', ?, 'CREDIT', ?, ?, ?, 'Game', ?, ?)
      `).run(ledgerId, userId, wallet.id, betId, payoutPaise, balanceBefore, balanceAfter, JSON.stringify({ gameTitle, diceResult }), now);

      // Transaction entry
      const txId = 'tx_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO transactions (id, user_id, type, amount_paise, is_credit, title, category, reference_id, created_at)
        VALUES (?, ?, 'WIN', ?, 1, ?, 'Game', ?, ?)
      `).run(txId, userId, payoutPaise, `Won : ${gameTitle} (${diceResult})`, betId, now);

      return this.getWalletSummary(userId);
    });

    return executeTransaction();
  }
}

module.LedgerService = LedgerService;
module.exports = LedgerService;
