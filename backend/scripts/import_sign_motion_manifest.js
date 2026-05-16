const fs = require('fs')
const path = require('path')

const { db, SIGN_MOTION_DIR } = require('../db')
const {
  upsertSignLexiconEntry,
  upsertSignSource,
  insertSignMotionSegment,
} = require('../sign_motion')

const DEFAULT_MANIFEST = path.join(
  SIGN_MOTION_DIR,
  'manifests',
  'hen_nureongi_exact_matches.json'
)

function resolvePath(inputPath) {
  if (!inputPath) return DEFAULT_MANIFEST
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath)
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function unique(values) {
  return Array.from(new Set(values.map(value => String(value).trim()).filter(Boolean)))
}

function readManifest(manifestPath) {
  const payload = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const items = Array.isArray(payload) ? payload : payload.items
  if (!Array.isArray(items)) {
    throw new Error(`manifest items not found: ${manifestPath}`)
  }
  return { payload, items }
}

function requireLocalKeypoints(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\.?\/*/, '')
  if (!normalized) throw new Error('local_keypoints_path is required')

  const fullPath = path.resolve(SIGN_MOTION_DIR, normalized)
  if (!fullPath.startsWith(`${SIGN_MOTION_DIR}${path.sep}`)) {
    throw new Error(`invalid keypoints path: ${relativePath}`)
  }
  if (!fs.existsSync(fullPath)) {
    throw new Error(`keypoints file not found: ${path.relative(process.cwd(), fullPath)}`)
  }
  return normalized
}

function toLexiconInput(item) {
  return {
    api_source: item.api_source || 'integrated',
    local_id: item.local_id,
    title: item.title,
    alternative_title: item.alternative_title || asArray(item.title_variants).join(','),
    description: item.description || '',
    video_url: item.video_url || '',
    thumbnail_url: item.thumbnail_url || '',
    detail_url: item.detail_url || '',
    sign_description: item.sign_description || '',
    sign_images: item.sign_images || [],
    collection_db: item.collection_db || '',
    category_type: item.category_type || '',
    retarget_status: 'retargeted',
  }
}

function termsForItem(item) {
  return unique(asArray(item.matched_terms))
}

function toSegmentInput(sourceId, lexiconId, item, lemma, keypointsPath) {
  const startSec = Number(item.segment_start_sec ?? 0)
  const endSec = Number(item.segment_end_sec ?? item.duration_sec ?? 1)
  return {
    source_id: sourceId,
    lemma,
    surface: asArray(item.title_variants).join(',') || item.title || lemma,
    pos: '',
    start_sec: Number.isFinite(startSec) ? startSec : 0,
    end_sec: Number.isFinite(endSec) && endSec > startSec ? endSec : startSec + 1,
    clip_path: item.video_url || '',
    keypoints_path: keypointsPath,
    avatar_path: '',
    lexicon_id: lexiconId,
    sign_description: item.sign_description || '',
    sign_images: item.sign_images || [],
    confidence: 1,
    review_status: 'retargeted',
    notes: `hen_nureongi exact title-token match; local_id=${item.local_id}`,
  }
}

function importManifest(manifestPath) {
  const { payload, items } = readManifest(manifestPath)
  const source = upsertSignSource({
    title: '문화공공데이터광장 통합 수어정보',
    source_type: 'culture_openapi_integrated',
    notes: 'Culture OpenAPI sign lexicon source; hen_nureongi exact-match keypoints imported',
  })

  let lexiconCount = 0
  let segmentCount = 0

  const importMany = db.transaction(() => {
    for (const item of items) {
      if (!item.local_id || !item.title) continue
      const keypointsPath = requireLocalKeypoints(item.local_keypoints_path)
      const terms = termsForItem(item)
      if (!terms.length) continue

      const lexicon = upsertSignLexiconEntry(toLexiconInput(item))
      lexiconCount += 1

      for (const lemma of terms) {
        insertSignMotionSegment(toSegmentInput(source.id, lexicon.id, item, lemma, keypointsPath))
        segmentCount += 1
      }
    }
  })

  importMany()
  db.pragma('wal_checkpoint(TRUNCATE)')

  return {
    manifest: path.relative(process.cwd(), manifestPath),
    title: payload.title || '암탉과 누렁이',
    items: items.length,
    lexicon: lexiconCount,
    segments: segmentCount,
  }
}

try {
  const manifestPath = resolvePath(process.argv[2])
  const result = importManifest(manifestPath)
  console.log(`[sign-motion-import] OK ${JSON.stringify(result)}`)
  db.close()
} catch (error) {
  console.error(`[sign-motion-import] FAIL: ${error.message}`)
  try { db.close() } catch {}
  process.exit(1)
}
