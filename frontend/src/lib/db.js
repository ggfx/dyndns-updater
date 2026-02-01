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
  // Migration 1: Normalize dyndns_users schema (add provider, api_key, remove hetzner_api_key if needed)
  try {
    const checkColumn = db.prepare("PRAGMA table_info(dyndns_users)").all();
    const hasProvider = checkColumn.some(col => col.name === 'provider');
    const hasApiKey = checkColumn.some(col => col.name === 'api_key');
    const hasHetznerApiKey = checkColumn.some(col => col.name === 'hetzner_api_key');

    // Rebuild table if schema is outdated (missing provider or api_key, or has legacy hetzner_api_key)
    if (!hasProvider || !hasApiKey || hasHetznerApiKey) {
      db.exec('BEGIN');
      db.exec(`
        CREATE TABLE IF NOT EXISTS dyndns_users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          provider TEXT DEFAULT 'hetzner',
          api_key TEXT NOT NULL,
          description TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Build SELECT dynamically based on which columns exist
      const providerCol = hasProvider ? 'COALESCE(provider, \'hetzner\')' : '\'hetzner\'';
      const apiKeyCol = hasApiKey ? (hasHetznerApiKey ? 'COALESCE(api_key, hetzner_api_key, \'\')' : 'api_key') : (hasHetznerApiKey ? 'hetzner_api_key' : '\'\'');
      
      db.exec(`
        INSERT INTO dyndns_users_new (id, username, password_hash, provider, api_key, description, created_at)
        SELECT 
          id, 
          username, 
          password_hash, 
          ${providerCol},
          ${apiKeyCol},
          description,
          created_at
        FROM dyndns_users
      `);

      db.exec('DROP TABLE dyndns_users');
      db.exec('ALTER TABLE dyndns_users_new RENAME TO dyndns_users');
      db.exec('COMMIT');
      console.log('✓ Migration: Normalized dyndns_users schema');
    }
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      console.error('Migration rollback error:', rollbackError);
    }
    console.error('Migration error (dyndns_users schema):', e);
  }

  // Migration 2: Add record_id column to domains table if it doesn't exist
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

  // Migration 3: Add app_created column to domains table if it doesn't exist
  try {
    const checkColumn = db.prepare("PRAGMA table_info(domains)").all();
    const hasAppCreated = checkColumn.some(col => col.name === 'app_created');
    
    if (!hasAppCreated) {
      db.exec('ALTER TABLE domains ADD COLUMN app_created INTEGER DEFAULT 0');
      console.log('✓ Migration: Added app_created column to domains table');
    }
  } catch (e) {
    console.error('Migration error (app_created column):', e);
  }
}

export { db };
