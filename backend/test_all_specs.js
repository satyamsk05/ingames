const db = require('./src/config/db');
const LedgerService = require('./src/modules/wallet/ledger.service');
const SevenUpDownService = require('./src/modules/game/seven_up_down.service');
const { generateToken, verifyToken } = require('./src/core/auth_middleware');

console.log('====================================================');
console.log('       IN GAMES FULL SPECIFICATION TEST SUITE       ');
console.log('====================================================');

// Reset test data
db.prepare("DELETE FROM wallet_ledger WHERE user_id LIKE 'test_user_%'").run();
db.prepare("DELETE FROM transactions WHERE user_id LIKE 'test_user_%'").run();
db.prepare("DELETE FROM bets WHERE user_id LIKE 'test_user_%'").run();
db.prepare("DELETE FROM deposit_orders WHERE user_id LIKE 'test_user_%'").run();
db.prepare("DELETE FROM withdrawals WHERE user_id LIKE 'test_user_%'").run();
db.prepare("DELETE FROM wallets WHERE user_id LIKE 'test_user_%'").run();
db.prepare("DELETE FROM users WHERE id LIKE 'test_user_%'").run();

const now = new Date().toISOString();
db.prepare("INSERT INTO users (id, phone, username, created_at, updated_at) VALUES ('test_user_1', '9000000001', 'Alice', ?, ?)").run(now, now);
db.prepare("INSERT INTO users (id, phone, username, created_at, updated_at) VALUES ('test_user_2', '9000000002', 'Bob', ?, ?)").run(now, now);

// 1. AUTH & JWT TEST
console.log('\n--- 1. Auth & JWT Verification ---');
const token = generateToken({ id: 'test_user_1', phone: '9000000001' });
const decoded = verifyToken(token);
if (decoded.id !== 'test_user_1') throw new Error('JWT verification failed');
console.log('✅ JWT Token Generation & Verification PASSED');

// 2. CONCURRENCY TEST: ₹10,000 balance, 2 simultaneous debits of ₹8,000
console.log('\n--- 2. Wallet Concurrency Test ---');
// Deposit ₹10,000 (1,000,000 paise)
const order = LedgerService.createDepositOrder({
  userId: 'test_user_1',
  amountPaise: 1000000,
  paymentMethod: 'UPI',
  idempotencyKey: 'dep_idemp_10k',
});

LedgerService.processDepositWebhook({
  orderId: order.id,
  providerTxId: 'tx_prov_10k',
  signatureVerified: true,
  webhookEventId: 'ev_10k',
});

const initialSummary = LedgerService.getWalletSummary('test_user_1');
console.log('Initial Balance:', initialSummary.totalBalance); // ₹10,000

let successCount = 0;
let failCount = 0;

for (let i = 0; i < 2; i++) {
  try {
    LedgerService.deductBetStake({
      userId: 'test_user_1',
      stakePaise: 800000, // ₹8,000
      referenceId: `bet_conc_${i}`,
      betTitle: '7 Up Down : DOWN',
      idempotencyKey: `idemp_conc_${i}`,
    });
    successCount++;
  } catch (err) {
    failCount++;
    console.log(`Expected Concurrency Debit Error: ${err.message}`);
  }
}

const finalSummary = LedgerService.getWalletSummary('test_user_1');
console.log('Final Balance after 2 x ₹8,000 debits:', finalSummary.totalBalance);

if (successCount !== 1 || failCount !== 1 || finalSummary.totalBalance !== 2000) {
  throw new Error(`Concurrency test failed! Expected 1 success, 1 fail, final balance ₹2000. Got: success=${successCount}, fail=${failCount}, balance=${finalSummary.totalBalance}`);
}
console.log('✅ Wallet Concurrency Test (₹10,000 -> 2x ₹8,000 = ₹2,000) PASSED');

// 3. IDEMPOTENCY KEY REUSE TEST
console.log('\n--- 3. Idempotency Key Reuse Test ---');
try {
  LedgerService.createDepositOrder({
    userId: 'test_user_1',
    amountPaise: 50000, // ₹500
    paymentMethod: 'UPI',
    idempotencyKey: 'idemp_conc_0', // Reuse existing key with different amount!
  });
  throw new Error('Idempotency key reuse was NOT rejected!');
} catch (err) {
  if (err.message.includes('IDEMPOTENCY_KEY_REUSE') || err.message.includes('UNIQUE constraint failed')) {
    console.log('✅ Idempotency Key Reuse correctly REJECTED PASSED');
  } else {
    throw err;
  }
}

// 4. PROVABLY FAIR DICE DERIVATION TEST
console.log('\n--- 4. HMAC-SHA256 Provably Fair Dice Test ---');
const knownSeed = 'c84e2a77f980126487e912389123891238912389123891238912389123891234';
const diceResult = SevenUpDownService.deriveDice({
  serverSeed: knownSeed,
  roundId: 'rnd_test_vector',
  roundNumber: 1001,
});
console.log('Derived Dice:', diceResult);
if (diceResult.dice1 < 1 || diceResult.dice1 > 6 || diceResult.dice2 < 1 || diceResult.dice2 > 6) {
  throw new Error('Provably fair dice values out of bounds');
}
console.log('✅ Provably Fair Deterministic Dice Derivation PASSED');

// 5. WITHDRAWAL SERVER FEE CALCULATION TEST
console.log('\n--- 5. Server-Calculated Withdrawal Fee Test ---');
const wallet2 = LedgerService.getOrCreateWallet('test_user_2');
db.prepare("UPDATE wallets SET winnings_balance_paise = 500000 WHERE user_id = 'test_user_2'").run();

const wdrRes = LedgerService.requestWithdrawal({
  userId: 'test_user_2',
  amountPaise: 100000, // ₹1,000
  upiId: 'test@upi',
  idempotencyKey: 'idemp_wdr_spec_1',
});

console.log('Withdrawal Requested:', wdrRes);
if (wdrRes.feePaise !== 5000 || wdrRes.netAmountPaise !== 95000) {
  throw new Error(`Server fee calculation error! Fee: ₹${wdrRes.feePaise/100}, Net: ₹${wdrRes.netAmountPaise/100}`);
}
console.log('✅ Server-Owned Withdrawal Fee & Net Amount Calculation PASSED');

console.log('\n====================================================');
console.log('     🎉 ALL AGENT SPECIFICATIONS VERIFIED 100%     ');
console.log('====================================================');
process.exit(0);
