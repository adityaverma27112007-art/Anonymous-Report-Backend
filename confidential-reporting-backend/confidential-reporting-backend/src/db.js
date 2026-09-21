const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const dbPath = process.env.DATABASE_PATH || "./data/reports.db";
const resolved = path.resolve(dbPath);
fs.mkdirSync(path.dirname(resolved), { recursive: true });

const db = new Database(resolved);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK(category IN ('Security','Harassment','Corruption','Technical','Other')),
    description TEXT NOT NULL,
    evidence_url TEXT,
    status TEXT NOT NULL CHECK(status IN ('SUBMITTED','UNDER_REVIEW','RESOLVED','DISMISSED')) DEFAULT 'SUBMITTED',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS case_codes (
    report_id TEXT PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS status_updates (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('SUBMITTED','UNDER_REVIEW','RESOLVED','DISMISSED')),
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS moderators (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
  CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);
  CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
  CREATE INDEX IF NOT EXISTS idx_status_updates_report_id ON status_updates(report_id);
`);

function now() {
  return new Date().toISOString();
}

function randomId() {
  return crypto.randomUUID();
}

module.exports = { db, now, randomId };
