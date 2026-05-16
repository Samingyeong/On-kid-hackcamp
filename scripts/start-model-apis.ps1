param(
  [switch]$Check,
  [switch]$SkipMidm,
  [switch]$SkipStt,
  [switch]$UseWsl
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RootDir "backend"
$EnvFile = if ($env:ENV_FILE) { $env:ENV_FILE } else { Join-Path $BackendDir ".env" }

if ($UseWsl -or $env:MODEL_API_USE_WSL -eq "1") {
  $repoForWsl = (wsl wslpath -a $RootDir).Trim()
  $argsForWsl = @("cd '$repoForWsl' && bash scripts/start-model-apis.sh")
  if ($Check) { $argsForWsl[0] += " --check" }
  if ($SkipMidm) { $argsForWsl[0] += " --skip-midm" }
  if ($SkipStt) { $argsForWsl[0] += " --skip-stt" }
  wsl bash -lc $argsForWsl[0]
  exit $LASTEXITCODE
}

if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $name, $value = $line.Split("=", 2)
    if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

function Get-EnvOrDefault([string]$Name, [string]$Default) {
  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
  return $value
}

function Test-PythonModule([string]$Python, [string]$Module, [string]$Hint) {
  & $Python -c "import $Module" *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[models] Missing Python module '$Module' for $Python."
    Write-Host "[models] $Hint"
    exit 1
  }
}

function Test-PortAvailable([int]$Port) {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    Write-Host "[models] Port $Port is already in use. Stop the existing service or set a different port."
    exit 1
  }
}

$PythonBin = Get-EnvOrDefault "PYTHON_BIN" "python"
$MidmPython = Get-EnvOrDefault "MIDM_PYTHON_BIN" $PythonBin
$VoicePython = Get-EnvOrDefault "VOICE_PYTHON_BIN" $PythonBin

$MidmHost = Get-EnvOrDefault "MIDM_HOST" "127.0.0.1"
$MidmPort = [int](Get-EnvOrDefault "MIDM_PORT" "8000")
$MidmModelName = Get-EnvOrDefault "MIDM_MODEL_NAME" "K-intelligence/Midm-2.0-Mini-Instruct"
$MidmServedModel = Get-EnvOrDefault "MIDM_SERVED_MODEL_NAME" (Get-EnvOrDefault "MIDM_MODEL" "midm-mini")
$MidmTp = Get-EnvOrDefault "MIDM_TENSOR_PARALLEL_SIZE" "1"

$VoiceHost = Get-EnvOrDefault "VOICE_HOST" "127.0.0.1"
$VoicePort = [int](Get-EnvOrDefault "VOICE_PORT" "4100")
$VoiceSttBackend = Get-EnvOrDefault "VOICE_STT_BACKEND" "faster-whisper"
if ($VoiceSttBackend -eq "mock" -and $env:ALLOW_MOCK_STT -ne "1") {
  $VoiceSttBackend = "faster-whisper"
}
$VoiceTtsBackend = Get-EnvOrDefault "VOICE_TTS_BACKEND" "supertonic"
$WhisperModelSize = Get-EnvOrDefault "WHISPER_MODEL_SIZE" "large-v3"
$WhisperModelPath = Get-EnvOrDefault "WHISPER_MODEL_PATH" ""
$WhisperDevice = Get-EnvOrDefault "WHISPER_DEVICE" "auto"
$WhisperComputeType = Get-EnvOrDefault "WHISPER_COMPUTE_TYPE" "auto"

if (-not $SkipMidm -and $env:MIDM_SKIP -ne "1") {
  & $MidmPython --version *> $null
  Test-PythonModule $MidmPython "vllm" "Install on a Linux/CUDA machine with: npm run setup:midm-model. On Windows, WSL2/server execution is usually safer for vLLM."
  Test-PortAvailable $MidmPort
}

if (-not $SkipStt -and $env:STT_SKIP -ne "1") {
  & $VoicePython --version *> $null
  Test-PythonModule $VoicePython "faster_whisper" "Install with: npm run setup:voice-models"
  Test-PythonModule $VoicePython "fastapi" "Install base Python deps with: npm --prefix backend run install:python"
  Test-PortAvailable $VoicePort
}

if ($Check) {
  Write-Host "[models] Check passed."
  exit 0
}

$jobs = @()

try {
  if (-not $SkipMidm -and $env:MIDM_SKIP -ne "1") {
    Write-Host "[models] Starting Midm-mini OpenAI-compatible API at http://${MidmHost}:${MidmPort}/v1"
    $jobs += Start-Job -Name "midm-mini-api" -ScriptBlock {
      param($RootDir, $Python, $HostName, $Port, $ModelName, $ServedModel, $Tp, $Cuda)
      Set-Location $RootDir
      if ($Cuda) { $env:CUDA_VISIBLE_DEVICES = $Cuda }
      & $Python -m vllm.entrypoints.openai.api_server `
        --host $HostName `
        --port $Port `
        --model $ModelName `
        --served-model-name $ServedModel `
        --tensor-parallel-size $Tp `
        --trust-remote-code
    } -ArgumentList $RootDir, $MidmPython, $MidmHost, $MidmPort, $MidmModelName, $MidmServedModel, $MidmTp, $env:MIDM_CUDA_VISIBLE_DEVICES
  }

  if (-not $SkipStt -and $env:STT_SKIP -ne "1") {
    Write-Host "[models] Starting faster-whisper voice API at http://${VoiceHost}:${VoicePort}"
    $jobs += Start-Job -Name "faster-whisper-api" -ScriptBlock {
      param($BackendDir, $Python, $HostName, $Port, $SttBackend, $TtsBackend, $ModelSize, $ModelPath, $Device, $ComputeType, $Cuda)
      Set-Location $BackendDir
      if ($Cuda) { $env:CUDA_VISIBLE_DEVICES = $Cuda }
      $env:VOICE_STT_BACKEND = $SttBackend
      $env:VOICE_TTS_BACKEND = $TtsBackend
      $env:WHISPER_MODEL_SIZE = $ModelSize
      $env:WHISPER_MODEL_PATH = $ModelPath
      $env:WHISPER_DEVICE = $Device
      $env:WHISPER_COMPUTE_TYPE = $ComputeType
      & $Python -m uvicorn voice_service:app --host $HostName --port $Port
    } -ArgumentList $BackendDir, $VoicePython, $VoiceHost, $VoicePort, $VoiceSttBackend, $VoiceTtsBackend, $WhisperModelSize, $WhisperModelPath, $WhisperDevice, $WhisperComputeType, $env:WHISPER_CUDA_VISIBLE_DEVICES
  }

  Write-Host "[models] Backend .env should point to:"
  Write-Host "[models]   MIDM_BASE_URL=http://${MidmHost}:${MidmPort}/v1"
  Write-Host "[models]   MIDM_MODEL=${MidmServedModel}"
  Write-Host "[models]   VOICE_SERVICE_URL=http://${VoiceHost}:${VoicePort}"
  Write-Host "[models] Press Ctrl+C to stop."

  while ($true) {
    Receive-Job -Job $jobs
    $failed = $jobs | Where-Object { $_.State -in @("Failed", "Stopped", "Completed") }
    if ($failed) {
      Write-Host "[models] A model service stopped: $($failed[0].Name)"
      exit 1
    }
    Start-Sleep -Seconds 1
  }
}
finally {
  if ($jobs.Count -gt 0) {
    Stop-Job -Job $jobs -ErrorAction SilentlyContinue
    Remove-Job -Job $jobs -Force -ErrorAction SilentlyContinue
  }
}
