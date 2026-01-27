import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'dyndns.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS dyndns_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    provider TEXT DEFAULT 'hetzner',
    api_key TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dyndns_user_id INTEGER NOT NULL,
    domain TEXT NOT NULL,
    zone_id TEXT NOT NULL,
    record_name TEXT NOT NULL,
    record_id TEXT,
    last_ip TEXT,
    last_updated TEXT,
    FOREIGN KEY (dyndns_user_id) REFERENCES dyndns_users(id) ON DELETE CASCADE,
    UNIQUE(dyndns_user_id, domain)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS update_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dyndns_user_id INTEGER,
    domain TEXT NOT NULL,
    ip TEXT NOT NULL,
    success INTEGER NOT NULL,
    message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Run migrations
runMigrations();

function runMigrations() {
  // Migration 1: Add provider column to dyndns_users if it doesn't exist
  try {
    const checkColumn = db.prepare("PRAGMA table_info(dyndns_users)").all();
    const hasProvider = checkColumn.some(col => col.name === 'provider');
    
    if (!hasProvider) {
      db.exec("ALTER TABLE dyndns_users ADD COLUMN provider TEXT DEFAULT 'hetzner'");
      db.exec("UPDATE dyndns_users SET provider = 'hetzner' WHERE provider IS NULL");
      console.log('✓ Migration: Added provider column to dyndns_users table and set all to hetzner');
    }
  } catch (e) {
    console.error('Migration error (provider column):', e);
  }

  // Migration 2: Add api_key column if it doesn't exist (for users upgrading from hetzner_api_key)
  try {
    const checkColumn = db.prepare("PRAGMA table_info(dyndns_users)").all();
    const hasApiKey = checkColumn.some(col => col.name === 'api_key');
    const hasHetznerApiKey = checkColumn.some(col => col.name === 'hetzner_api_key');
    
    if (!hasApiKey && hasHetznerApiKey) {
      db.exec("ALTER TABLE dyndns_users ADD COLUMN api_key TEXT");
      db.exec("UPDATE dyndns_users SET api_key = hetzner_api_key WHERE hetzner_api_key IS NOT NULL");
      console.log('✓ Migration: Added api_key column and migrated data from hetzner_api_key');
    }
  } catch (e) {
    console.error('Migration error (api_key column):', e);
  }

  // Migration 3: Add record_id column to domains table if it doesn't exist
  try {
    const checkColumn = db.prepare("PRAGMA table_info(domains)").all();
    const hasRecordId = checkColumn.some(col => col.name === 'record_id');
    
    if (!hasRecordId) {
      db.exec('ALTER TABLE domains ADD COLUMN record_id TEXT');
      console.log('✓ Migration: Added record_id column to domains table');
    }
  } catch (e) {
    console.error('Migration error (record_id column):', e);
  }
}

export { db };
