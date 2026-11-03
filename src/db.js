import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS wants (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  text TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  done_when TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  creator TEXT,
  ip TEXT,
  source TEXT NOT NULL DEFAULT 'site',
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  hidden INTEGER NOT NULL DEFAULT 0,
  me_too INTEGER NOT NULL DEFAULT 0,
  answer_count INTEGER NOT NULL DEFAULT 0,
  fulfilled_answer_id INTEGER,
  fulfilled_at TEXT,
  reports INTEGER NOT NULL DEFAULT 0,
  agent_state TEXT NOT NULL DEFAULT 'pending',
  agent_note TEXT NOT NULL DEFAULT '',
  agent_at TEXT,
  topic_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS wants_created ON wants(created_at);
CREATE INDEX IF NOT EXISTS wants_status ON wants(status, hidden);
CREATE INDEX IF NOT EXISTS wants_agent ON wants(agent_state, hidden);
CREATE UNIQUE INDEX IF NOT EXISTS wants_source_url ON wants(source_url) WHERE source_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS metoos (
  want_id INTEGER NOT NULL REFERENCES wants(id) ON DELETE CASCADE,
  voter TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (want_id, voter)
);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY,
  want_id INTEGER NOT NULL REFERENCES wants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  repo_url TEXT,
  note TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  by_agent INTEGER NOT NULL DEFAULT 0,
  is_free INTEGER,
  is_open_source INTEGER,
  made_id INTEGER,
  works INTEGER NOT NULL DEFAULT 0,
  nofit INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  creator TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS answers_want ON answers(want_id);
CREATE INDEX IF NOT EXISTS answers_created ON answers(created_at);

CREATE TABLE IF NOT EXISTS answer_votes (
  answer_id INTEGER NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  voter TEXT NOT NULL,
  value INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (answer_id, voter)
);

CREATE TABLE IF NOT EXISTS made (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  want_id INTEGER REFERENCES wants(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS reports (
  kind TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  voter TEXT NOT NULL,
  PRIMARY KEY (kind, target_id, voter)
);

CREATE TABLE IF NOT EXISTS hits (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, key)
);

CREATE TABLE IF NOT EXISTS ratelimit (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS want_topics (
  want_id INTEGER NOT NULL REFERENCES wants(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  by_agent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (want_id, topic)
);
CREATE INDEX IF NOT EXISTS want_topics_topic ON want_topics(topic);

CREATE VIRTUAL TABLE IF NOT EXISTS wants_fts USING fts5(
  text, details, done_when,
  content='wants', content_rowid='id',
  tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS wants_ai AFTER INSERT ON wants BEGIN
  INSERT INTO wants_fts(rowid, text, details, done_when) VALUES (new.id, new.text, new.details, new.done_when);
END;
CREATE TRIGGER IF NOT EXISTS wants_ad AFTER DELETE ON wants BEGIN
  INSERT INTO wants_fts(wants_fts, rowid, text, details, done_when) VALUES ('delete', old.id, old.text, old.details, old.done_when);
END;
CREATE TRIGGER IF NOT EXISTS wants_au AFTER UPDATE OF text, details, done_when ON wants BEGIN
  INSERT INTO wants_fts(wants_fts, rowid, text, details, done_when) VALUES ('delete', old.id, old.text, old.details, old.done_when);
  INSERT INTO wants_fts(rowid, text, details, done_when) VALUES (new.id, new.text, new.details, new.done_when);
END;
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Add columns that later versions need. Each step runs only when the column is missing.
export function migrate(db) {
  const cols = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  const made = cols('made');
  if (!made.has('thumb')) db.exec(`ALTER TABLE made ADD COLUMN thumb BLOB`);
  if (!made.has('howto')) db.exec(`ALTER TABLE made ADD COLUMN howto TEXT NOT NULL DEFAULT '[]'`);
  // Early imports put an attribution paragraph in the details. The page now shows attribution from source_url.
  db.exec(`UPDATE wants SET details = rtrim(substr(details, 1, instr(details, 'The agent found this want') - 1), char(10, 13, 32))
    WHERE instr(details, 'The agent found this want') > 0`);
}
