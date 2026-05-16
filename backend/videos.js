/**
 * videos.js — 특정 책의 영상/VTT를 로컬에 미리 다운로드
 */
const https = require('https')
const fs    = require('fs')
const path  = require('path')

const DATA_DIR  = path.join(__dirname, 'data')
const VIDEO_DIR = path.join(DATA_DIR, 'videos')
if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true })

const NLCY_HEADERS = {
  'Referer':    'https://www.nlcy.go.kr/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Origin':     'https://www.nlcy.go.kr',
}

const LANGS = ['ko', 'en', 'vi', 'ch', 'th', 'mo']

// PNG URL → MP4/VTT URL 변환
function toVideoUrl(thumbUrl, lang, ext) {
  return thumbUrl.replace('.png', `_${lang}.${ext}`)
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destPath)) return resolve(false) // 이미 있으면 스킵
    const tmp = destPath + '.tmp'
    const file = fs.createWriteStream(tmp)
    const req = https.get(url, { headers: NLCY_HEADERS }, res => {
      if (res.statusCode !== 200) {
        file.close()
        fs.unlink(tmp, () => {})
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        fs.rename(tmp, destPath, err => err ? reject(err) : resolve(true))
      })
    })
    req.on('error', e => { file.close(); fs.unlink(tmp, () => {}); reject(e) })
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

// 특정 책의 모든 언어 영상+VTT 다운로드
async function downloadBookVideos(thumbUrl) {
  const uniqueBase = getUniqueBase(thumbUrl)
  const results = { ok: [], failed: [] }

  for (const lang of LANGS) {
    for (const ext of ['mp4', 'vtt']) {
      const url      = toVideoUrl(thumbUrl, lang, ext)
      const filename = `${uniqueBase}_${lang}.${ext}`
      const destPath = path.join(VIDEO_DIR, filename)
      try {
        const downloaded = await downloadFile(url, destPath)
        results.ok.push({ lang, ext, downloaded })
        console.log(`[videos] ${downloaded ? '다운로드' : '스킵(기존)'}: ${filename}`)
      } catch (e) {
        results.failed.push({ lang, ext, error: e.message })
        console.warn(`[videos] 실패: ${filename} — ${e.message}`)
      }
    }
  }
  return results
}

// thumbUrl에서 고유 식별자 추출 (연도+파일명으로 충돌 방지)
// e.g. https://www.nlcy.go.kr/multiLanguageStory/2017/Nlcy_001_001/Nlcy_001_001.png → "2017_Nlcy_001_001"
function getUniqueBase(thumbUrl) {
  const match = thumbUrl.match(/\/(\d{4})\/([^/]+)\/([^/]+)\.png$/)
  if (match) return `${match[1]}_${match[3]}`
  return path.basename(thumbUrl, '.png')
}

// 로컬 파일 경로 반환 (없으면 null)
function getLocalVideoPath(thumbUrl, lang, ext) {
  const uniqueBase = getUniqueBase(thumbUrl)
  const filename = `${uniqueBase}_${lang}.${ext}`
  const filePath = path.join(VIDEO_DIR, filename)
  return fs.existsSync(filePath) ? filePath : null
}

module.exports = { downloadBookVideos, getLocalVideoPath, VIDEO_DIR }
