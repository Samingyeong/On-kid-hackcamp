const path = require('path')
const { db, SIGN_MOTION_DIR } = require('./db')

function ensureSignMotionSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sign_lexicon_entries (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      api_source        TEXT NOT NULL,
      local_id          TEXT NOT NULL,
      title             TEXT NOT NULL,
      alternative_title TEXT,
      description       TEXT,
      video_url         TEXT,
      thumbnail_url     TEXT,
      detail_url        TEXT,
      sign_description  TEXT,
      sign_images       TEXT,
      collection_db     TEXT,
      category_type     TEXT,
      retarget_status   TEXT NOT NULL DEFAULT 'pending',
      fetched_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now')),
      UNIQUE(api_source, local_id)
    );

    CREATE TABLE IF NOT EXISTS sign_sources (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL UNIQUE,
      source_type     TEXT NOT NULL DEFAULT 'sign_fairytale',
      video_path      TEXT,
      transcript_path TEXT,
      notes           TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sign_motion_segments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id       INTEGER NOT NULL,
      lemma           TEXT NOT NULL,
      surface         TEXT,
      pos             TEXT,
      start_sec       REAL NOT NULL,
      end_sec         REAL NOT NULL,
      duration_sec    REAL,
      clip_path       TEXT,
      keypoints_path  TEXT,
      avatar_path     TEXT,
      lexicon_id      INTEGER,
      sign_description TEXT,
      sign_images     TEXT,
      confidence      REAL DEFAULT 0,
      review_status   TEXT NOT NULL DEFAULT 'candidate',
      notes           TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(source_id) REFERENCES sign_sources(id) ON DELETE CASCADE,
      FOREIGN KEY(lexicon_id) REFERENCES sign_lexicon_entries(id) ON DELETE SET NULL,
      UNIQUE(source_id, lemma, start_sec, end_sec)
    );

    CREATE INDEX IF NOT EXISTS idx_sign_lexicon_title ON sign_lexicon_entries(title);
    CREATE INDEX IF NOT EXISTS idx_sign_lexicon_collection ON sign_lexicon_entries(collection_db);
    CREATE INDEX IF NOT EXISTS idx_sign_lexicon_retarget ON sign_lexicon_entries(retarget_status);
    CREATE INDEX IF NOT EXISTS idx_sign_motion_lemma ON sign_motion_segments(lemma);
    CREATE INDEX IF NOT EXISTS idx_sign_motion_lemma_pos ON sign_motion_segments(lemma, pos);
    CREATE INDEX IF NOT EXISTS idx_sign_motion_review ON sign_motion_segments(review_status);
  `)
  migrateSignMotionSchema()
}

function columnNames(tableName) {
  return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map(row => row.name))
}

function migrateSignMotionSchema() {
  const segmentColumns = columnNames('sign_motion_segments')
  const segmentAdds = [
    ['lexicon_id', 'INTEGER'],
    ['sign_description', 'TEXT'],
    ['sign_images', 'TEXT'],
  ]
  for (const [name, type] of segmentAdds) {
    if (!segmentColumns.has(name)) {
      db.exec(`ALTER TABLE sign_motion_segments ADD COLUMN ${name} ${type}`)
    }
  }
}

function clampConfidence(value) {
  const numberValue = Number(value ?? 0)
  if (!Number.isFinite(numberValue)) return 0
  return Math.max(0, Math.min(1, numberValue))
}

function asNullableText(value) {
  if (value === undefined || value === null) return ''
  return String(value)
}

function normalizeSource(input) {
  if (!input || !String(input.title || '').trim()) {
    throw new Error('source.title is required')
  }
  return {
    title: String(input.title).trim(),
    source_type: asNullableText(input.source_type || input.sourceType || 'sign_fairytale'),
    video_path: asNullableText(input.video_path || input.videoPath),
    transcript_path: asNullableText(input.transcript_path || input.transcriptPath),
    notes: asNullableText(input.notes),
  }
}

function normalizeSegment(input) {
  if (!input || !String(input.lemma || '').trim()) {
    throw new Error('segment.lemma is required')
  }
  const sourceId = Number(input.source_id || input.sourceId)
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    throw new Error('segment.source_id is required')
  }
  const startSec = Number(input.start_sec ?? input.startSec)
  const endSec = Number(input.end_sec ?? input.endSec)
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
    throw new Error(`invalid segment time range for ${input.lemma}`)
  }
  return {
    source_id: sourceId,
    lemma: String(input.lemma).trim(),
    surface: asNullableText(input.surface || input.word),
    pos: asNullableText(input.pos || input.tag),
    start_sec: startSec,
    end_sec: endSec,
    duration_sec: Number((endSec - startSec).toFixed(3)),
    clip_path: asNullableText(input.clip_path || input.clipPath),
    keypoints_path: asNullableText(input.keypoints_path || input.keypointsPath),
    avatar_path: asNullableText(input.avatar_path || input.avatarPath),
    lexicon_id: input.lexicon_id || input.lexiconId || null,
    sign_description: asNullableText(input.sign_description || input.signDescription),
    sign_images: normalizeSignImages(input.sign_images || input.signImages),
    confidence: clampConfidence(input.confidence),
    review_status: asNullableText(input.review_status || input.reviewStatus || 'candidate'),
    notes: asNullableText(input.notes),
  }
}

function upsertSignSource(input) {
  const source = normalizeSource(input)
  db.prepare(`
    INSERT INTO sign_sources (title, source_type, video_path, transcript_path, notes)
    VALUES (@title, @source_type, @video_path, @transcript_path, @notes)
    ON CONFLICT(title) DO UPDATE SET
      source_type = excluded.source_type,
      video_path = COALESCE(NULLIF(excluded.video_path, ''), sign_sources.video_path),
      transcript_path = COALESCE(NULLIF(excluded.transcript_path, ''), sign_sources.transcript_path),
      notes = COALESCE(NULLIF(excluded.notes, ''), sign_sources.notes),
      updated_at = datetime('now')
  `).run(source)

  return db.prepare(`SELECT * FROM sign_sources WHERE title = ?`).get(source.title)
}

function toPublicMotionPath(value) {
  if (!value) return ''
  const raw = String(value)
  if (/^https?:\/\//.test(raw) || raw.startsWith('/')) return raw

  if (path.isAbsolute(raw)) {
    const rel = path.relative(SIGN_MOTION_DIR, raw)
    if (!rel.startsWith('..')) return `/sign-motion/${rel.split(path.sep).join('/')}`
    return raw
  }

  const normalized = raw
    .replace(/\\/g, '/')
    .replace(/^\.?\/*/, '')
    .replace(/^backend\/data\/sign_motion\//, '')
    .replace(/^book-backend\/data\/sign_motion\//, '')
    .replace(/^data\/sign_motion\//, '')
    .replace(/^sign_motion\//, '')

  return `/sign-motion/${normalized}`
}

function toPublicKeypointsPath(value) {
  const motionPath = toPublicMotionPath(value)
  if (!motionPath) return ''
  if (motionPath.startsWith('/sign-motion/') && motionPath.endsWith('.gz')) {
    return motionPath.replace('/sign-motion/', '/sign-motion-keypoints/')
  }
  return motionPath
}

function normalizeSignImages(value) {
  if (Array.isArray(value)) return JSON.stringify(value.filter(Boolean))
  if (!value) return ''
  const text = String(value).trim()
  if (!text) return ''
  if (text.startsWith('[')) return text
  return JSON.stringify(text.split(',').map(item => item.trim()).filter(Boolean))
}

function parseSignImages(value) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return String(value).split(',').map(item => item.trim()).filter(Boolean)
  }
}

function decorateSegment(row) {
  if (!row) return null
  return {
    ...row,
    clip_url: toPublicMotionPath(row.clip_path),
    keypoints_url: toPublicKeypointsPath(row.keypoints_path),
    avatar_url: toPublicMotionPath(row.avatar_path),
    sign_images_urls: parseSignImages(row.sign_images),
  }
}

function normalizeLexiconEntry(input) {
  const apiSource = asNullableText(input.api_source || input.apiSource)
  const localId = asNullableText(input.local_id || input.localId)
  const title = asNullableText(input.title).trim()
  if (!apiSource) throw new Error('lexicon.api_source is required')
  if (!localId) throw new Error('lexicon.local_id is required')
  if (!title) throw new Error('lexicon.title is required')
  return {
    api_source: apiSource,
    local_id: localId,
    title,
    alternative_title: asNullableText(input.alternative_title || input.alternativeTitle),
    description: asNullableText(input.description),
    video_url: asNullableText(input.video_url || input.videoUrl),
    thumbnail_url: asNullableText(input.thumbnail_url || input.thumbnailUrl),
    detail_url: asNullableText(input.detail_url || input.detailUrl || input.url),
    sign_description: asNullableText(input.sign_description || input.signDescription),
    sign_images: normalizeSignImages(input.sign_images || input.signImages),
    collection_db: asNullableText(input.collection_db || input.collectionDb),
    category_type: asNullableText(input.category_type || input.categoryType),
    retarget_status: asNullableText(input.retarget_status || input.retargetStatus || 'pending'),
  }
}

function upsertSignLexiconEntry(input) {
  const entry = normalizeLexiconEntry(input)
  db.prepare(`
    INSERT INTO sign_lexicon_entries (
      api_source, local_id, title, alternative_title, description, video_url,
      thumbnail_url, detail_url, sign_description, sign_images, collection_db,
      category_type, retarget_status
    )
    VALUES (
      @api_source, @local_id, @title, @alternative_title, @description, @video_url,
      @thumbnail_url, @detail_url, @sign_description, @sign_images, @collection_db,
      @category_type, @retarget_status
    )
    ON CONFLICT(api_source, local_id) DO UPDATE SET
      title = excluded.title,
      alternative_title = excluded.alternative_title,
      description = excluded.description,
      video_url = excluded.video_url,
      thumbnail_url = excluded.thumbnail_url,
      detail_url = excluded.detail_url,
      sign_description = excluded.sign_description,
      sign_images = excluded.sign_images,
      collection_db = excluded.collection_db,
      category_type = excluded.category_type,
      updated_at = datetime('now')
  `).run(entry)

  return db.prepare(`
    SELECT * FROM sign_lexicon_entries
    WHERE api_source = ? AND local_id = ?
  `).get(entry.api_source, entry.local_id)
}

function updateLexiconRetarget(input) {
  const {
    id,
    retarget_status,
    keypoints_path = '',
    avatar_path = '',
    clear_keypoints_path = false,
    clear_avatar_path = false,
  } = input
  db.prepare(`
    UPDATE sign_lexicon_entries
    SET retarget_status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(retarget_status, id)
  if (keypoints_path || avatar_path || clear_keypoints_path || clear_avatar_path) {
    db.prepare(`
      UPDATE sign_motion_segments
      SET
        keypoints_path = CASE
          WHEN ? THEN ''
          ELSE COALESCE(NULLIF(?, ''), keypoints_path)
        END,
        avatar_path = CASE
          WHEN ? THEN ''
          ELSE COALESCE(NULLIF(?, ''), avatar_path)
        END,
        review_status = CASE WHEN ? != '' THEN 'retargeted' ELSE review_status END,
        updated_at = datetime('now')
      WHERE lexicon_id = ?
    `).run(
      clear_keypoints_path ? 1 : 0,
      keypoints_path,
      clear_avatar_path ? 1 : 0,
      avatar_path,
      avatar_path,
      id
    )
  }
}

function listSignLexiconEntries({
  apiSource = '',
  status = '',
  collectionDb = '',
  limit = 50,
} = {}) {
  const conditions = []
  const params = []
  if (apiSource) {
    conditions.push('api_source = ?')
    params.push(apiSource)
  }
  if (status) {
    conditions.push('retarget_status = ?')
    params.push(status)
  }
  if (collectionDb) {
    conditions.push('collection_db = ?')
    params.push(collectionDb)
  }
  conditions.push("video_url != ''")
  const where = `WHERE ${conditions.join(' AND ')}`
  return db.prepare(`
    SELECT *
    FROM sign_lexicon_entries
    ${where}
    ORDER BY id ASC
    LIMIT ?
  `).all(...params, Number.isFinite(Number(limit)) ? Number(limit) : 50)
}

function insertSignMotionSegment(input) {
  const segment = normalizeSegment(input)
  db.prepare(`
    INSERT INTO sign_motion_segments (
      source_id, lemma, surface, pos, start_sec, end_sec, duration_sec,
      clip_path, keypoints_path, avatar_path, lexicon_id, sign_description,
      sign_images, confidence, review_status, notes
    )
    VALUES (
      @source_id, @lemma, @surface, @pos, @start_sec, @end_sec, @duration_sec,
      @clip_path, @keypoints_path, @avatar_path, @lexicon_id, @sign_description,
      @sign_images, @confidence, @review_status, @notes
    )
    ON CONFLICT(source_id, lemma, start_sec, end_sec) DO UPDATE SET
      surface = excluded.surface,
      pos = excluded.pos,
      duration_sec = excluded.duration_sec,
      clip_path = excluded.clip_path,
      keypoints_path = COALESCE(NULLIF(excluded.keypoints_path, ''), sign_motion_segments.keypoints_path),
      avatar_path = COALESCE(NULLIF(excluded.avatar_path, ''), sign_motion_segments.avatar_path),
      lexicon_id = COALESCE(excluded.lexicon_id, sign_motion_segments.lexicon_id),
      sign_description = excluded.sign_description,
      sign_images = excluded.sign_images,
      confidence = excluded.confidence,
      review_status = CASE
        WHEN sign_motion_segments.review_status = 'retargeted' THEN sign_motion_segments.review_status
        ELSE excluded.review_status
      END,
      notes = excluded.notes,
      updated_at = datetime('now')
  `).run(segment)

  return decorateSegment(db.prepare(`
    SELECT m.*, s.title AS source_title
    FROM sign_motion_segments m
    JOIN sign_sources s ON s.id = m.source_id
    WHERE m.source_id = ? AND m.lemma = ? AND m.start_sec = ? AND m.end_sec = ?
  `).get(segment.source_id, segment.lemma, segment.start_sec, segment.end_sec))
}

const bulkInsertSignMotionSegments = db.transaction(segments => (
  segments.map(segment => insertSignMotionSegment(segment))
))

function listSignMotions({ lemma = '', pos = '', reviewStatus = '', limit = 100 } = {}) {
  const conditions = []
  const params = []
  if (lemma) {
    conditions.push('m.lemma = ?')
    params.push(lemma)
  }
  if (pos) {
    conditions.push("(m.pos = ? OR m.pos = '')")
    params.push(pos)
  }
  if (reviewStatus) {
    conditions.push('m.review_status = ?')
    params.push(reviewStatus)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = db.prepare(`
    SELECT
      m.*,
      s.title AS source_title,
      COALESCE(NULLIF(m.sign_description, ''), l.sign_description) AS sign_description,
      COALESCE(NULLIF(m.sign_images, ''), l.sign_images) AS sign_images,
      l.detail_url,
      l.thumbnail_url,
      l.collection_db,
      l.category_type
    FROM sign_motion_segments m
    JOIN sign_sources s ON s.id = m.source_id
    LEFT JOIN sign_lexicon_entries l ON l.id = m.lexicon_id
    ${where}
    ORDER BY
      CASE m.review_status
        WHEN 'retargeted' THEN 0
        WHEN 'reviewed' THEN 1
        WHEN 'openapi' THEN 2
        WHEN 'candidate' THEN 3
        ELSE 4
      END,
      m.confidence DESC,
      m.duration_sec ASC,
      m.id ASC
    LIMIT ?
  `).all(...params, Number.isFinite(Number(limit)) ? Number(limit) : 100)

  return rows.map(decorateSegment)
}

function findSignMotionByLemma(lemma, pos = '', limit = 5) {
  if (!lemma) return []
  const exact = listSignMotions({ lemma, pos, limit })
  if (exact.length) return exact
  if (String(lemma).trim().length < 2) return []

  const rows = db.prepare(`
    SELECT
      m.*,
      s.title AS source_title,
      COALESCE(NULLIF(m.sign_description, ''), l.sign_description) AS sign_description,
      COALESCE(NULLIF(m.sign_images, ''), l.sign_images) AS sign_images,
      l.detail_url,
      l.thumbnail_url,
      l.collection_db,
      l.category_type
    FROM sign_motion_segments m
    JOIN sign_sources s ON s.id = m.source_id
    LEFT JOIN sign_lexicon_entries l ON l.id = m.lexicon_id
    WHERE
      m.lemma LIKE ?
      OR m.surface LIKE ?
      OR l.alternative_title LIKE ?
    ORDER BY
      CASE m.review_status
        WHEN 'retargeted' THEN 0
        WHEN 'reviewed' THEN 1
        WHEN 'openapi' THEN 2
        WHEN 'candidate' THEN 3
        ELSE 4
      END,
      m.confidence DESC,
      m.id ASC
    LIMIT ?
  `).all(`%${lemma}%`, `%${lemma}%`, `%${lemma}%`, Number.isFinite(Number(limit)) ? Number(limit) : 5)
  return rows.map(decorateSegment)
}

ensureSignMotionSchema()

module.exports = {
  ensureSignMotionSchema,
  upsertSignLexiconEntry,
  updateLexiconRetarget,
  listSignLexiconEntries,
  upsertSignSource,
  insertSignMotionSegment,
  bulkInsertSignMotionSegments,
  listSignMotions,
  findSignMotionByLemma,
  toPublicMotionPath,
}
