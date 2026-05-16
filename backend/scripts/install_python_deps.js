const path = require('path')
const { spawnSync } = require('child_process')

function pickPython() {
  const defaults = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python']
  const candidates = [process.env.PYTHON_BIN, ...defaults].filter(Boolean)
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore', shell: false })
    if (result.status === 0) return candidate
  }
  return process.env.PYTHON_BIN || defaults[0]
}

const pythonBin = pickPython()
const requirementsArg = process.argv[2] || 'requirements.txt'
const requirements = path.isAbsolute(requirementsArg)
  ? requirementsArg
  : path.join(__dirname, '..', requirementsArg)

const result = spawnSync(pythonBin, ['-m', 'pip', 'install', '-r', requirements], {
  stdio: 'inherit',
  shell: false,
})

if (result.error) {
  console.error(`[setup] Python 실행 실패: ${result.error.message}`)
  console.error('[setup] PYTHON_BIN 환경변수로 Python 실행 파일을 지정해 주세요.')
  console.error('[setup] macOS/Linux 예: PYTHON_BIN=python3 npm run install:python')
  console.error('[setup] Windows PowerShell 예: $env:PYTHON_BIN="py"; npm run install:python')
  process.exit(1)
}

process.exit(result.status || 0)
