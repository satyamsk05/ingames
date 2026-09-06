const db = require('../../config/db');
const crypto = require('crypto');

class LedgerService {
  /**
   * Get wallet or create default wallet for user
   */
  static getOrCreateWallet(userId) {
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      const now = new Date().toISOString();
      try {
        db.prepare(`
          INSERT INTO users (id, username, avatar_path, created_at, updated_at)
          VALUES (?, ?, 'assets/avatar/avatar_1.png', ?, ?)
        `).run(userId, `Player_${String(userId).slice(-4)}`, now, now);
      } catch (_) {}
    }

    let wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
    if (!wallet) {
      const now = new Date().toISOString();
      const walletId = 'wlt_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO wallets (id, user_id, cash_balance_paise, winnings_balance_paise, bonus_balance_paise, locked_balance_paise, currency, version, created_at, updated_at)
        VALUES (?, ?, 50000, 0, 0, 0, 'INR', 1, ?, ?)
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
   * Check idempotency key before financial operations
   */
  static checkIdempotency(userId, idempotencyKey, targetAmountPaise = null) {
    if (!idempotencyKey) return null;
    const existing = db.prepare(`
      SELECT * FROM wallet_ledger WHERE user_id = ? AND idempotency_key = ?
    `).get(userId, idempotencyKey);

    if (existing) {
      if (targetAmountPaise !== null && existing.amount_paise !== targetAmountPaise) {
        throw new Error('IDEMPOTENCY_KEY_REUSE');
      }
      return existing;
    }
    return null;
  }

  /**
   * Create deposit intent / order
   */
  static createDepositOrder({ userId, amountPaise, paymentMethod, idempotencyKey }) {
    if (amountPaise <= 0 || !Number.isInteger(amountPaise)) {
      throw new Error('INVALID_DEPOSIT_AMOUNT');
    }

    if (idempotencyKey) {
      const existingLedger = this.checkIdempotency(userId, idempotencyKey, amountPaise);
      if (existingLedger) {
        throw new Error('IDEMPOTENCY_KEY_REUSE');
      }

      const existing = db.prepare('SELECT * FROM deposit_orders WHERE idempotency_key = ?').get(idempotencyKey);
      if (existing) {
        if (existing.amount_paise !== amountPaise) {
          throw new Error('IDEMPOTENCY_KEY_REUSE');
        }
        return existing;
      }
    }

    const orderId = 'dep_ord_' + crypto.randomUUID().slice(0, 12);
    const now = new Date().toISOString();
    const gatewayRef = 'gtw_ref_' + crypto.randomUUID().slice(0, 8);

    db.prepare(`
      INSERT INTO deposit_orders (id, user_id, amount_paise, payment_method, gateway_ref, status, idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING_PROVIDER', ?, ?, ?)
    `).run(orderId, userId, amountPaise, paymentMethod || 'UPI', gatewayRef, idempotencyKey, now, now);

    return db.prepare('SELECT * FROM deposit_orders WHERE id = ?').get(orderId);
  }

  /**
   * Verified Provider Webhook / Test Adapter Callback to credit wallet
   */
  static processDepositWebhook({ orderId, providerTxId, signatureVerified, webhookEventId }) {
    if (!signatureVerified) {
      throw new Error('INVALID_WEBHOOK_SIGNATURE');
    }

    const executeTransaction = db.transaction(() => {
      const order = db.prepare('SELECT * FROM deposit_orders WHERE id = ?').get(orderId);
      if (!order) throw new Error('ORDER_NOT_FOUND');

      if (order.status === 'SUCCEEDED') {
        return this.getWalletSummary(order.user_id);
      }

      const userId = order.user_id;
      const amountPaise = order.amount_paise;
      const wallet = this.getOrCreateWallet(userId);

      const balanceBefore = wallet.cash_balance_paise + wallet.winnings_balance_paise + wallet.bonus_balance_paise;
      const newCashBalance = wallet.cash_balance_paise + amountPaise;
      const balanceAfter = balanceBefore + amountPaise;
      const now = new Date().toISOString();

      // Optimistic concurrency control & atomic update
      const res = db.prepare(`
        UPDATE wallets 
        SET cash_balance_paise = ?, version = version + 1, updated_at = ? 
        WHERE id = ? AND version = ?
      `).run(newCashBalance, now, wallet.id, wallet.version);

      if (res.changes !== 1) {
        throw new Error('WALLET_CONFLICT');
      }

      // Update deposit order status
      db.prepare(`
        UPDATE deposit_orders 
        SET status = 'SUCCEEDED', gateway_ref = ?, updated_at = ?
        WHERE id = ?
      `).run(providerTxId || order.gateway_ref, now, order.id);

      // Create ledger entry with explicit deltas
      const ledgerId = 'ldg_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO wallet_ledger 
        (id, user_id, wallet_id, reference_type, reference_id, idempotency_key, direction, delta_cash_paise, delta_winnings_paise, delta_bonus_paise, delta_locked_paise, amount_paise, balance_before_paise, balance_after_paise, category, metadata_json, created_at)
        VALUES (?, ?, ?, 'DEPOSIT', ?, ?, 'CREDIT', ?, 0, 0, 0, ?, ?, ?, 'Deposit', ?, ?)
      `).run(ledgerId, userId, wallet.id, order.id, order.idempotency_key, amountPaise, amountPaise, balanceBefore, balanceAfter, JSON.stringify({ providerTxId, webhookEventId }), now);

      // Transaction entry
      const txId = 'tx_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO transactions (id, user_id, type, amount_paise, is_credit, title, category, reference_id, created_at)
        VALUES (?, ?, 'DEPOSIT', ?, 1, ?, 'Deposit', ?, ?)
      `).run(txId, userId, amountPaise, `Cash Deposited (${order.payment_method})`, order.id, now);

      return this.getWalletSummary(userId);
    });

    return executeTransaction();
  }

  /**
   * Request withdrawal - Server calculates fee/cashback & locks funds
   */
  static requestWithdrawal({ userId, amountPaise, upiId, idempotencyKey }) {
    if (amountPaise <= 0 || !Number.isInteger(amountPaise)) {
      throw new Error('INVALID_WITHDRAWAL_AMOUNT');
    }

    const existingIdemp = this.checkIdempotency(userId, idempotencyKey, amountPaise);
    if (existingIdemp) {
      return {
        withdrawalId: existingIdemp.reference_id,
        status: 'PENDING',
        wallet: this.getWalletSummary(userId),
      };
    }

    const executeTransaction = db.transaction(() => {
      const wallet = this.getOrCreateWallet(userId);
      if (wallet.winnings_balance_paise < amountPaise) {
        throw new Error('INSUFFICIENT_WINNINGS_BALANCE');
      }

      // Server calculates fees: 5% processing fee (min ₹1, max ₹50)
      const calculatedFeePaise = Math.min(5000, Math.max(100, Math.round(amountPaise * 0.05)));
      const netAmountPaise = Math.max(0, amountPaise - calculatedFeePaise);

      const balanceBefore = wallet.cash_balance_paise + wallet.winnings_balance_paise + wallet.bonus_balance_paise;
      const newWinnings = wallet.winnings_balance_paise - amountPaise;
      const newLocked = wallet.locked_balance_paise + amountPaise;
      const balanceAfter = balanceBefore - amountPaise;
      const now = new Date().toISOString();

      // Optimistic concurrency locking
      const res = db.prepare(`
        UPDATE wallets 
        SET winnings_balance_paise = ?, locked_balance_paise = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
      `).run(newWinnings, newLocked, now, wallet.id, wallet.version);

      if (res.changes !== 1) {
        throw new Error('WALLET_CONFLICT');
      }

      const withdrawalId = 'wdr_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO withdrawals (id, user_id, amount_paise, fee_paise, net_amount_paise, upi_id, status, idempotency_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
      `).run(withdrawalId, userId, amountPaise, calculatedFeePaise, netAmountPaise, upiId, idempotencyKey, now, now);

      // Ledger entry with deltas
      const ledgerId = 'ldg_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO wallet_ledger 
        (id, user_id, wallet_id, reference_type, reference_id, idempotency_key, direction, delta_cash_paise, delta_winnings_paise, delta_bonus_paise, delta_locked_paise, amount_paise, balance_before_paise, balance_after_paise, category, metadata_json, created_at)
        VALUES (?, ?, ?, 'WITHDRAWAL', ?, ?, 'DEBIT', 0, ?, 0, ?, ?, ?, ?, 'Withdrawal', ?, ?)
      `).run(ledgerId, userId, wallet.id, withdrawalId, idempotencyKey, -amountPaise, amountPaise, amountPaise, balanceBefore, balanceAfter, JSON.stringify({ upiId, calculatedFeePaise, netAmountPaise }), now);

      // Transaction entry
      const txId = 'tx_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO transactions (id, user_id, type, amount_paise, is_credit, title, category, reference_id, created_at)
        VALUES (?, ?, 'WITHDRAWAL', ?, 0, ?, 'Withdrawal', ?, ?)
      `).run(txId, userId, amountPaise, `Withdrawal to ${upiId}`, withdrawalId, now);

      return {
        withdrawalId,
        status: 'PENDING',
        feePaise: calculatedFeePaise,
        netAmountPaise,
        wallet: this.getWalletSummary(userId),
      };
    });

    return executeTransaction();
  }

  /**
   * Deduct bet stake from wallet atomically
   */
  static deductBetStake({ userId, stakePaise, referenceId, betTitle, idempotencyKey }) {
    if (stakePaise <= 0 || !Number.isInteger(stakePaise)) {
      throw new Error('INVALID_STAKE_AMOUNT');
    }

    const existingIdemp = this.checkIdempotency(userId, idempotencyKey, stakePaise);
    if (existingIdemp) {
      return this.getWalletSummary(userId);
    }

    const executeTransaction = db.transaction(() => {
      const wallet = this.getOrCreateWallet(userId);
      const totalAvailable = wallet.cash_balance_paise + wallet.winnings_balance_paise;
      if (totalAvailable < stakePaise) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const balanceBefore = totalAvailable + wallet.bonus_balance_paise;
      let newCash = wallet.cash_balance_paise;
      let newWinnings = wallet.winnings_balance_paise;
      let deltaCash = 0;
      let deltaWinnings = 0;

      if (newCash >= stakePaise) {
        newCash -= stakePaise;
        deltaCash = -stakePaise;
      } else {
        const rem = stakePaise - newCash;
        deltaCash = -newCash;
        deltaWinnings = -rem;
        newCash = 0;
        newWinnings -= rem;
      }

      const balanceAfter = balanceBefore - stakePaise;
      const now = new Date().toISOString();

      const res = db.prepare(`
        UPDATE wallets 
        SET cash_balance_paise = ?, winnings_balance_paise = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
      `).run(newCash, newWinnings, now, wallet.id, wallet.version);

      if (res.changes !== 1) {
        throw new Error('WALLET_CONFLICT');
      }

      const ledgerId = 'ldg_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO wallet_ledger 
        (id, user_id, wallet_id, reference_type, reference_id, idempotency_key, direction, delta_cash_paise, delta_winnings_paise, delta_bonus_paise, delta_locked_paise, amount_paise, balance_before_paise, balance_after_paise, category, metadata_json, created_at)
        VALUES (?, ?, ?, 'BET', ?, ?, 'DEBIT', ?, ?, 0, 0, ?, ?, ?, 'Game', ?, ?)
      `).run(ledgerId, userId, wallet.id, referenceId, idempotencyKey, deltaCash, deltaWinnings, stakePaise, balanceBefore, balanceAfter, JSON.stringify({ betTitle }), now);

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
      const existingSettlement = db.prepare('SELECT * FROM settlements WHERE bet_id = ?').get(betId);
      if (existingSettlement) {
        return this.getWalletSummary(userId);
      }

      const wallet = this.getOrCreateWallet(userId);
      const balanceBefore = wallet.cash_balance_paise + wallet.winnings_balance_paise + wallet.bonus_balance_paise;
      const newWinnings = wallet.winnings_balance_paise + payoutPaise;
      const balanceAfter = balanceBefore + payoutPaise;
      const now = new Date().toISOString();

      const res = db.prepare(`
        UPDATE wallets 
        SET winnings_balance_paise = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
      `).run(newWinnings, now, wallet.id, wallet.version);

      if (res.changes !== 1) {
        throw new Error('WALLET_CONFLICT');
      }

      const settlementId = 'stl_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO settlements (id, bet_id, round_id, user_id, payout_amount_paise, status, settled_at)
        VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?)
      `).run(settlementId, betId, referenceId, userId, payoutPaise, now);

      const ledgerId = 'ldg_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO wallet_ledger 
        (id, user_id, wallet_id, reference_type, reference_id, idempotency_key, direction, delta_cash_paise, delta_winnings_paise, delta_bonus_paise, delta_locked_paise, amount_paise, balance_before_paise, balance_after_paise, category, metadata_json, created_at)
        VALUES (?, ?, ?, 'WIN', ?, ?, 'CREDIT', 0, ?, 0, 0, ?, ?, ?, 'Game', ?, ?)
      `).run(ledgerId, userId, wallet.id, betId, `win_${betId}`, payoutPaise, payoutPaise, balanceBefore, balanceAfter, JSON.stringify({ gameTitle, diceResult }), now);

      const txId = 'tx_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO transactions (id, user_id, type, amount_paise, is_credit, title, category, reference_id, created_at)
        VALUES (?, ?, 'WIN', ?, 1, ?, 'Game', ?, ?)
      `).run(txId, userId, payoutPaise, `Won : ${gameTitle} (${diceResult})`, betId, now);

      return this.getWalletSummary(userId);
    });

    return executeTransaction();
  }

  /**
   * Admin manual balance adjustment (Credit or Debit)
   */
  static adminAdjustBalance({ userId, amount, action, type, note }) {
    if (!userId || !amount || amount <= 0) {
      throw new Error('INVALID_AMOUNT');
    }
    const amountPaise = Math.round(amount * 100);
    const category = (type || 'DEPOSIT').toUpperCase(); // DEPOSIT, WINNINGS, BONUS
    const isCredit = action !== 'DEDUCT';

    const executeTransaction = db.transaction(() => {
      const wallet = this.getOrCreateWallet(userId);
      const balanceBefore = wallet.cash_balance_paise + wallet.winnings_balance_paise + wallet.bonus_balance_paise;
      
      let newCash = wallet.cash_balance_paise;
      let newWinnings = wallet.winnings_balance_paise;
      let newBonus = wallet.bonus_balance_paise;

      let deltaCash = 0;
      let deltaWinnings = 0;
      let deltaBonus = 0;

      if (category === 'WINNINGS') {
        deltaWinnings = isCredit ? amountPaise : -amountPaise;
        newWinnings = Math.max(0, newWinnings + deltaWinnings);
      } else if (category === 'BONUS') {
        deltaBonus = isCredit ? amountPaise : -amountPaise;
        newBonus = Math.max(0, newBonus + deltaBonus);
      } else { // DEPOSIT / CASH
        deltaCash = isCredit ? amountPaise : -amountPaise;
        newCash = Math.max(0, newCash + deltaCash);
      }

      const balanceAfter = newCash + newWinnings + newBonus;
      const now = new Date().toISOString();

      const res = db.prepare(`
        UPDATE wallets 
        SET cash_balance_paise = ?, winnings_balance_paise = ?, bonus_balance_paise = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
      `).run(newCash, newWinnings, newBonus, now, wallet.id, wallet.version);

      if (res.changes !== 1) {
        throw new Error('WALLET_CONFLICT');
      }

      const refId = `ADMIN_ADJ_${Date.now()}`;
      const ledgerId = 'ldg_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO wallet_ledger 
        (id, user_id, wallet_id, reference_type, reference_id, idempotency_key, direction, delta_cash_paise, delta_winnings_paise, delta_bonus_paise, delta_locked_paise, amount_paise, balance_before_paise, balance_after_paise, category, metadata_json, created_at)
        VALUES (?, ?, ?, 'ADMIN_ADJUSTMENT', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
      `).run(
        ledgerId, userId, wallet.id, refId, refId, 
        isCredit ? 'CREDIT' : 'DEBIT', 
        deltaCash, deltaWinnings, deltaBonus, 
        amountPaise, balanceBefore, balanceAfter, 
        category, JSON.stringify({ note: note || 'Admin manual balance adjustment' }), now
      );

      const txId = 'tx_' + crypto.randomUUID().slice(0, 12);
      db.prepare(`
        INSERT INTO transactions (id, user_id, type, amount_paise, is_credit, title, category, reference_id, created_at)
        VALUES (?, ?, 'ADMIN_ADJUSTMENT', ?, ?, ?, ?, ?, ?)
      `).run(txId, userId, amountPaise, isCredit ? 1 : 0, note || `Admin ${isCredit ? 'Credit' : 'Debit'} (${category})`, category, refId, now);

      return this.getWalletSummary(userId);
    });

    return executeTransaction();
  }
}

module.exports = LedgerService;
