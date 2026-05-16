/**
 * 일괄 책 난이도 분석 스크립트
 * 
 * 각 책의 한국어 VTT 자막을 가져와서 단어를 추출하고
 * 난이도(초급/중급/고급)를 판정하여 book_difficulty 테이블에 저장
 * 
 * 실행: node analyze_difficulty.js
 */
require('dotenv').config()
const https = require('https')
const path  = require('path')
const fs    = require('fs')
const { db } = require('./db')

const NLCY_HEADERS = {
  'Referer':    'https://www.nlcy.go.kr/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Origin':     'https://www.nlcy.go.kr',
}

const VIDEO_DIR = path.join(__dirname, 'data', 'videos')

// ─── VTT 파싱 ────────────────────────────────────────────────
function parseVtt(text) {
  const lines = text.split('\n')
  const sentences = []
  let current = ''

  for (const line of lines) {
    const trimmed = line.trim()
    // 타임코드 라인이나 빈 줄, WEBVTT 헤더 스킵
    if (!trimmed || trimmed === 'WEBVTT' || trimmed.includes('-->') || /^\d+$/.test(trimmed)) {
      if (current.trim()) {
        sentences.push(current.trim())
        current = ''
      }
      continue
    }
    current += (current ? ' ' : '') + trimmed
  }
  if (current.trim()) sentences.push(current.trim())
  return sentences
}

// ─── 단어 추출 (간단한 한글 토큰화) ──────────────────────────
function extractKoreanWords(sentences) {
  const allText = sentences.join(' ')
  // 한글 단어만 추출 (2글자 이상)
  const matches = allText.match(/[가-힣]{2,}/g) || []
  // 중복 제거
  return [...new Set(matches)]
}

// ─── 단어 난이도 판정 ─────────────────────────────────────────
function classifyWordLevel(word) {
  if (word.length <= 2) return 'beginner'
  if (word.length <= 3) return 'intermediate'
  return 'advanced'
}

function analyzeWords(words) {
  let beginner = 0, intermediate = 0, advanced = 0
  for (const w of words) {
    const level = classifyWordLevel(w)
    if (level === 'beginner') beginner++
    else if (level === 'intermediate') intermediate++
    else advanced++
  }
  const total = words.length || 1
  const beginnerRatio = beginner / total
  const intermediateRatio = intermediate / total
  const advancedRatio = advanced / total

  let level = 'beginner'
  if (advancedRatio > 0.3) level = 'advanced'
  else if (intermediateRatio + advancedRatio > 0.4) level = 'intermediate'

  return { total, beginner, intermediate, advanced, beginnerRatio, intermediateRatio, advancedRatio, level }
}

// ─── VTT 가져오기 (로컬 우선, 없으면 원격) ───────────────────
function fetchVtt(thumbUrl) {
  return new Promise((resolve, reject) => {
    if (!thumbUrl) return reject(new Error('no thumbnail'))

    // 로컬 파일 확인
    const base = path.basename(thumbUrl, '.png')
    const localPath = path.join(VIDEO_DIR, `${base}_ko.vtt`)
    if (fs.existsSync(localPath)) {
      const text = fs.readFileSync(localPath, 'utf8')
      return resolve(text)
    }

    // 원격에서 가져오기
    const vttUrl = thumbUrl.replace('.png', '_ko.vtt')
    const chunks = []
    const req = https.get(vttUrl, { headers: NLCY_HEADERS }, res => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

// ─── DB 저장 ──────────────────────────────────────────────────
const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO book_difficulty
  (title, total_words, beginner_count, intermediate_count, advanced_count,
   beginner_ratio, intermediate_ratio, advanced_ratio, level)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

// ─── 메인 실행 ───────────────────────────────────────────────
async function main() {
  console.log('📚 책 난이도 일괄 분석 시작...\n')

  // 아직 분석 안 된 책 목록
  const books = db.prepare(`
    SELECT title, thumbnail FROM books
    WHERE thumbnail IS NOT NULL
      AND title NOT IN (SELECT title FROM book_difficulty)
    ORDER BY reg_date DESC
  `).all()

  console.log(`분석 대상: ${books.length}권\n`)

  let success = 0, failed = 0, skipped = 0

  for (let i = 0; i < books.length; i++) {
    const book = books[i]
    const progress = `[${i + 1}/${books.length}]`

    try {
      const vttText = await fetchVtt(book.thumbnail)
      const sentences = parseVtt(vttText)

      if (sentences.length === 0) {
        console.log(`${progress} ⏭️  ${book.title} — 자막 없음`)
        skipped++
        continue
      }

      const words = extractKoreanWords(sentences)
      if (words.length < 3) {
        console.log(`${progress} ⏭️  ${book.title} — 단어 부족 (${words.length}개)`)
        skipped++
        continue
      }

      const result = analyzeWords(words)

      insertStmt.run(
        book.title,
        result.total,
        result.beginner,
        result.intermediate,
        result.advanced,
        result.beginnerRatio,
        result.intermediateRatio,
        result.advancedRatio,
        result.level
      )

      console.log(`${progress} ✅ ${book.title} — ${result.level} (단어 ${result.total}개: 초급${result.beginner}/중급${result.intermediate}/고급${result.advanced})`)
      success++

      // 원격 요청 간 딜레이 (서버 부하 방지)
      await new Promise(r => setTimeout(r, 300))

    } catch (e) {
      console.log(`${progress} ❌ ${book.title} — ${e.message}`)
      failed++
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`📊 분석 완료!`)
  console.log(`   ✅ 성공: ${success}권`)
  console.log(`   ⏭️  스킵: ${skipped}권`)
  console.log(`   ❌ 실패: ${failed}권`)

  // 전체 통계
  const stats = db.prepare(`SELECT level, COUNT(*) as cnt FROM book_difficulty GROUP BY level`).all()
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM book_difficulty`).get()
  console.log(`\n📈 전체 난이도 분포 (${total.cnt}권):`)
  for (const s of stats) {
    console.log(`   ${s.level}: ${s.cnt}권`)
  }
  console.log('')
}

main().catch(e => {
  console.error('스크립트 오류:', e)
  process.exit(1)
})
