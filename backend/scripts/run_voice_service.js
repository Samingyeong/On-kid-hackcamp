const { spawn, spawnSync } = require('child_process')
const path = require('path')

const backendDir = path.resolve(__dirname, '..')
require('dotenv').config({ path: path.join(backendDir, '.env') })

function pickPython() {
  const defaults = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python']
  const candidates = [
    process.env.VOICE_PYTHON_BIN,
    process.env.PYTHON_BIN,
    ...defaults,
  ].filter(Boolean)

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' })
    if (result.status === 0) return candidate
  }

  throw new Error('Python 실행 파일을 찾지 못했습니다. VOICE_PYTHON_BIN 또는 PYTHON_BIN을 설정해 주세요.')
}

const python = pickPython()
const env = {
  ...process.env,
  VOICE_TTS_BACKEND: process.env.VOICE_TTS_BACKEND || 'supertonic',
}
const host = process.env.VOICE_HOST || '127.0.0.1'
const port = process.env.VOICE_PORT || '4100'
const child = spawn(
  python,
  ['-m', 'uvicorn', 'voice_service:app', '--host', host, '--port', port],
  {
    cwd: backendDir,
    env,
    stdio: 'inherit',
  },
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1)
    return
  }
  process.exit(code || 0)
})
