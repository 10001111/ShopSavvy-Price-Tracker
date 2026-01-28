const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcryptjs");

async function initDb() {
  const dataDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = await open({
    filename: path.join(dataDir, "app.db"),
    driver: sqlite3.Database,
  });

  // Users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      created_at TEXT NOT NULL,
      last_login TEXT,
      login_count INTEGER DEFAULT 0,
      auth_provider TEXT DEFAULT 'local'
    );
  `);

  // Login history table - tracks all login attempts
  await db.exec(`
    CREATE TABLE IF NOT EXISTS login_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      ip_address TEXT,
      user_agent TEXT,
      auth_method TEXT DEFAULT 'local',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // User sessions table - tracks active sessions
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Price tracking table - for future price alerts
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      product_title TEXT,
      product_url TEXT,
      source TEXT DEFAULT 'mercadolibre',
      target_price REAL,
      current_price REAL,
      created_at TEXT NOT NULL,
      last_checked TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Price history table - stores price changes
  await db.exec(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracked_product_id INTEGER NOT NULL,
      price REAL NOT NULL,
      recorded_at TEXT NOT NULL,
      FOREIGN KEY (tracked_product_id) REFERENCES tracked_products(id)
    );
  `);

  // Add new columns to existing users table if they don't exist
  try {
    await db.exec(`ALTER TABLE users ADD COLUMN last_login TEXT`);
  } catch (e) { /* column already exists */ }

  try {
    await db.exec(`ALTER TABLE users ADD COLUMN login_count INTEGER DEFAULT 0`);
  } catch (e) { /* column already exists */ }

  try {
    await db.exec(`ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'`);
  } catch (e) { /* column already exists */ }

  // Create demo accounts if they don't exist
  await createDemoAccounts(db);

  return db;
}

// Create demo accounts for testing
async function createDemoAccounts(db) {
  const demoUsers = [
    { email: "demo@shopsavvy.com", password: "demo1234", verified: 1 },
    { email: "test@example.com", password: "test1234", verified: 1 },
    { email: "admin@shopsavvy.com", password: "admin1234", verified: 1 },
  ];

  for (const user of demoUsers) {
    const existing = await db.get("SELECT id FROM users WHERE email = ?", user.email);
    if (!existing) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      await db.run(
        `INSERT INTO users (email, password_hash, verified, created_at, auth_provider)
         VALUES (?, ?, ?, ?, ?)`,
        [user.email, passwordHash, user.verified, new Date().toISOString(), "local"]
      );
      console.log(`[Demo] Created demo account: ${user.email}`);
    }
  }
}

// Helper to record login attempt
async function recordLoginAttempt(db, { userId, email, success, ipAddress, userAgent, authMethod }) {
  await db.run(
    `INSERT INTO login_history (user_id, email, success, ip_address, user_agent, auth_method, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, email, success ? 1 : 0, ipAddress, userAgent, authMethod, new Date().toISOString()]
  );

  // Update user's last_login and login_count if successful
  if (success && userId) {
    await db.run(
      `UPDATE users SET last_login = ?, login_count = login_count + 1 WHERE id = ?`,
      [new Date().toISOString(), userId]
    );
  }
}

// Helper to get login history for a user
async function getLoginHistory(db, userId, limit = 10) {
  return db.all(
    `SELECT * FROM login_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    [userId, limit]
  );
}

module.exports = { initDb, recordLoginAttempt, getLoginHistory };
