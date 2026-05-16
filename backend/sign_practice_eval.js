const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { db, SIGN_MOTION_DIR } = require('./db')

const POSE_POINTS = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
}
const HAND_LANDMARKS = [0, 4, 8, 12, 16, 20]
const referenceCache = new Map()

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function resolveKeypointPath(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//.test(raw)) return ''
  const normalized = raw
    .replace(/\\/g, '/')
    .replace(/^\/sign-motion-keypoints\//, '')
    .replace(/^\/sign-motion\//, '')
    .replace(/^backend\/data\/sign_motion\//, '')
    .replace(/^book-backend\/data\/sign_motion\//, '')
    .replace(/^data\/sign_motion\//, '')
    .replace(/^sign_motion\//, '')
    .replace(/^\.?\/*/, '')
  const fullPath = path.isAbsolute(normalized)
    ? normalized
    : path.resolve(SIGN_MOTION_DIR, normalized)
  if (!fullPath.startsWith(`${SIGN_MOTION_DIR}${path.sep}`)) return ''
  return fullPath
}

function parseJsonlMaybeGzip(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return []
  const bytes = fs.readFileSync(filePath)
  const text = filePath.endsWith('.gz')
    ? zlib.gunzipSync(bytes).toString('utf8')
    : bytes.toString('utf8')
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line))
}

function normalizeLandmark(point, frame) {
  if (!point) return null
  const width = Number(frame.width || frame.detect_width || 1)
  const height = Number(frame.height || frame.detect_height || 1)
  const rawX = Number(point.x)
  const rawY = Number(point.y)
  const x = Math.abs(rawX) > 2 && width > 2 ? rawX / width : rawX
  const y = Math.abs(rawY) > 2 && height > 2 ? rawY / height : rawY
  return { x, y, z: Number(point.z || 0) }
}

function pickPose(frame, name) {
  return normalizeLandmark(frame.pose?.[POSE_POINTS[name]], frame)
}

function distance2(a, b) {
  if (!a || !b) return 0
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function frameBasis(frame) {
  const leftShoulder = pickPose(frame, 'leftShoulder')
  const rightShoulder = pickPose(frame, 'rightShoulder')
  const center = leftShoulder && rightShoulder
    ? { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2, z: 0 }
    : { x: 0.5, y: 0.5, z: 0 }
  const shoulderScale = distance2(leftShoulder, rightShoulder)
  return { center, scale: Math.max(shoulderScale, 0.18) }
}

function handBySide(frame, side) {
  const hands = Array.isArray(frame.hands) ? frame.hands : []
  const exact = hands.find(hand => String(hand.handedness || '').toLowerCase() === side)
  if (exact) return exact
  return side === 'left' ? hands[0] : hands[1]
}

function relativePoint(point, basis) {
  if (!point) return [0, 0, 0, 0]
  return [
    (point.x - basis.center.x) / basis.scale,
    (point.y - basis.center.y) / basis.scale,
    point.z / basis.scale,
    1,
  ]
}

function handShapeFeatures(hand, frame) {
  const landmarks = hand?.landmarks || []
  const wrist = normalizeLandmark(landmarks[0], frame)
  const middleMcp = normalizeLandmark(landmarks[9], frame)
  const scale = Math.max(distance2(wrist, middleMcp), 0.04)
  const out = []
  for (const index of HAND_LANDMARKS) {
    const point = normalizeLandmark(landmarks[index], frame)
    out.push(point ? (point.x - (wrist?.x || 0)) / scale : 0)
    out.push(point ? (point.y - (wrist?.y || 0)) / scale : 0)
  }
  return out
}

function baseFrameFeatures(frame) {
  const basis = frameBasis(frame)
  const leftHand = handBySide(frame, 'left')
  const rightHand = handBySide(frame, 'right')
  return {
    position: [
      ...relativePoint(pickPose(frame, 'leftElbow'), basis),
      ...relativePoint(pickPose(frame, 'leftWrist'), basis),
      ...relativePoint(pickPose(frame, 'rightElbow'), basis),
      ...relativePoint(pickPose(frame, 'rightWrist'), basis),
      ...relativePoint(normalizeLandmark(leftHand?.landmarks?.[0], frame), basis),
      ...relativePoint(normalizeLandmark(rightHand?.landmarks?.[0], frame), basis),
    ],
    shape: [
      ...handShapeFeatures(leftHand, frame),
      ...handShapeFeatures(rightHand, frame),
    ],
  }
}

function vectorDistance(a, b) {
  const length = Math.min(a.length, b.length)
  if (!length) return 1
  let sum = 0
  let used = 0
  for (let i = 0; i < length; i += 1) {
    const av = Number(a[i])
    const bv = Number(b[i])
    if (!Number.isFinite(av) || !Number.isFinite(bv)) continue
    const diff = av - bv
    sum += diff * diff
    used += 1
  }
  return used ? Math.sqrt(sum / used) : 1
}

function sequenceVectors(frames) {
  const base = frames.map(baseFrameFeatures)
  return base.map((features, index) => {
    const prev = index > 0 ? base[index - 1] : features
    const direction = features.position.map((value, i) => value - prev.position[i])
    return {
      overall: [...features.position, ...features.shape, ...direction],
      handPosition: features.position,
      handShape: features.shape,
      direction,
    }
  })
}

function downsample(frames, maxFrames = 90) {
  if (frames.length <= maxFrames) return frames
  const sampled = []
  for (let i = 0; i < maxFrames; i += 1) {
    sampled.push(frames[Math.round((i * (frames.length - 1)) / (maxFrames - 1))])
  }
  return sampled
}

function dtwDistance(seqA, seqB, key) {
  if (!seqA.length || !seqB.length) return Number.POSITIVE_INFINITY
  const a = downsample(seqA)
  const b = downsample(seqB)
  const prev = new Array(b.length + 1).fill(Number.POSITIVE_INFINITY)
  let curr = new Array(b.length + 1).fill(Number.POSITIVE_INFINITY)
  prev[0] = 0
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = Number.POSITIVE_INFINITY
    for (let j = 1; j <= b.length; j += 1) {
      const cost = vectorDistance(a[i - 1][key], b[j - 1][key])
      curr[j] = cost + Math.min(prev[j], curr[j - 1], prev[j - 1])
    }
    for (let j = 0; j < curr.length; j += 1) prev[j] = curr[j]
    curr = new Array(b.length + 1).fill(Number.POSITIVE_INFINITY)
  }
  return prev[b.length] / (a.length + b.length)
}

function distanceToScore(distance, scale) {
  return Math.round(clamp01(1 - distance / scale) * 100)
}

function feedbackFromScores(scores) {
  const items = []
  if (scores.handShape < 68) items.push('손모양이 정답 수어와 많이 달라요. 손가락 끝과 손바닥 방향을 다시 맞춰보세요.')
  if (scores.handPosition < 68) items.push('손 위치가 기준 위치에서 벗어났어요. 얼굴/가슴 기준 높이를 맞춰보세요.')
  if (scores.direction < 68) items.push('움직임 방향이 달라요. 아바타가 움직이는 방향을 천천히 따라가 보세요.')
  if (!items.length) items.push('전체 흐름이 기준 수어와 비슷해요.')
  return items
}

function getSegment(segmentId, lemma) {
  if (segmentId) {
    return db.prepare('SELECT * FROM sign_motion_segments WHERE id = ?').get(segmentId)
  }
  if (!lemma) return null
  return db.prepare(`
    SELECT * FROM sign_motion_segments
    WHERE lemma = ? AND keypoints_path != ''
    ORDER BY CASE review_status WHEN 'retargeted' THEN 0 ELSE 1 END, id ASC
    LIMIT 1
  `).get(lemma)
}

function loadReference(segment) {
  const filePath = resolveKeypointPath(segment?.keypoints_path)
  if (!filePath) return { frames: [], filePath: '' }
  if (!referenceCache.has(filePath)) {
    referenceCache.set(filePath, parseJsonlMaybeGzip(filePath))
  }
  return { frames: referenceCache.get(filePath) || [], filePath }
}

function evaluateSignPractice({ segmentId, lemma, userSequence = [] }) {
  const segment = getSegment(segmentId, lemma)
  if (!segment) {
    const error = new Error('reference segment not found')
    error.statusCode = 404
    throw error
  }
  const { frames: referenceFrames, filePath } = loadReference(segment)
  const cleanUserFrames = Array.isArray(userSequence) ? userSequence.filter(Boolean) : []
  if (referenceFrames.length < 5 || cleanUserFrames.length < 5) {
    const error = new Error('not enough keypoint frames for evaluation')
    error.statusCode = 400
    throw error
  }

  const reference = sequenceVectors(referenceFrames)
  const user = sequenceVectors(cleanUserFrames)
  const distances = {
    handShape: dtwDistance(user, reference, 'handShape'),
    handPosition: dtwDistance(user, reference, 'handPosition'),
    direction: dtwDistance(user, reference, 'direction'),
    overall: dtwDistance(user, reference, 'overall'),
  }
  const scores = {
    handShape: distanceToScore(distances.handShape, 1.1),
    handPosition: distanceToScore(distances.handPosition, 1.0),
    direction: distanceToScore(distances.direction, 0.35),
    overall: distanceToScore(distances.overall, 0.9),
  }
  const weightedOverall = Math.round(
    scores.handShape * 0.3 +
    scores.handPosition * 0.4 +
    scores.direction * 0.3
  )
  scores.overall = Math.round((scores.overall + weightedOverall) / 2)
  const correct = scores.overall >= 72 && Math.min(scores.handShape, scores.handPosition, scores.direction) >= 55

  return {
    correct,
    status: correct ? 'correct' : 'retry',
    score: scores.overall,
    scores,
    distances,
    feedback: feedbackFromScores(scores),
    method: 'DTW baseline with normalized pose/hand keypoints',
    threshold: {
      overall: 72,
      minimumCoreMetric: 55,
    },
    frames: {
      user: cleanUserFrames.length,
      reference: referenceFrames.length,
    },
    segment: {
      id: segment.id,
      lemma: segment.lemma,
      keypoints_path: segment.keypoints_path,
      reference_file: filePath,
    },
  }
}

module.exports = {
  evaluateSignPractice,
}
