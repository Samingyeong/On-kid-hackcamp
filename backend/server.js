require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const https   = require('https')
const path    = require('path')
const cron    = require('node-cron')
const { spawn } = require('child_process')
const { db, IMG_DIR }        = require('./db')
const { syncBooks }          = require('./sync')
const { downloadAllImages }  = require('./images')
const { downloadBookVideos, getLocalVideoPath, VIDEO_DIR } = require('./videos')
const { extractKeywords, getBaseForm } = require('./groq_nlp')
const { getLearningFeedback, generateQuiz, explainWord, generateWeeklyReport, tutorialStep } = require('./midm')

const app  = express()
const PORT = 4000

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
app.use(express.json())

// ─── 정적 이미지 서빙 ─────────────────────────────────────────
app.use('/images', express.static(IMG_DIR, { maxAge: '7d', etag: true }))

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
let nlpProcess = null
let nlpReady = false
const nlpQueue = [] // { resolve, reject }

function startPython() {
  nlpProcess = spawn('python', [NLP_SCRIPT], {
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
      const py = spawn('python', [path.join(__dirname, 'korean_nlp.py'), mode, text], {
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
// 아이 수준에 맞는 책 추천
app.get('/api/books/recommend', (req, res) => {
  const { level = 'beginner', limit = '4' } = req.query
  const lim = parseInt(limit)

  // 해당 레벨 책 우선, 부족하면 한 단계 아래도 포함
  let rows = db.prepare(`
    SELECT bd.*, b.thumbnail, b.local_img, b.description, b.story_type, b.url
    FROM book_difficulty bd
    JOIN books b ON b.title = bd.title
    WHERE bd.level = ?
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
      WHERE bd.level = ? AND bd.title NOT IN (${rows.map(() => '?').join(',')})
      ORDER BY RANDOM()
      LIMIT ?
    `).all(fallbackLevel, ...rows.map(r => r.title), lim - rows.length)
    rows = [...rows, ...more]
  }

  // 아직도 부족하면 분석 안 된 책에서 랜덤
  if (rows.length < lim) {
    const more = db.prepare(`
      SELECT b.title, b.thumbnail, b.local_img, b.description, b.story_type, b.url,
             'beginner' as level, 0 as total_words
      FROM books b
      WHERE b.title NOT IN (SELECT title FROM book_difficulty)
      ORDER BY RANDOM()
      LIMIT ?
    `).all(lim - rows.length)
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
