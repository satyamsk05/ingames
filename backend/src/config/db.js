const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database.sqlite');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency & ACID safety
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE,
      email TEXT UNIQUE,
      username TEXT NOT NULL,
      avatar_path TEXT DEFAULT 'assets/avatar/avatar_1.png',
      is_admin INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      cash_balance_paise INTEGER NOT NULL DEFAULT 0,
      winnings_balance_paise INTEGER NOT NULL DEFAULT 0,
      bonus_balance_paise INTEGER NOT NULL DEFAULT 0,
      locked_balance_paise INTEGER NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'INR',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wallet_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      balance_before_paise INTEGER NOT NULL,
      balance_after_paise INTEGER NOT NULL,
      category TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      payment_method TEXT DEFAULT 'UPI',
      gateway_ref TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      upi_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      min_entry_fee_paise INTEGER DEFAULT 1000,
      max_entry_fee_paise INTEGER DEFAULT 100000,
      icon_path TEXT,
      game_url TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS game_rounds (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'CREATED',
      server_seed TEXT NOT NULL,
      seed_hash TEXT NOT NULL,
      result_dice_1 INTEGER,
      result_dice_2 INTEGER,
      result_sum INTEGER,
      betting_open_at TEXT NOT NULL,
      betting_close_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS bets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      round_id TEXT NOT NULL,
      bet_type TEXT NOT NULL,
      stake_amount_paise INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACCEPTED',
      payout_amount_paise INTEGER DEFAULT 0,
      idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (round_id) REFERENCES game_rounds(id)
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      bet_id TEXT UNIQUE NOT NULL,
      round_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      payout_amount_paise INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'COMPLETED',
      settled_at TEXT NOT NULL,
      FOREIGN KEY (bet_id) REFERENCES bets(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      is_credit INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      ip_address TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_user ON wallet_ledger(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id);
    CREATE INDEX IF NOT EXISTS idx_bets_round ON bets(round_id);
    CREATE INDEX IF NOT EXISTS idx_rounds_status ON game_rounds(status);
  `);
}

initDb();

module.exports = db;
