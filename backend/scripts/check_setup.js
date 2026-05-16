const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..', '..')
const backendDir = path.join(rootDir, 'backend')
const frontendDir = path.join(rootDir, 'frontend')
const pythonBin = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} 없음: ${path.relative(rootDir, filePath)}`)
  }
}

function assertDirWithFiles(dirPath, label, minCount = 1) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`${label} 디렉터리 없음: ${path.relative(rootDir, dirPath)}`)
  }
  const count = countFiles(dirPath)
  if (count < minCount) {
    throw new Error(`${label} 파일 부족: ${count}/${minCount}`)
  }
  return count
}

function countFiles(dirPath) {
  let total = 0
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const child = path.join(dirPath, entry.name)
    if (entry.isDirectory()) total += countFiles(child)
    else total += 1
  }
  return total
}

function runPythonCheck() {
  const code = [
    'import konlpy, jpype',
    'from konlpy.tag import Okt',
    'okt = Okt()',
    'print("konlpy-ok")',
  ].join('; ')
  const result = spawnSync(pythonBin, ['-c', code], {
    cwd: backendDir,
    encoding: 'utf8',
    shell: false,
  })
  if (result.error) {
    throw new Error(`Python 실행 실패: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`KoNLPy/Okt 확인 실패:\n${result.stderr || result.stdout}`)
  }
}

function runDbCheck() {
  const Database = require('better-sqlite3')
  const dbPath = path.join(backendDir, 'data', 'books.db')
  const db = new Database(dbPath, { readonly: true })
  try {
    const signCount = db.prepare("SELECT COUNT(*) AS count FROM sign_motion_segments WHERE keypoints_path != ''").get().count
    const wordCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM (
        SELECT lemma
        FROM sign_motion_segments
        WHERE keypoints_path != '' AND notes LIKE 'hen_nureongi exact%'
        GROUP BY lemma
      )
    `).get().count
    if (signCount < 1 || wordCount < 1) {
      throw new Error(`수어 평가 데이터 부족: segments=${signCount}, words=${wordCount}`)
    }
    return { signCount, wordCount }
  } finally {
    db.close()
  }
}

try {
  assertFile(path.join(backendDir, 'data', 'books.db'), 'SQLite DB')
  assertFile(path.join(frontendDir, 'public', 'sign-vrm', 'models', 'avatar.vrm'), 'VRM 아바타')
  assertFile(path.join(frontendDir, 'public', 'models', 'hand_landmarker.task'), 'MediaPipe hand 모델')
  assertFile(path.join(frontendDir, 'public', 'models', 'pose_landmarker_full.task'), 'MediaPipe pose 모델')
  const wasmCount = assertDirWithFiles(path.join(frontendDir, 'public', 'mediapipe', 'wasm'), 'MediaPipe WASM', 4)
  const keypointCount = assertDirWithFiles(path.join(backendDir, 'data', 'sign_motion'), '수어 키포인트', 10)
  const { signCount, wordCount } = runDbCheck()
  runPythonCheck()
  console.log(`[setup] OK: keypointFiles=${keypointCount}, wasmFiles=${wasmCount}, signSegments=${signCount}, signWords=${wordCount}`)
} catch (error) {
  console.error(`[setup] FAIL: ${error.message}`)
  process.exit(1)
}
