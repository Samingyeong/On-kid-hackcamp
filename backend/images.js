/**
 * images.js — 책 썸네일 이미지를 로컬에 미리 다운로드
 */
const https = require('https')
const fs    = require('fs')
const path  = require('path')
const { db, IMG_DIR } = require('./db')

const NLCY_HEADERS = {
  'Referer':    'https://www.nlcy.go.kr/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Origin':     'https://www.nlcy.go.kr',
}

function downloadImage(imgUrl, destPath, force = false) {
  return new Promise((resolve, reject) => {
    if (!force && fs.existsSync(destPath)) return resolve(false)
    const file = fs.createWriteStream(destPath)
    const req = https.get(imgUrl, { headers: NLCY_HEADERS }, res => {
      if (res.statusCode !== 200) {
        file.close()
        fs.unlink(destPath, () => {})
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve(true) })
    })
    req.on('error', e => { file.close(); fs.unlink(destPath, () => {}); reject(e) })
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

async function downloadAllImages() {
  const all = db.prepare(`SELECT title, thumbnail, local_img FROM books WHERE thumbnail != ''`).all()
  const targets = all.filter(book => {
    if (!book.local_img) return true
    const filePath = path.join(IMG_DIR, path.basename(book.local_img))
    return !fs.existsSync(filePath)
  })

  console.log(`[images] 다운로드 대상: ${targets.length}개`)
  if (targets.length === 0) return

  let done = 0, failed = 0
  for (let i = 0; i < targets.length; i += 5) {
    const batch = targets.slice(i, i + 5)
    await Promise.allSettled(batch.map(async book => {
      try {
        // 연도 포함 파일명으로 저장 (e.g. 2025_Nlcy_001_001.png)
        const yearMatch = book.thumbnail.match(/\/(\d{4})\//)
        const year = yearMatch ? yearMatch[1] : '0000'
        const origName = path.basename(book.thumbnail.split('?')[0])
        const filename = `${year}_${origName}`
        const destPath = path.join(IMG_DIR, filename)
        await downloadImage(book.thumbnail, destPath)
        db.prepare(`UPDATE books SET local_img = ? WHERE title = ?`).run(`/images/${filename}`, book.title)
        done++
      } catch {
        failed++
      }
    }))
  }
  console.log(`[images] 완료 — ${done}개 처리, ${failed}개 실패`)
}

module.exports = { downloadAllImages, IMG_DIR }

if (require.main === module) {
  downloadAllImages().then(() => process.exit(0)).catch(() => process.exit(1))
}
