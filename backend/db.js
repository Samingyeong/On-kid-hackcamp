const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const DATA_DIR = path.join(__dirname, 'data')
const DB_PATH  = path.join(DATA_DIR, 'books.db')
const IMG_DIR  = path.join(DATA_DIR, 'images')

// 디렉토리 생성
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(IMG_DIR))  fs.mkdirSync(IMG_DIR,  { recursive: true })

const db = new Database(DB_PATH)

// WAL 모드 (읽기 성능 향상)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

// ─── 테이블 생성 ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL UNIQUE,
    description TEXT,
    thumbnail   TEXT,
    local_img   TEXT,
    url         TEXT,
    creator     TEXT,
    reg_date    TEXT,
    story_type  TEXT NOT NULL DEFAULT 'creative',
    source      TEXT NOT NULL DEFAULT 'multilang',
    collection  TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_story_type ON books(story_type);
  CREATE INDEX IF NOT EXISTS idx_title      ON books(title);

  CREATE TABLE IF NOT EXISTS sync_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    synced_at  TEXT DEFAULT (datetime('now')),
    count      INTEGER,
    status     TEXT
  );

  CREATE TABLE IF NOT EXISTS word_study (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    word       TEXT NOT NULL,
    base_form  TEXT NOT NULL,
    pos        TEXT,
    definition TEXT,
    known      INTEGER DEFAULT 0,
    from_book  TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(base_form)
  );

  CREATE TABLE IF NOT EXISTS reading_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    read_at    TEXT DEFAULT (date('now')),
    UNIQUE(title, read_at)
  );
  CREATE INDEX IF NOT EXISTS idx_read_at ON reading_history(read_at DESC);

  CREATE TABLE IF NOT EXISTS book_words (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    word       TEXT NOT NULL,
    learned    INTEGER DEFAULT 0,
    UNIQUE(title, word)
  );
  CREATE INDEX IF NOT EXISTS idx_book_words_title ON book_words(title);

  CREATE TABLE IF NOT EXISTS book_sentences (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    sentence   TEXT NOT NULL,
    learned    INTEGER DEFAULT 0,
    UNIQUE(title, sentence)
  );
  CREATE INDEX IF NOT EXISTS idx_book_sentences_title ON book_sentences(title);
`)

// ─── 쿼리 헬퍼 ───────────────────────────────────────────────
const stmts = {
  upsert: db.prepare(`
    INSERT OR REPLACE INTO books (title, description, thumbnail, url, creator, reg_date, story_type, source, collection)
    VALUES (@title, @description, @thumbnail, @url, @creator, @reg_date, @story_type, @source, @collection)
  `),

  updateLocalImg: db.prepare(`UPDATE books SET local_img = ? WHERE title = ?`),

  getAll: db.prepare(`SELECT * FROM books ORDER BY reg_date DESC`),

  getByType: db.prepare(`SELECT * FROM books WHERE story_type = ? ORDER BY reg_date DESC`),

  search: db.prepare(`
    SELECT * FROM books
    WHERE title LIKE ? OR creator LIKE ?
    ORDER BY reg_date DESC
  `),

  searchByType: db.prepare(`
    SELECT * FROM books
    WHERE story_type = ? AND (title LIKE ? OR creator LIKE ?)
    ORDER BY reg_date DESC
  `),

  count: db.prepare(`SELECT COUNT(*) as cnt FROM books`),

  countByType: db.prepare(`SELECT story_type, COUNT(*) as cnt FROM books GROUP BY story_type`),

  logSync: db.prepare(`INSERT INTO sync_log (count, status) VALUES (?, ?)`),

  lastSync: db.prepare(`SELECT * FROM sync_log ORDER BY id DESC LIMIT 1`),
}

module.exports = { db, stmts, IMG_DIR }
