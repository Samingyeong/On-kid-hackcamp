const path = require('path')
const { spawnSync } = require('child_process')

const pythonBin = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')
const requirements = path.join(__dirname, '..', 'requirements.txt')

const result = spawnSync(pythonBin, ['-m', 'pip', 'install', '-r', requirements], {
  stdio: 'inherit',
  shell: false,
})

if (result.error) {
  console.error(`[setup] Python 실행 실패: ${result.error.message}`)
  console.error('[setup] PYTHON_BIN 환경변수로 Python 실행 파일을 지정해 주세요.')
  console.error('[setup] 예: PYTHON_BIN=python3 npm run install:python')
  process.exit(1)
}

process.exit(result.status || 0)
