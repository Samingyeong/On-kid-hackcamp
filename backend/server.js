require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const https   = require('https')
const fs      = require('fs')
const path    = require('path')
const zlib    = require('zlib')
const cron    = require('node-cron')
const { spawn } = require('child_process')
const { db, IMG_DIR, SIGN_MOTION_DIR } = require('./db')
const { syncBooks }          = require('./sync')
const { downloadAllImages }  = require('./images')
const { downloadBookVideos, getLocalVideoPath, VIDEO_DIR } = require('./videos')
const { extractKeywords, getBaseForm } = require('./groq_nlp')
const {
  getLearningFeedback,
  generateQuiz,
  explainWord,
  generateWeeklyReport,
  tutorialStep,
  routeVoiceDialog: routeVoiceDialogWithMidm,
  getStudyAiFeedback,
} = require('./midm')
const { listSignMotions } = require('./sign_motion')
const { evaluateSignPractice } = require('./sign_practice_eval')

const app  = express()
const PORT = 4000
const VOICE_SERVICE_URL = process.env.VOICE_SERVICE_URL || 'http://127.0.0.1:4100'

// ─── 사전 결과 서버 캐시 ──────────────────────────────────────
const nlpCache  = new Map()
const dictCache = new Map()

// DB에서 사전 캐시 로드
try {
  db.exec(`CREATE TABLE IF NOT EXISTS dict_cache (word TEXT PRIMARY KEY, result TEXT)`)
  const rows = db.prepare(`SELECT word, result FROM dict_cache`).all()
  for (const row of rows) dictCache.set(row.word, JSON.parse(row.result))
  if (rows.length) console.log(`[dict] DB 캐시에서 ${rows.length}개 단어 로드`)
} catch {}

const saveDictCache = db.prepare(`INSERT OR REPLACE INTO dict_cache (word, result) VALUES (?, ?)`)

app.use(cors())
app.use(express.json({ limit: '12mb' }))

// ─── 정적 이미지 서빙 ─────────────────────────────────────────
app.use('/images', express.static(IMG_DIR, { maxAge: '7d', etag: true }))
app.use('/sign-motion', express.static(SIGN_MOTION_DIR, { maxAge: '7d', etag: true }))

app.get('/sign-motion-keypoints/*', (req, res) => {
  const relPath = req.params[0] || ''
  const fullPath = path.resolve(SIGN_MOTION_DIR, relPath)
  if (!fullPath.startsWith(`${SIGN_MOTION_DIR}${path.sep}`)) {
    return res.status(400).send('Invalid keypoint path')
  }
  if (!fs.existsSync(fullPath)) return res.status(404).send('Not found')

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=604800')
  if (fullPath.endsWith('.gz')) {
    fs.createReadStream(fullPath)
      .pipe(zlib.createGunzip())
      .on('error', error => {
        if (!res.headersSent) res.status(500).send(error.message)
        else res.destroy(error)
      })
      .pipe(res)
    return
  }
  res.sendFile(fullPath)
})

// ─── 로컬 영상/VTT 서빙 ──────────────────────────────────────
app.use('/videos', express.static(VIDEO_DIR, {
  maxAge: '30d',
  etag: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.vtt')) {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
      res.setHeader('Access-Control-Allow-Origin', '*')
    }
    if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Accept-Ranges', 'bytes')
    }
  }
}))

// ─── 책 목록 API ──────────────────────────────────────────────
app.get('/api/books', (req, res) => {
  const { type, q, year, page = '1', limit = '20' } = req.query
  const offset = (parseInt(page) - 1) * parseInt(limit)
  const lim    = parseInt(limit)

  // 조건 조합
  const conditions = []
  const params = []

  if (type && type !== 'all') { conditions.push('story_type=?'); params.push(type) }
  if (year)                   { conditions.push("substr(reg_date,1,4)=?"); params.push(year) }
  if (q)                      { conditions.push('(title LIKE ? OR creator LIKE ?)'); params.push(`%${q}%`, `%${q}%`) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const rows  = db.prepare(`SELECT * FROM books ${where} ORDER BY reg_date DESC LIMIT ? OFFSET ?`).all(...params, lim, offset)
  const total = db.prepare(`SELECT COUNT(*) as c FROM books ${where}`).get(...params).c

  res.json({ total, page: parseInt(page), limit: lim, items: rows })
})

app.get('/api/books/years', (req, res) => {
  const rows = db.prepare(`SELECT DISTINCT substr(reg_date,1,4) as year, COUNT(*) as cnt FROM books GROUP BY year ORDER BY year DESC`).all()
  res.json(rows)
})

app.get('/api/books/new', (req, res) => {
  const limit = parseInt(req.query.limit || '20')
  const rows  = db.prepare(`SELECT * FROM books ORDER BY reg_date DESC LIMIT ?`).all(limit)
  res.json({ items: rows })
})

app.get('/api/books/stats', (req, res) => {
  const counts = db.prepare(`SELECT story_type, COUNT(*) as cnt FROM books GROUP BY story_type`).all()
  const total  = db.prepare(`SELECT COUNT(*) as cnt FROM books`).get()
  const last   = db.prepare(`SELECT * FROM sync_log ORDER BY id DESC LIMIT 1`).get()
  res.json({ total: total.cnt, byType: counts, lastSync: last })
})

// ─── Reader용 책 데이터 API ───────────────────────────────────
// 제목으로 Reader에 필요한 모든 데이터 반환 (thumbnail=nlcy원본, local_img=로컬경로)
app.get('/api/books/reader', (req, res) => {
  const { title } = req.query
  if (!title) return res.status(400).json({ error: 'title required' })
  const row = db.prepare(`SELECT * FROM books WHERE title = ?`).get(title)
  if (!row) return res.status(404).json({ error: 'not found' })

  const localThumb = row.local_img
    ? `http://localhost:4000${row.local_img}`
    : row.thumbnail ? `/proxy?url=${encodeURIComponent(row.thumbnail)}` : ''

  res.json({
    title:       row.title,
    description: row.description,
    thumbnail:   localThumb,       // 표시용 (로컬 or 프록시)
    nlcyThumb:   row.thumbnail,    // 영상/VTT URL 계산용 원본 nlcy URL
    url:         row.url,
    creator:     row.creator,
    storyType:   row.story_type,
  })
})

// ─── 프록시 (영상/VTT) ────────────────────────────────────────
const NLCY_HEADERS = {
  'Referer':    'https://www.nlcy.go.kr/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Origin':     'https://www.nlcy.go.kr',
}
const vttCache = new Map()

app.get('/proxy', (req, res) => {
  const target = req.query.url
  if (!target || !target.startsWith('https://www.nlcy.go.kr/')) {
    return res.status(400).send('Invalid URL')
  }
  const ext = target.split('?')[0].split('.').pop()

  // ── 로컬 캐시 우선 확인 ──────────────────────────────────────
  // URL에서 lang 추출: Nlcy_001_001_ko.mp4 → lang=ko
  const langMatch = target.match(/_([a-z]{2})\.(mp4|vtt)$/)
  if (langMatch) {
    const [, lang, fileExt] = langMatch
    // thumbnail URL 역산: _ko.mp4 → .png
    const thumbUrl = target.replace(`_${lang}.${fileExt}`, '.png')
    const localPath = getLocalVideoPath(thumbUrl, lang, fileExt)
    if (localPath) {
      const base = require('path').basename(localPath)
      return res.redirect(`/videos/${base}`)
    }
  }

  if (ext === 'vtt') {
    if (vttCache.has(target)) {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
      res.setHeader('Access-Control-Allow-Origin', '*')
      return res.send(vttCache.get(target))
    }
    const chunks = []
    https.get(target, { headers: NLCY_HEADERS }, r => {
      r.on('data', c => chunks.push(c))
      r.on('end', () => {
        const buf = Buffer.concat(chunks)
        if (r.statusCode === 200) vttCache.set(target, buf)
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.send(buf)
      })
    }).on('error', e => res.status(502).send(e.message))
    return
  }

  // MP4 스트리밍
  const headers = { ...NLCY_HEADERS }
  if (req.headers.range) headers['Range'] = req.headers.range
  const proxyReq = https.get(target, { headers }, r => {
    if (!res.headersSent) {
      res.writeHead(r.statusCode, {
        'Content-Type':   'video/mp4',
        'Content-Length': r.headers['content-length'] || '',
        'Content-Range':  r.headers['content-range']  || '',
        'Accept-Ranges':  'bytes',
        'Cache-Control':  'public, max-age=86400',
      })
    }
    r.pipe(res)
    r.on('error', () => { if (!res.headersSent) res.status(502).end() })
  })
  proxyReq.on('error', e => { if (!res.headersSent) res.status(502).send(e.message) })
  // 클라이언트가 연결 끊으면 upstream도 중단
  req.on('close', () => proxyReq.destroy())
})

// ─── 형태소 분석 (korean_nlp.py 상주 프로세스) ───────────────
app.get('/api/morpheme', async (req, res) => {
  const { mode = 'sentence', q } = req.query
  if (!q) return res.status(400).json({ error: 'q is required' })
  const cacheKey = `${mode}:${q}`
  if (nlpCache.has(cacheKey)) return res.json(nlpCache.get(cacheKey))
  try {
    const result = await runNlp(mode, q)
    nlpCache.set(cacheKey, result)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// 자막 전체 일괄 분석 (책 열 때 한번에 처리)
app.post('/api/morpheme/batch', async (req, res) => {
  const { sentences } = req.body  // string[]
  if (!Array.isArray(sentences)) return res.status(400).json({ error: 'sentences required' })
  try {
    const results = await Promise.all(
      sentences.map(async s => {
        const key = `sentence:${s}`
        if (nlpCache.has(key)) return { sentence: s, ...nlpCache.get(key) }
        const r = await runNlp('sentence', s)
        nlpCache.set(key, r)
        return { sentence: s, ...r }
      })
    )
    res.json(results)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── 수어 따라하기 평가 API ───────────────────────────────────
app.get('/api/sign-motions', (req, res) => {
  const { lemma = '', pos = '', reviewStatus = '', limit = '100' } = req.query
  try {
    const items = listSignMotions({
      lemma: String(lemma),
      pos: String(pos),
      reviewStatus: String(reviewStatus),
      limit: parseInt(limit, 10),
    })
    res.json({ items })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/sign-practice/words', (req, res) => {
  const { limit = '120', scope = 'hen_nureongi' } = req.query
  const parsedLimit = Number.parseInt(String(limit), 10)
  const maxItems = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 200)) : 120
  const exactOnly = String(scope) !== 'all'

  try {
    const rows = db.prepare(`
      SELECT
        lemma,
        COUNT(*) AS segment_count,
        MIN(id) AS first_segment_id
      FROM sign_motion_segments
      WHERE
        keypoints_path != ''
        ${exactOnly ? "AND notes LIKE 'hen_nureongi exact%'" : ''}
      GROUP BY lemma
      ORDER BY lemma COLLATE NOCASE ASC
      LIMIT ?
    `).all(maxItems)

    const items = rows.map(row => {
      const motions = listSignMotions({ lemma: row.lemma, reviewStatus: 'retargeted', limit: 8 })
      const exactMotions = exactOnly
        ? motions.filter(item => String(item.notes || '').startsWith('hen_nureongi exact'))
        : motions
      return {
        word: row.lemma,
        base_form: row.lemma,
        segment_count: row.segment_count,
        segment: exactMotions.find(item => item.keypoints_url) || null,
      }
    }).filter(item => item.segment)

    res.json({ items })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/sign-practice/evaluate', (req, res) => {
  try {
    const result = evaluateSignPractice(req.body || {})
    res.json(result)
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message })
  }
})

// ─── 학습 AI 피드백 API ───────────────────────────────────────
app.post('/api/learning/feedback', async (req, res) => {
  try {
    const result = await getStudyAiFeedback(req.body || {})
    res.json(result)
  } catch (e) {
    res.json({
      character_message: '잘하고 있어! 계속 해보자!',
      feedback_type: '응원',
      animation_reaction: '끄덕임',
      recommended_difficulty: '유지',
      flow_switch: false,
    })
  }
})

// ─── 단어 학습 API ────────────────────────────────────────────
// POST /api/words  { word, base_form, pos, definition, known, from_book }
app.post('/api/words', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { word, base_form, pos, definition, known = 0, from_book = '' } = req.body
  if (!base_form) return res.status(400).json({ error: 'base_form required' })
  db.prepare(`
    INSERT INTO word_study (user_id, word, base_form, pos, definition, known, from_book)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, base_form) DO UPDATE SET
      known = excluded.known,
      definition = excluded.definition
  `).run(userId, word || base_form, base_form, pos || '', definition || '', known, from_book)
  res.json({ ok: true })
})

// GET /api/words?known=0|1|all
app.get('/api/words', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { known } = req.query
  let rows
  if (known === '0')      rows = db.prepare(`SELECT * FROM word_study WHERE user_id=? AND known=0 ORDER BY created_at DESC`).all(userId)
  else if (known === '1') rows = db.prepare(`SELECT * FROM word_study WHERE user_id=? AND known=1 ORDER BY created_at DESC`).all(userId)
  else                    rows = db.prepare(`SELECT * FROM word_study WHERE user_id=? ORDER BY created_at DESC`).all(userId)
  res.json(rows)
})

// PATCH /api/words/:id  { known }
app.patch('/api/words/:id', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { known } = req.body
  db.prepare(`UPDATE word_study SET known=? WHERE id=? AND user_id=?`).run(known, req.params.id, userId)
  res.json({ ok: true })
})

// DELETE /api/words/:id
app.delete('/api/words/:id', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  db.prepare(`DELETE FROM word_study WHERE id=? AND user_id=?`).run(req.params.id, userId)
  res.json({ ok: true })
})

// ─── 한국어사전 (캐시 포함) ───────────────────────────────────
const KRDICT_KEY = process.env.KRDICT_API_KEY

app.get('/dict', async (req, res) => {
  const q = req.query.q
  if (!q) return res.json([])
  if (dictCache.has(q)) return res.json(dictCache.get(q))
  try {
    const data = await new Promise((resolve, reject) => {
      const chunks = []
      https.get(`https://krdict.korean.go.kr/api/search?key=${KRDICT_KEY}&q=${encodeURIComponent(q)}&type_search=search&part=word`, r => {
        r.on('data', c => chunks.push(c))
        r.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      }).on('error', reject)
    })
    const items = []
    const matches = data.match(/<item>[\s\S]*?<\/item>/g) || []
    matches.forEach(item => {
      const word  = (item.match(/<word>([^<]+)<\/word>/)             || [])[1] || ''
      const pos   = (item.match(/<pos>([^<]+)<\/pos>/)               || [])[1] || ''
      const grade = (item.match(/<word_grade>([^<]+)<\/word_grade>/) || [])[1] || ''
      const defs  = [...item.matchAll(/<definition>([^<]+)<\/definition>/g)].map(m => m[1])
      items.push({ word, pos, grade, definitions: defs })
    })
    dictCache.set(q, items)
    try { saveDictCache.run(q, JSON.stringify(items)) } catch {}
    res.json(items)
  } catch { res.json([]) }
})

// ─── Python NLP 상주 프로세스 ─────────────────────────────────
const NLP_SCRIPT = path.join(__dirname, 'korean_nlp_daemon.py')
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')
let nlpProcess = null
let nlpReady = false
const nlpQueue = [] // { resolve, reject }

function startPython() {
  nlpProcess = spawn(PYTHON_BIN, [NLP_SCRIPT], {
    cwd: __dirname,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let buffer = ''
  nlpProcess.stdout.on('data', data => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed.status === 'ready') {
          nlpReady = true
          console.log('[nlp] Python 상주 프로세스 준비 완료')
          continue
        }
        const pending = nlpQueue.shift()
        if (pending) pending.resolve(parsed)
      } catch {
        const pending = nlpQueue.shift()
        if (pending) pending.reject(new Error('NLP parse error'))
      }
    }
  })

  nlpProcess.stderr.on('data', d => console.error('[nlp stderr]', d.toString()))
  nlpProcess.on('close', code => {
    console.warn(`[nlp] Python 프로세스 종료 (code ${code}), 3초 후 재시작...`)
    nlpReady = false
    // 대기 중인 요청 모두 실패 처리
    while (nlpQueue.length) nlpQueue.shift().reject(new Error('NLP process died'))
    setTimeout(startPython, 3000)
  })
  nlpProcess.on('error', e => {
    console.warn('[nlp] Python 실행 실패:', e.message)
    nlpReady = false
  })
}

function runNlp(mode, text) {
  return new Promise((resolve, reject) => {
    if (!nlpProcess || !nlpReady) {
      // 폴백: 일회성 spawn
      const py = spawn(PYTHON_BIN, [path.join(__dirname, 'korean_nlp.py'), mode, text], {
        cwd: __dirname,
        timeout: 10000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      })
      const chunks = []
      py.stdout.setEncoding('utf8')
      py.stdout.on('data', d => chunks.push(d))
      py.on('close', () => {
        try { resolve(JSON.parse(chunks.join(''))) }
        catch { reject(new Error('NLP parse error')) }
      })
      py.on('error', reject)
      return
    }
    nlpQueue.push({ resolve, reject })
    nlpProcess.stdin.write(JSON.stringify({ mode, text }) + '\n')
    // 타임아웃
    setTimeout(() => {
      const idx = nlpQueue.indexOf(arguments[0])
      if (idx >= 0) {
        nlpQueue.splice(idx, 1)
        reject(new Error('NLP timeout'))
      }
    }, 8000)
  })
}

// ─── 읽은 책 기록 API ────────────────────────────────────────
// POST /api/reading-history { title }
app.post('/api/reading-history', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { title } = req.body
  if (!title) return res.status(400).json({ error: 'title required' })
  db.prepare(`INSERT OR IGNORE INTO reading_history (user_id, title) VALUES (?, ?)`).run(userId, title)
  res.json({ ok: true })
})

// GET /api/reading-history — 읽은 책 목록 (중복 제거, 최신순, 오늘 읽은 책 우선)
app.get('/api/reading-history', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const rows = db.prepare(`
    SELECT rh.title, MAX(rh.read_at) as read_at, b.thumbnail, b.local_img, b.description, b.url, b.story_type
    FROM reading_history rh
    LEFT JOIN books b ON b.title = rh.title
    WHERE rh.user_id = ?
    GROUP BY rh.title
    ORDER BY
      CASE WHEN MAX(rh.read_at) = date('now') THEN 0 ELSE 1 END,
      MAX(rh.read_at) DESC
    LIMIT 20
  `).all(userId)

  const items = rows.map(row => ({
    title: row.title,
    readAt: row.read_at,
    thumbnail: row.local_img ? `http://localhost:4000${row.local_img}` : (row.thumbnail || ''),
    description: row.description || '',
    url: row.url || '',
    isToday: row.read_at === new Date().toISOString().slice(0, 10),
  }))
  res.json(items)
})

// ─── 책 단어 추출 API ────────────────────────────────────────
// POST /api/books/words — 자막 텍스트에서 단어 추출 후 저장
app.post('/api/books/words', async (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { title, sentences } = req.body
  if (!title || !Array.isArray(sentences)) return res.status(400).json({ error: 'title and sentences required' })

  try {
    const allText = sentences.join(' ')
    const result = await runNlp('sentence', allText)
    const keywords = (result.keywords || [])
      .filter(k => k.tag && (k.tag.startsWith('NN') || k.tag.startsWith('VV') || k.tag.startsWith('VA')))
      .map(k => k.form)
      .filter(w => w.length >= 2)

    const unique = [...new Set(keywords)].slice(0, 20)

    // DB에 저장 (book_words 테이블)
    const insert = db.prepare(`INSERT OR IGNORE INTO book_words (user_id, title, word) VALUES (?, ?, ?)`)
    const tx = db.transaction(() => {
      for (const word of unique) insert.run(userId, title, word)
    })
    tx()

    res.json({ words: unique, count: unique.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/books/words?title=... — 저장된 책 단어 조회
app.get('/api/books/words', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { title } = req.query
  if (!title) return res.status(400).json({ error: 'title required' })

  const rows = db.prepare(`SELECT word, learned FROM book_words WHERE user_id=? AND title = ? ORDER BY id`).all(userId, title)
  res.json(rows)
})

// PATCH /api/books/words/learned — 단어 학습 완료 표시
app.patch('/api/books/words/learned', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { title, word } = req.body
  if (!title || !word) return res.status(400).json({ error: 'title and word required' })
  db.prepare(`UPDATE book_words SET learned = 1 WHERE user_id=? AND title = ? AND word = ?`).run(userId, title, word)
  res.json({ ok: true })
})

// ─── 문장 저장/조회 API ──────────────────────────────────────
// POST /api/books/sentences — 문장 저장
app.post('/api/books/sentences', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { title, sentences } = req.body
  if (!title || !Array.isArray(sentences)) return res.status(400).json({ error: 'title and sentences required' })
  const insert = db.prepare(`INSERT OR IGNORE INTO book_sentences (user_id, title, sentence) VALUES (?, ?, ?)`)
  const tx = db.transaction(() => {
    for (const s of sentences) {
      if (s.trim().length > 2) insert.run(userId, title, s.trim())
    }
  })
  tx()
  res.json({ ok: true, count: sentences.length })
})

// GET /api/books/sentences?title=...
app.get('/api/books/sentences', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { title } = req.query
  if (!title) return res.status(400).json({ error: 'title required' })
  const rows = db.prepare(`SELECT sentence, learned FROM book_sentences WHERE user_id=? AND title = ? ORDER BY id`).all(userId, title)
  res.json(rows)
})

// PATCH /api/books/sentences/learned
app.patch('/api/books/sentences/learned', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { title, sentence } = req.body
  if (!title || !sentence) return res.status(400).json({ error: 'title and sentence required' })
  db.prepare(`UPDATE book_sentences SET learned = 1 WHERE user_id=? AND title = ? AND sentence = ?`).run(userId, title, sentence)
  res.json({ ok: true })
})

// ─── 따라쓰기 채점 API (Google Vision OCR) ────────────────────
const VISION_KEY = process.env.GOOGLE_VISION_API_KEY

app.post('/api/writing/check', async (req, res) => {
  const { image, targetWord } = req.body
  if (!image || !targetWord) return res.status(400).json({ error: 'image and targetWord required' })
  if (!VISION_KEY) return res.status(500).json({ error: 'Vision API key not configured' })

  try {
    const requestData = JSON.stringify({
      requests: [{
        image: { content: image },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: ['ko'] }
      }]
    })

    const result = await new Promise((resolve, reject) => {
      const postReq = https.request({
        hostname: 'vision.googleapis.com',
        path: `/v1/images:annotate?key=${VISION_KEY}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(requestData) }
      }, response => {
        const chunks = []
        response.on('data', c => chunks.push(c))
        response.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
          catch { reject(new Error('parse error')) }
        })
      })
      postReq.on('error', reject)
      postReq.setTimeout(15000, () => { postReq.destroy(); reject(new Error('timeout')) })
      postReq.write(requestData)
      postReq.end()
    })

    const recognized = result.responses?.[0]?.fullTextAnnotation?.text?.trim() || ''
    const correct = recognized.includes(targetWord)

    res.json({ recognized, targetWord, correct })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── 책 난이도 분석 + 수준 기반 추천 ─────────────────────────

// 단어 난이도 판정 (글자 수 + 한국어기초사전 등급 기반)
function classifyWordLevel(word) {
  if (!word || word.length <= 2) return 'beginner'
  if (word.length <= 3) return 'intermediate'
  return 'advanced'
}

// POST /api/books/analyze-difficulty — 책의 단어 난이도 분석 후 저장
app.post('/api/books/analyze-difficulty', async (req, res) => {
  const { title, words } = req.body
  if (!title || !Array.isArray(words)) return res.status(400).json({ error: 'title and words required' })

  const total = words.length || 1
  let beginner = 0, intermediate = 0, advanced = 0

  for (const w of words) {
    const level = classifyWordLevel(w)
    if (level === 'beginner') beginner++
    else if (level === 'intermediate') intermediate++
    else advanced++
  }

  const beginnerRatio = beginner / total
  const intermediateRatio = intermediate / total
  const advancedRatio = advanced / total

  // 전체 난이도 판정
  let level = 'beginner'
  if (advancedRatio > 0.3) level = 'advanced'
  else if (intermediateRatio + advancedRatio > 0.4) level = 'intermediate'

  db.prepare(`
    INSERT OR REPLACE INTO book_difficulty
    (title, total_words, beginner_count, intermediate_count, advanced_count,
     beginner_ratio, intermediate_ratio, advanced_ratio, level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, total, beginner, intermediate, advanced,
         beginnerRatio, intermediateRatio, advancedRatio, level)

  res.json({ title, level, total_words: total, beginner, intermediate, advanced })
})

// GET /api/books/recommend?level=beginner|intermediate|advanced&limit=4
// 아이 수준에 맞는 책 추천 (영상 재생 가능한 책만)
app.get('/api/books/recommend', (req, res) => {
  const { level = 'beginner', limit = '4' } = req.query
  const lim = parseInt(limit)

  // 해당 레벨 책 우선 (Nlcy_001_ = 2025년 데이터, 영상+자막 확실히 제공)
  let rows = db.prepare(`
    SELECT bd.*, b.thumbnail, b.local_img, b.description, b.story_type, b.url
    FROM book_difficulty bd
    JOIN books b ON b.title = bd.title
    WHERE bd.level = ?
      AND b.thumbnail LIKE '%/Nlcy_001_%'
    ORDER BY RANDOM()
    LIMIT ?
  `).all(level, lim)

  // 부족하면 한 단계 아래 추가
  if (rows.length < lim) {
    const fallbackLevel = level === 'advanced' ? 'intermediate' : 'beginner'
    const more = db.prepare(`
      SELECT bd.*, b.thumbnail, b.local_img, b.description, b.story_type, b.url
      FROM book_difficulty bd
      JOIN books b ON b.title = bd.title
      WHERE bd.level = ?
        AND b.thumbnail LIKE '%/Nlcy_001_%'
        AND bd.title NOT IN (${rows.map(() => '?').join(',') || "''"})
      ORDER BY RANDOM()
      LIMIT ?
    `).all(fallbackLevel, ...rows.map(r => r.title), lim - rows.length)
    rows = [...rows, ...more]
  }

  // 아직도 부족하면 Nlcy_001_ 아무 레벨에서
  if (rows.length < lim) {
    const more = db.prepare(`
      SELECT bd.*, b.thumbnail, b.local_img, b.description, b.story_type, b.url
      FROM book_difficulty bd
      JOIN books b ON b.title = bd.title
      WHERE b.thumbnail LIKE '%/Nlcy_001_%'
        AND bd.title NOT IN (${rows.map(() => '?').join(',') || "''"})
      ORDER BY RANDOM()
      LIMIT ?
    `).all(...rows.map(r => r.title), lim - rows.length)
    rows = [...rows, ...more]
  }

  const items = rows.map(r => ({
    title: r.title,
    level: r.level,
    totalWords: r.total_words || 0,
    thumbnail: r.local_img ? `http://localhost:4000${r.local_img}` : (r.thumbnail || ''),
    description: r.description || '',
    storyType: r.story_type || '',
  }))

  res.json(items)
})

// GET /api/books/difficulty-stats — 전체 난이도 분포 통계
app.get('/api/books/difficulty-stats', (req, res) => {
  const stats = db.prepare(`
    SELECT level, COUNT(*) as cnt FROM book_difficulty GROUP BY level
  `).all()
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM book_difficulty`).get()
  res.json({ total: total.cnt, byLevel: stats })
})

// ─── 튜토리얼 퀴즈 데이터 API ────────────────────────────────
// GET /api/tutor/quiz-data — 오답 단어 + 해당 문장 기반 퀴즈 데이터
app.get('/api/tutor/quiz-data', (req, res) => {
  const userId = req.headers['x-user-id'] || ''

  // 1. 모르는 단어 (known=0) 가져오기
  const unknownWords = db.prepare(`
    SELECT base_form, word, definition, from_book
    FROM word_study
    WHERE user_id = ? AND known = 0
    ORDER BY RANDOM()
    LIMIT 10
  `).all(userId)

  // 2. 해당 단어가 포함된 문장 가져오기
  const sentenceQuiz = []
  for (const w of unknownWords.slice(0, 5)) {
    if (!w.from_book) continue
    const sentences = db.prepare(`
      SELECT sentence FROM book_sentences
      WHERE user_id = ? AND title = ? AND sentence LIKE ?
      LIMIT 1
    `).all(userId, w.from_book, `%${w.base_form}%`)

    if (sentences.length > 0) {
      sentenceQuiz.push({
        word: w.base_form,
        definition: w.definition || '',
        sentence: sentences[0].sentence,
        book: w.from_book,
      })
    }
  }

  // 3. 단어 테스트용 (오답 단어 5개)
  const wordTest = unknownWords.slice(0, 5).map(w => ({
    word: w.base_form,
    hint: w.definition || '다시 한번 생각해봐!',
    book: w.from_book || '',
  }))

  res.json({
    hasData: unknownWords.length >= 3,
    wordTest,
    sentenceQuiz,
  })
})

// GET /api/study/sentences?book=... — 모르는 단어가 포함된 핵심 문장 추출
app.get('/api/study/sentences', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { book } = req.query

  // 모르는 단어 목록
  const unknownWords = book
    ? db.prepare(`SELECT base_form FROM word_study WHERE user_id=? AND known=0 AND from_book=?`).all(userId, book)
    : db.prepare(`SELECT base_form FROM word_study WHERE user_id=? AND known=0`).all(userId)

  if (unknownWords.length === 0) {
    return res.json({ sentences: [], words: [] })
  }

  // 해당 단어가 포함된 문장 추출
  const wordList = unknownWords.map(w => w.base_form)
  const sentences = []
  const bookFilter = book
    ? db.prepare(`SELECT sentence FROM book_sentences WHERE (user_id=? OR user_id='') AND title=? ORDER BY id`).all(userId, book)
    : db.prepare(`SELECT sentence FROM book_sentences WHERE (user_id=? OR user_id='') ORDER BY id`).all(userId)

  for (const row of bookFilter) {
    const s = row.sentence
    const matchedWord = wordList.find(w => s.includes(w))
    if (matchedWord) {
      sentences.push({ sentence: s, keyword: matchedWord })
    }
  }

  // 중복 제거 + 최대 15개
  const unique = sentences.filter((s, i, arr) => arr.findIndex(x => x.sentence === s.sentence) === i).slice(0, 15)

  res.json({ sentences: unique, words: wordList })
})

// ─── 오디오 기반 동화 학습 API ───────────────────────────────
const VOICE_PROFILE_DEFAULT = {
  visualSupport: 'audioFirst',
  hearingSupport: 'normal',
  literacySupport: 'easyText',
  inputMode: 'voice',
  outputMode: 'tts',
}

const VOICE_LLM_ROUTER_ENABLED = process.env.VOICE_LLM_ROUTER !== '0'

async function postVoiceService(pathname, payload) {
  const response = await fetch(`${VOICE_SERVICE_URL}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = data.detail || data.error || `voice service ${response.status}`
    const error = new Error(message)
    error.statusCode = response.status
    throw error
  }
  return data
}

function normalizeVoiceText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[.,!?~…]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/믿음아|미듬아|미드마|미듬|믿음/g, '')
    .trim()
}

function includesAny(text, words) {
  return words.some(word => text.includes(word))
}

function routeVoiceIntent(rawText, allowedIntents = []) {
  const text = normalizeVoiceText(rawText)
  const allowed = new Set(Array.isArray(allowedIntents) ? allowedIntents : [])
  const allow = intent => allowed.size === 0 || allowed.has(intent)

  if (!text) {
    return {
      intent: 'UNKNOWN',
      confidence: 0,
      slots: {},
      requiresConfirmation: true,
      spokenResponse: '잘 듣지 못했어요. 다시 말해 주세요.',
      nextAction: { tool: 'listenAgain', args: {} },
    }
  }

  const rules = [
    {
      intent: 'START',
      words: ['시작', '시작해', '들려줘', '읽어줘'],
      spokenResponse: '첫 문장을 들려줄게요.',
      nextAction: { tool: 'playStorySegment', args: { direction: 'current' } },
    },
    {
      intent: 'REPEAT',
      words: ['다시', '한 번 더', '한번 더', '또 들려', '반복'],
      spokenResponse: '방금 문장을 다시 들려줄게요.',
      nextAction: { tool: 'playStorySegment', args: { direction: 'current' } },
    },
    {
      intent: 'START_QUIZ',
      words: ['문제', '퀴즈', '질문 내줘', '문제 내줘'],
      spokenResponse: '문제를 하나 낼게요.',
      nextAction: { tool: 'askVoiceQuiz', args: {} },
    },
    {
      intent: 'NEXT',
      words: ['다음', '넘어가', '계속', '이어 들려'],
      spokenResponse: '다음 문장으로 넘어갈게요.',
      nextAction: { tool: 'playStorySegment', args: { direction: 'next' } },
    },
    {
      intent: 'PREVIOUS',
      words: ['이전', '앞 문장', '뒤로', '전 문장'],
      spokenResponse: '이전 문장으로 돌아갈게요.',
      nextAction: { tool: 'playStorySegment', args: { direction: 'previous' } },
    },
    {
      intent: 'HINT',
      words: ['힌트', '도움', '도와줘', '모르겠어'],
      spokenResponse: '짧은 힌트를 들려줄게요.',
      nextAction: { tool: 'explainHint', args: {} },
    },
    {
      intent: 'TODAY_RESULT',
      words: ['오늘 결과', '결과 알려', '학습 결과', '오늘 어땠어', '추천'],
      spokenResponse: '오늘 학습 결과를 정리해 줄게요.',
      nextAction: { tool: 'summarizeProgress', args: {} },
    },
    {
      intent: 'EXPLAIN_WORD',
      words: ['단어 설명', '뜻 알려', '무슨 뜻', '단어 뜻'],
      spokenResponse: '현재 문장의 중요한 단어를 설명할게요.',
      nextAction: { tool: 'explainWord', args: {} },
    },
    {
      intent: 'LEVEL_DOWN',
      words: ['천천히', '느리게', '쉬운', '더 쉬운'],
      spokenResponse: '조금 천천히 들려줄게요.',
      nextAction: { tool: 'setSpeechRate', args: { rate: 'slow' } },
    },
    {
      intent: 'LEVEL_UP',
      words: ['빠르게', '보통 속도', '빨리'],
      spokenResponse: '조금 더 빠르게 들려줄게요.',
      nextAction: { tool: 'setSpeechRate', args: { rate: 'normal' } },
    },
    {
      intent: 'CHANGE_BOOK',
      words: ['책 바꾸기', '다른 책', '책 바꿔'],
      spokenResponse: '책 선택 화면으로 돌아갈게요.',
      nextAction: { tool: 'recommendBook', args: {} },
    },
    {
      intent: 'GO_HOME',
      words: ['홈', '홈으로', '처음으로', '메인'],
      spokenResponse: '홈으로 이동할게요.',
      nextAction: { tool: 'navigate', args: { route: '/tutor?entry=home', label: '홈' } },
    },
    {
      intent: 'OPEN_TUTOR',
      words: ['오늘 학습', '오늘의 학습', '튜터', '처음부터 학습'],
      spokenResponse: '오늘의 학습으로 이동할게요.',
      nextAction: { tool: 'navigate', args: { route: '/tutor?entry=level', label: '오늘의 학습' } },
    },
    {
      intent: 'OPEN_STUDY_MENU',
      words: ['학습 메뉴', '공부 메뉴', '학습 화면', '공부 화면'],
      spokenResponse: '학습 메뉴로 이동할게요.',
      nextAction: { tool: 'navigate', args: { route: '/tutor?entry=home', label: '학습 메뉴' } },
    },
    {
      intent: 'OPEN_STORY_LEARNING',
      words: ['동화 내용', '동화내용', '동화 듣기', '동화듣기', '동화 학습', '동화학습', '내용 학습', '내용학습', '이야기 듣기'],
      spokenResponse: '동화 내용 학습으로 이동할게요.',
      nextAction: { tool: 'navigate', args: { route: '/study/voice?book=암탉과 누렁이&entry=vision&mode=story', label: '동화 내용 학습' } },
    },
    {
      intent: 'OPEN_WORD_STUDY',
      words: ['단어 공부', '단어공부', '단어 학습', '단어학습'],
      spokenResponse: '단어 공부로 이동할게요.',
      nextAction: { tool: 'navigate', args: { route: '/study/select?type=word&entry=vision&book=암탉과 누렁이', label: '단어 공부' } },
    },
    {
      intent: 'OPEN_SENTENCE_STUDY',
      words: ['문장 공부', '문장공부', '문장 학습', '문장학습', '문장 따라', '문장따라', '문장 말하기'],
      spokenResponse: '문장 공부로 이동할게요.',
      nextAction: { tool: 'navigate', args: { route: '/study/select?type=sentence&entry=vision&book=암탉과 누렁이', label: '문장 공부' } },
    },
    {
      intent: 'OPEN_VOICE_STUDY',
      words: ['말하기 연습', '말하기', '음성 학습', '음성학습', '따라 말하기', '따라말하기'],
      spokenResponse: '말하기 연습으로 이동할게요.',
      nextAction: { tool: 'navigate', args: { route: '/study/voice?book=암탉과 누렁이&entry=vision&mode=word', label: '말하기 연습' } },
    },
    {
      intent: 'OPEN_BOOK_LIST',
      words: ['책 목록', '동화 목록', '책 찾기', '동화 찾기', '책 보러', '동화 보러'],
      spokenResponse: '동화 목록으로 이동할게요.',
      nextAction: { tool: 'navigate', args: { route: '/books', label: '동화 목록' } },
    },
    {
      intent: 'OPEN_PARENT_DASHBOARD',
      words: ['부모 화면', '부모 메뉴', '학부모', '학부모 화면'],
      spokenResponse: '학부모 화면으로 이동할게요.',
      nextAction: { tool: 'navigate', args: { route: '/parent', label: '학부모 화면' } },
    },
    {
      intent: 'STOP',
      words: ['그만', '멈춰', '중지', '끝', '종료'],
      spokenResponse: '학습을 잠시 멈출게요.',
      nextAction: { tool: 'pauseSession', args: {} },
    },
  ]

  for (const rule of rules) {
    if (allow(rule.intent) && includesAny(text, rule.words)) {
      return {
        intent: rule.intent,
        confidence: 0.95,
        slots: {
          answerText: '',
          targetWord: '',
          requestedSpeed: rule.nextAction.args.rate || 'normal',
        },
        requiresConfirmation: false,
        spokenResponse: rule.spokenResponse,
        nextAction: rule.nextAction,
      }
    }
  }

  if (allow('ANSWER_QUIZ') && text.length > 0) {
    return {
      intent: 'ANSWER_QUIZ',
      confidence: 0.5,
      slots: {
        answerText: text,
        targetWord: '',
        requestedSpeed: 'normal',
      },
      requiresConfirmation: true,
      spokenResponse: '답변으로 들었어요. 확인한 뒤 알려줄게요.',
      nextAction: { tool: 'gradeQuiz', args: { answerText: text } },
    }
  }

  return {
    intent: 'UNKNOWN',
    confidence: 0.2,
    slots: { answerText: text, targetWord: '', requestedSpeed: 'normal' },
    requiresConfirmation: true,
    spokenResponse: '무엇을 할지 확실하지 않아요. 다시, 다음, 힌트처럼 말해 주세요.',
    nextAction: { tool: 'listenAgain', args: {} },
  }
}

function normalizeQuizAnswer(text) {
  const particles = ['을','를','이','가','은','는','도','의','에게','한테','에','로','으로','와','과','랑','이랑','하고']
  let value = normalizeVoiceText(text).replace(/\s/g, '')
  for (const particle of particles.sort((a, b) => b.length - a.length)) {
    if (value.endsWith(particle) && value.length > particle.length + 1) {
      value = value.slice(0, -particle.length)
      break
    }
  }
  return value
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function difficultyToLevel(difficulty) {
  if (difficulty >= 3) return 'advanced'
  if (difficulty >= 2) return 'intermediate'
  return 'beginner'
}

function getVoiceProgressSummary(userId, bookTitle = '') {
  const sessionParams = [userId]
  const sessionWhere = ['user_id = ?']
  if (bookTitle) {
    sessionWhere.push('book_title = ?')
    sessionParams.push(bookTitle)
  }

  const sessions = db.prepare(`
    SELECT id, book_title, started_at
    FROM voice_sessions
    WHERE ${sessionWhere.join(' AND ')}
    ORDER BY started_at DESC
    LIMIT 30
  `).all(...sessionParams)
  const sessionIds = sessions.map(row => row.id)
  const idPlaceholders = sessionIds.map(() => '?').join(',')

  const turns = sessionIds.length
    ? db.prepare(`
        SELECT intent, confidence
        FROM voice_turns
        WHERE user_id = ? AND session_id IN (${idPlaceholders})
      `).all(userId, ...sessionIds)
    : []

  const attempts = sessionIds.length
    ? db.prepare(`
        SELECT question_id, score, is_correct, needs_retry
        FROM voice_quiz_attempts
        WHERE user_id = ? AND session_id IN (${idPlaceholders})
      `).all(userId, ...sessionIds)
    : []

  const totalQuiz = attempts.length
  const correctQuiz = attempts.filter(row => row.is_correct).length
  const retryCount = attempts.filter(row => row.needs_retry).length
  const quizAccuracy = totalQuiz > 0 ? correctQuiz / totalQuiz : 0
  const commandTurns = turns.filter(row => row.intent !== 'ANSWER_QUIZ')
  const knownCommandTurns = commandTurns.filter(row => row.intent && row.intent !== 'UNKNOWN')
  const hintTurns = turns.filter(row => row.intent === 'HINT').length
  const commandFollowing = commandTurns.length > 0 ? knownCommandTurns.length / commandTurns.length : 0
  const helpRequestRate = turns.length > 0 ? hintTurns / turns.length : 0
  const listeningComprehension = totalQuiz > 0 ? quizAccuracy : 0
  const vocabulary = totalQuiz > 0 ? clamp01(quizAccuracy - retryCount * 0.05) : 0
  const shortTermRecall = totalQuiz > 0 ? quizAccuracy : 0

  let recommendedDifficulty = 1
  if (totalQuiz >= 2 && quizAccuracy >= 0.85 && helpRequestRate <= 0.25) recommendedDifficulty = 3
  else if (totalQuiz >= 1 && quizAccuracy >= 0.6) recommendedDifficulty = 2

  const skillVector = {
    listeningComprehension: clamp01(listeningComprehension),
    vocabulary: clamp01(vocabulary),
    shortTermRecall: clamp01(shortTermRecall),
    commandFollowing: clamp01(commandFollowing),
    helpRequestRate: clamp01(helpRequestRate),
    recommendedDifficulty,
  }

  const spokenSummary = totalQuiz === 0
    ? '아직 퀴즈 기록이 없어요. 동화를 듣고 문제를 풀면 오늘 결과를 알려줄게요.'
    : `오늘은 ${totalQuiz}문제 중 ${correctQuiz}문제를 맞혔어요. ${recommendedDifficulty === 1 ? '다음에는 같은 문장을 한 번 더 듣고 쉬운 문제부터 해볼게요.' : recommendedDifficulty === 2 ? '다음에는 비슷한 난이도의 짧은 동화를 이어서 해볼게요.' : '잘 기억했어요. 다음에는 조금 더 어려운 문제도 해볼 수 있어요.'}`

  return {
    userId,
    bookTitle,
    sessionCount: sessions.length,
    turnCount: turns.length,
    totalQuiz,
    correctQuiz,
    quizAccuracy,
    recommendedLevel: difficultyToLevel(recommendedDifficulty),
    skillVector,
    spokenSummary,
    lastSessionAt: sessions[0]?.started_at || '',
  }
}

function upsertVoiceLearningProfile(userId, bookTitle = '') {
  const summary = getVoiceProgressSummary(userId, bookTitle)
  db.prepare(`
    INSERT INTO user_learning_profiles (
      user_id, accessibility_profile, skill_vector, recommended_difficulty, source_summary, updated_at
    )
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      accessibility_profile = excluded.accessibility_profile,
      skill_vector = excluded.skill_vector,
      recommended_difficulty = excluded.recommended_difficulty,
      source_summary = excluded.source_summary,
      updated_at = datetime('now')
  `).run(
    userId,
    JSON.stringify(VOICE_PROFILE_DEFAULT),
    JSON.stringify(summary.skillVector),
    summary.skillVector.recommendedDifficulty,
    JSON.stringify({
      source: 'voice',
      bookTitle,
      totalQuiz: summary.totalQuiz,
      correctQuiz: summary.correctQuiz,
      sessionCount: summary.sessionCount,
    }),
  )
  return summary
}

function getVoiceBookRecommendations(userId, bookTitle = '', limit = 3) {
  const summary = upsertVoiceLearningProfile(userId, bookTitle)
  const level = summary.recommendedLevel
  const lim = Math.max(1, Math.min(parseInt(limit, 10) || 3, 6))

  let rows = db.prepare(`
    SELECT b.title, b.description, b.thumbnail, b.local_img, b.story_type, bd.level
    FROM books b
    LEFT JOIN book_difficulty bd ON bd.title = b.title
    WHERE COALESCE(bd.level, ?) = ?
      AND b.thumbnail LIKE '%/Nlcy_001_%'
      AND (? = '' OR b.title <> ?)
    ORDER BY RANDOM()
    LIMIT ?
  `).all(level, level, bookTitle, bookTitle, lim)

  if (rows.length < lim) {
    const excluded = rows.map(row => row.title)
    rows = rows.concat(db.prepare(`
      SELECT b.title, b.description, b.thumbnail, b.local_img, b.story_type, COALESCE(bd.level, ?) AS level
      FROM books b
      LEFT JOIN book_difficulty bd ON bd.title = b.title
      WHERE b.thumbnail LIKE '%/Nlcy_001_%'
        AND b.title NOT IN (${excluded.map(() => '?').join(',') || "''"})
        AND (? = '' OR b.title <> ?)
      ORDER BY RANDOM()
      LIMIT ?
    `).all(level, ...excluded, bookTitle, bookTitle, lim - rows.length))
  }

  if (rows.length === 0 && bookTitle) {
    rows = db.prepare(`
      SELECT b.title, b.description, b.thumbnail, b.local_img, b.story_type, COALESCE(bd.level, ?) AS level
      FROM books b
      LEFT JOIN book_difficulty bd ON bd.title = b.title
      WHERE b.title = ?
      LIMIT 1
    `).all(level, bookTitle)
  }

  const reasonByLevel = {
    beginner: '오늘 결과를 보면 짧은 문장을 다시 듣고 확인하는 흐름이 적절해요.',
    intermediate: '기본 내용을 기억하고 있어서 비슷한 길이의 문장을 이어서 연습하기 좋아요.',
    advanced: '정답률이 안정적이라 조금 더 어려운 듣기 문제로 넘어갈 수 있어요.',
  }
  const items = rows.map((row, index) => ({
    title: row.title,
    level: row.level || level,
    reason: reasonByLevel[level] || reasonByLevel.beginner,
    rank: index + 1,
    thumbnail: row.local_img ? `http://localhost:4000${row.local_img}` : (row.thumbnail || ''),
    description: row.description || '',
    storyType: row.story_type || '',
  }))

  db.prepare(`DELETE FROM learning_recommendations WHERE user_id = ? AND source = 'voice'`).run(userId)
  const insert = db.prepare(`
    INSERT INTO learning_recommendations (user_id, source, book_title, reason, rank)
    VALUES (?, 'voice', ?, ?, ?)
  `)
  for (const item of items) {
    insert.run(userId, item.title, item.reason, item.rank)
  }

  return { progress: summary, items }
}

app.post('/api/voice/session/start', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { bookTitle = '', profile = VOICE_PROFILE_DEFAULT } = req.body || {}
  try {
    const info = db.prepare(`
      INSERT INTO voice_sessions (user_id, book_title, profile)
      VALUES (?, ?, ?)
    `).run(userId, bookTitle, JSON.stringify({ ...VOICE_PROFILE_DEFAULT, ...profile }))

    res.json({
      sessionId: info.lastInsertRowid,
      accessibilityProfile: { ...VOICE_PROFILE_DEFAULT, ...profile },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/voice/dialog', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const {
    text = '',
    sessionId = null,
    state = '',
    allowedIntents = [],
    childProfile = {},
    context = {},
  } = req.body || {}

  void (async () => {
    const ruleResult = routeVoiceIntent(text, allowedIntents)
    let result = ruleResult
    const shouldAskLlm = VOICE_LLM_ROUTER_ENABLED &&
      text &&
      (ruleResult.intent === 'UNKNOWN' || ruleResult.intent === 'ANSWER_QUIZ' || ruleResult.confidence < 0.75)

    if (shouldAskLlm) {
      try {
        const llmResult = await routeVoiceDialogWithMidm(childProfile, {
          text,
          state,
          allowedIntents,
          context,
        })
        if (!Array.isArray(allowedIntents) || allowedIntents.length === 0 || allowedIntents.includes(llmResult.intent)) {
          result = llmResult
        }
      } catch {
        result = { ...ruleResult, source: 'rules_fallback' }
      }
    } else {
      result = { ...ruleResult, source: 'rules' }
    }

    if (sessionId) {
      db.prepare(`
        INSERT INTO voice_turns (session_id, user_id, stt_text, intent, confidence, state)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sessionId, userId, text, result.intent, result.confidence, state)
    }
    res.json(result)
  })().catch(e => {
    res.status(500).json({ error: e.message })
  })
})

app.post('/api/voice/quiz/evaluate', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { questionId = '', sttText = '', expectedAnswers = [], sessionId = null } = req.body || {}
  const expected = Array.isArray(expectedAnswers) ? expectedAnswers.map(normalizeQuizAnswer).filter(Boolean) : []
  const answer = normalizeQuizAnswer(sttText)

  if (!answer || expected.length === 0) {
    return res.json({
      questionId,
      sttText,
      expectedAnswers,
      matchType: 'insufficient_data',
      score: 0,
      isCorrect: false,
      needsRetry: true,
      feedbackHint: '답변이나 정답 후보가 부족함',
    })
  }

  const exact = expected.includes(answer)
  const partial = expected.some(item => item.includes(answer) || answer.includes(item))
  const score = exact ? 1 : partial ? 0.75 : 0
  const result = {
    questionId,
    sttText,
    expectedAnswers,
    matchType: exact ? 'exact_match' : partial ? 'partial_match' : 'no_match',
    score,
    isCorrect: score >= 0.75,
    needsRetry: score < 0.75,
    feedbackHint: score >= 0.75 ? '핵심 답변을 기억함' : '정답 후보와 직접 매칭되지 않음',
  }

  try {
    if (sessionId) {
      const info = db.prepare(`
        INSERT INTO voice_quiz_attempts (
          session_id, user_id, question_id, stt_text, expected_answers,
          match_type, score, is_correct, needs_retry, feedback_hint
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId,
        userId,
        questionId,
        sttText,
        JSON.stringify(expectedAnswers),
        result.matchType,
        result.score,
        result.isCorrect ? 1 : 0,
        result.needsRetry ? 1 : 0,
        result.feedbackHint,
      )
      result.attemptId = info.lastInsertRowid
      const session = db.prepare(`SELECT book_title FROM voice_sessions WHERE id = ?`).get(sessionId)
      result.progress = upsertVoiceLearningProfile(userId, session?.book_title || '')
    }
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/voice/progress', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { bookTitle = '' } = req.query
  try {
    res.json(upsertVoiceLearningProfile(userId, String(bookTitle || '')))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/voice/progress', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { bookTitle = '' } = req.body || {}
  try {
    res.json(upsertVoiceLearningProfile(userId, bookTitle))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/voice/recommend/books', (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const { bookTitle = '', limit = '3' } = req.query
  try {
    res.json(getVoiceBookRecommendations(userId, String(bookTitle || ''), limit))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

function parseJsonSafe(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function formatPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`
}

app.get('/api/parent/summary', async (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  const childProfile = {
    name: req.query.childName || '아이',
    birth_date: req.query.birthDate || '',
    disability: req.query.disability || 'vision',
  }

  try {
    const readingRows = db.prepare(`
      SELECT title, MAX(read_at) AS lastReadAt, COUNT(*) AS readCount
      FROM reading_history
      WHERE user_id = ?
      GROUP BY title
      ORDER BY lastReadAt DESC
      LIMIT 8
    `).all(userId)

    const readingTrend = db.prepare(`
      SELECT read_at AS date, COUNT(DISTINCT title) AS count
      FROM reading_history
      WHERE user_id = ? AND read_at >= date('now', '-6 days')
      GROUP BY read_at
      ORDER BY read_at ASC
    `).all(userId)

    const wordStats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN known = 1 THEN 1 ELSE 0 END) AS known,
        SUM(CASE WHEN known = 0 THEN 1 ELSE 0 END) AS unknown
      FROM word_study
      WHERE user_id = ?
    `).get(userId)

    const voiceProfileRow = db.prepare(`
      SELECT accessibility_profile, skill_vector, recommended_difficulty, source_summary, updated_at
      FROM user_learning_profiles
      WHERE user_id = ?
    `).get(userId)

    const voiceStats = db.prepare(`
      SELECT
        COUNT(*) AS totalQuiz,
        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correctQuiz,
        AVG(score) AS averageScore,
        SUM(CASE WHEN needs_retry = 1 THEN 1 ELSE 0 END) AS retryCount
      FROM voice_quiz_attempts
      WHERE user_id = ?
    `).get(userId)

    const recentVoiceSessions = db.prepare(`
      SELECT id, book_title AS bookTitle, started_at AS startedAt, ended_at AS endedAt
      FROM voice_sessions
      WHERE user_id = ?
      ORDER BY started_at DESC
      LIMIT 5
    `).all(userId)

    const latestRecommendations = db.prepare(`
      SELECT book_title AS title, reason, rank, created_at AS createdAt
      FROM learning_recommendations
      WHERE user_id = ? AND source = 'voice'
      ORDER BY rank ASC, created_at DESC
      LIMIT 5
    `).all(userId)

    const booksRead = readingRows.map(row => row.title)
    const totalQuiz = Number(voiceStats.totalQuiz || 0)
    const correctQuiz = Number(voiceStats.correctQuiz || 0)
    const quizAccuracy = totalQuiz > 0 ? correctQuiz / totalQuiz : 0
    const skillVector = parseJsonSafe(voiceProfileRow?.skill_vector, {
      listeningComprehension: totalQuiz > 0 ? quizAccuracy : 0,
      vocabulary: 0,
      shortTermRecall: totalQuiz > 0 ? quizAccuracy : 0,
      commandFollowing: 0,
      helpRequestRate: 0,
      recommendedDifficulty: 1,
    })
    const voiceProgress = {
      totalQuiz,
      correctQuiz,
      quizAccuracy,
      averageScore: Number(voiceStats.averageScore || 0),
      retryCount: Number(voiceStats.retryCount || 0),
      recommendedLevel: difficultyToLevel(Number(voiceProfileRow?.recommended_difficulty || skillVector.recommendedDifficulty || 1)),
      skillVector,
      updatedAt: voiceProfileRow?.updated_at || '',
    }
    const knownWords = Number(wordStats.known || 0)
    const totalWords = Number(wordStats.total || 0)
    const unknownWords = Number(wordStats.unknown || 0)
    const studyDays = readingTrend.length

    const deterministicSummary = {
      message_to_parent: totalQuiz > 0
        ? `음성 학습에서 ${totalQuiz}문제 중 ${correctQuiz}문제를 맞혔고, 듣기 이해도는 ${formatPercent(quizAccuracy)}로 집계됐습니다.`
        : '아직 음성 퀴즈 기록이 충분하지 않습니다. 오디오 동화 학습에서 문제를 풀면 분석이 누적됩니다.',
      observations: [
        totalQuiz > 0 ? `듣기 이해: ${formatPercent(skillVector.listeningComprehension || quizAccuracy)}` : '듣기 이해: 기록 대기',
        totalWords > 0 ? `단어 학습: ${knownWords}개 이해, ${unknownWords}개 복습 필요` : '단어 학습: 기록 대기',
        booksRead.length > 0 ? `최근 읽은 동화: ${booksRead.slice(0, 3).join(', ')}` : '최근 읽은 동화 기록이 없습니다.',
      ],
      next_actions: [
        latestRecommendations[0] ? `다음 추천 동화: ${latestRecommendations[0].title}` : '암탉과 누렁이 음성 퀴즈를 먼저 진행해 주세요.',
        voiceProgress.retryCount > 0 ? '다시 시도한 문제를 짧게 복습해 주세요.' : '현재 난이도의 듣기 문제를 한 세트 더 진행해도 좋습니다.',
        '원본 음성·영상은 저장하지 않고 학습 결과 중심으로 확인합니다.',
      ],
    }

    let aiSummary = null
    if (process.env.PARENT_AI_SUMMARY !== '0') {
      try {
        aiSummary = await generateWeeklyReport(childProfile, {
          booksRead,
          newWords: totalWords,
          accuracy: Math.round(quizAccuracy * 100),
          studyDays,
        })
      } catch {}
    }

    res.json({
      childProfile,
      reading: {
        totalBooks: readingRows.length,
        recentBooks: readingRows,
        trend: readingTrend,
      },
      words: {
        total: totalWords,
        known: knownWords,
        unknown: unknownWords,
      },
      voice: {
        ...voiceProgress,
        recentSessions: recentVoiceSessions,
      },
      recommendations: latestRecommendations,
      summary: aiSummary || deterministicSummary,
      summarySource: aiSummary ? 'midm' : 'rules',
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/voice/service/health', async (req, res) => {
  try {
    const response = await fetch(`${VOICE_SERVICE_URL}/health`)
    const data = await response.json()
    res.status(response.ok ? 200 : response.status).json(data)
  } catch (e) {
    res.status(503).json({
      ok: false,
      error: e.message,
      voiceServiceUrl: VOICE_SERVICE_URL,
    })
  }
})

app.post('/api/voice/stt', async (req, res) => {
  try {
    const data = await postVoiceService('/stt/transcribe', req.body)
    res.json(data)
  } catch (e) {
    res.status(e.statusCode || 503).json({
      error: e.message,
      voiceServiceUrl: VOICE_SERVICE_URL,
    })
  }
})

app.post('/api/voice/tts', async (req, res) => {
  try {
    const data = await postVoiceService('/tts/synthesize', req.body)
    res.json(data)
  } catch (e) {
    res.status(e.statusCode || 503).json({
      error: e.message,
      voiceServiceUrl: VOICE_SERVICE_URL,
    })
  }
})

// ─── KT 믿음 (Mi:dm) AI 엔드포인트 ──────────────────────────
// POST /api/midm/feedback — 학습 수준 진단 + 맞춤 추천
app.post('/api/midm/feedback', async (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  try {
    // child_profile은 프론트에서 전달 (Supabase children 테이블 기반)
    const { accuracy = 0, childProfile = {} } = req.body

    // DB에서 학습 데이터 수집
    const unknownWords = db.prepare(`SELECT base_form FROM word_study WHERE user_id=? AND known=0`).all(userId).map(r => r.base_form)
    const booksRead = db.prepare(`SELECT DISTINCT title FROM reading_history WHERE user_id=?`).all(userId).map(r => r.title)
    const totalWordsLearned = db.prepare(`SELECT COUNT(*) as cnt FROM word_study WHERE user_id=? AND known=1`).get(userId).cnt

    const result = await getLearningFeedback(childProfile, { unknownWords, accuracy, booksRead, totalWordsLearned })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/midm/quiz — 동화 요약 + 퀴즈 생성
app.post('/api/midm/quiz', async (req, res) => {
  const { subtitleText, bookTitle, childProfile = {} } = req.body
  if (!subtitleText || !bookTitle) return res.status(400).json({ error: 'subtitleText and bookTitle required' })
  try {
    const result = await generateQuiz(childProfile, bookTitle, subtitleText)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/midm/explain — 단어 설명 (아이 눈높이)
app.post('/api/midm/explain', async (req, res) => {
  const { word, definition, childProfile = {} } = req.body
  if (!word) return res.status(400).json({ error: 'word required' })
  try {
    const result = await explainWord(childProfile, word, definition || '')
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/midm/report — 학부모 주간 리포트
app.post('/api/midm/report', async (req, res) => {
  const userId = req.headers['x-user-id'] || ''
  try {
    const { accuracy = 0, childProfile = {} } = req.body

    // 최근 7일 데이터 수집
    const booksRead = db.prepare(`
      SELECT DISTINCT title FROM reading_history
      WHERE user_id=? AND read_at >= date('now', '-7 days')
    `).all(userId).map(r => r.title)

    const newWords = db.prepare(`
      SELECT COUNT(*) as cnt FROM word_study
      WHERE user_id=? AND created_at >= datetime('now', '-7 days')
    `).get(userId).cnt

    const studyDays = db.prepare(`
      SELECT COUNT(DISTINCT date(read_at)) as cnt FROM reading_history
      WHERE user_id=? AND read_at >= date('now', '-7 days')
    `).get(userId).cnt

    const result = await generateWeeklyReport(childProfile, { booksRead, newWords, accuracy, studyDays })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/midm/tutorial — 튜토리얼 단계별 호출 (범용)
app.post('/api/midm/tutorial', async (req, res) => {
  const { step, context = {}, childProfile = {} } = req.body
  if (!step) return res.status(400).json({ error: 'step required' })
  try {
    const result = await tutorialStep(childProfile, step, context)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── 수동 동기화 ──────────────────────────────────────────────
app.post('/admin/sync', async (req, res) => {
  try {
    const count = await syncBooks()
    await downloadAllImages()
    res.json({ ok: true, count })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ─── 프론트엔드 정적 파일 서빙 (배포용) ──────────────────────
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist')
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/proxy') || req.path.startsWith('/images') || req.path.startsWith('/sign-motion') || req.path.startsWith('/videos')) return next()
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'))
  })
}

// ─── 서버 시작 ────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`📚 book-backend 실행 중: http://localhost:${PORT}`)

  startPython()

  const cnt = db.prepare(`SELECT COUNT(*) as c FROM books`).get().c
  if (cnt === 0) {
    console.log('[init] DB 비어있음 → 최초 동기화 시작...')
    try { await syncBooks(); await downloadAllImages() }
    catch (e) { console.error('[init] 동기화 실패:', e.message) }
  } else {
    console.log(`[init] DB에 ${cnt}개 책 로드됨`)
    downloadAllImages().catch(() => {})
  }

  // 암탉과 누렁이 영상 미리 다운로드
  const featured = db.prepare(`SELECT thumbnail FROM books WHERE title = '암탉과 누렁이'`).get()
  if (featured?.thumbnail) {
    console.log('[videos] 암탉과 누렁이 영상 캐시 확인 중...')
    downloadBookVideos(featured.thumbnail)
      .then(r => console.log(`[videos] 완료 — 성공 ${r.ok.length}개, 실패 ${r.failed.length}개`))
      .catch(e => console.warn('[videos] 다운로드 오류:', e.message))
  }

  cron.schedule('0 3 * * *', async () => {
    console.log('[cron] 자동 동기화 시작...')
    await syncBooks().catch(console.error)
    await downloadAllImages().catch(console.error)
  })
})
