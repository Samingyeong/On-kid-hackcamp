#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
ENV_FILE="${ENV_FILE:-$BACKEND_DIR/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

PYTHON_BIN="${PYTHON_BIN:-python3}"
MIDM_PYTHON_BIN="${MIDM_PYTHON_BIN:-$PYTHON_BIN}"
VOICE_PYTHON_BIN="${VOICE_PYTHON_BIN:-$PYTHON_BIN}"

MIDM_HOST="${MIDM_HOST:-127.0.0.1}"
MIDM_PORT="${MIDM_PORT:-8000}"
MIDM_MODEL_NAME="${MIDM_MODEL_NAME:-K-intelligence/Midm-2.0-Mini-Instruct}"
MIDM_SERVED_MODEL_NAME="${MIDM_SERVED_MODEL_NAME:-${MIDM_MODEL:-midm-mini}}"
MIDM_TENSOR_PARALLEL_SIZE="${MIDM_TENSOR_PARALLEL_SIZE:-1}"
MIDM_SKIP="${MIDM_SKIP:-0}"

VOICE_HOST="${VOICE_HOST:-127.0.0.1}"
VOICE_PORT="${VOICE_PORT:-4100}"
VOICE_STT_BACKEND="${VOICE_STT_BACKEND:-faster-whisper}"
if [[ "$VOICE_STT_BACKEND" == "mock" && "${ALLOW_MOCK_STT:-0}" != "1" ]]; then
  VOICE_STT_BACKEND="faster-whisper"
fi
VOICE_TTS_BACKEND="${VOICE_TTS_BACKEND:-supertonic}"
WHISPER_MODEL_SIZE="${WHISPER_MODEL_SIZE:-large-v3}"
WHISPER_MODEL_PATH="${WHISPER_MODEL_PATH:-}"
WHISPER_DEVICE="${WHISPER_DEVICE:-auto}"
WHISPER_COMPUTE_TYPE="${WHISPER_COMPUTE_TYPE:-auto}"
STT_SKIP="${STT_SKIP:-0}"

CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --skip-midm) MIDM_SKIP=1 ;;
    --skip-stt) STT_SKIP=1 ;;
    -h|--help)
      cat <<'EOF'
Start Midm-mini and faster-whisper API services.

Usage:
  bash scripts/start-model-apis.sh
  bash scripts/start-model-apis.sh --check

Useful environment variables:
  PYTHON_BIN, MIDM_PYTHON_BIN, VOICE_PYTHON_BIN
  MIDM_MODEL_NAME, MIDM_SERVED_MODEL_NAME, MIDM_PORT, MIDM_TENSOR_PARALLEL_SIZE
  MIDM_CUDA_VISIBLE_DEVICES, WHISPER_CUDA_VISIBLE_DEVICES
  WHISPER_MODEL_SIZE, WHISPER_MODEL_PATH, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE
  MIDM_SKIP=1, STT_SKIP=1
EOF
      exit 0
      ;;
  esac
done

require_module() {
  local python_bin="$1"
  local module="$2"
  local install_hint="$3"
  if ! "$python_bin" -c "import ${module}" >/dev/null 2>&1; then
    echo "[models] Missing Python module '${module}' for ${python_bin}."
    echo "[models] ${install_hint}"
    exit 1
  fi
}

check_port_hint() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[models] Port ${port} is already in use. Stop the existing service or set a different port."
    exit 1
  fi
}

if [[ "$MIDM_SKIP" != "1" ]]; then
  "$MIDM_PYTHON_BIN" --version >/dev/null
  require_module "$MIDM_PYTHON_BIN" "vllm" "Install on a Linux/CUDA machine with: npm run setup:midm-model"
  check_port_hint "$MIDM_PORT"
fi

if [[ "$STT_SKIP" != "1" ]]; then
  "$VOICE_PYTHON_BIN" --version >/dev/null
  require_module "$VOICE_PYTHON_BIN" "faster_whisper" "Install with: npm run setup:voice-models"
  require_module "$VOICE_PYTHON_BIN" "fastapi" "Install base Python deps with: npm --prefix backend run install:python"
  check_port_hint "$VOICE_PORT"
fi

if [[ "$CHECK_ONLY" == "1" ]]; then
  echo "[models] Check passed."
  exit 0
fi

pids=()
cleanup() {
  echo
  echo "[models] Stopping model API services..."
  for pid in "${pids[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
}
trap cleanup INT TERM EXIT

if [[ "$MIDM_SKIP" != "1" ]]; then
  echo "[models] Starting Midm-mini OpenAI-compatible API at http://${MIDM_HOST}:${MIDM_PORT}/v1"
  (
    cd "$ROOT_DIR"
    if [[ -n "${MIDM_CUDA_VISIBLE_DEVICES:-}" ]]; then
      export CUDA_VISIBLE_DEVICES="$MIDM_CUDA_VISIBLE_DEVICES"
    fi
    exec "$MIDM_PYTHON_BIN" -m vllm.entrypoints.openai.api_server \
      --host "$MIDM_HOST" \
      --port "$MIDM_PORT" \
      --model "$MIDM_MODEL_NAME" \
      --served-model-name "$MIDM_SERVED_MODEL_NAME" \
      --tensor-parallel-size "$MIDM_TENSOR_PARALLEL_SIZE" \
      --trust-remote-code
  ) &
  pids+=("$!")
fi

if [[ "$STT_SKIP" != "1" ]]; then
  echo "[models] Starting faster-whisper voice API at http://${VOICE_HOST}:${VOICE_PORT}"
  (
    cd "$BACKEND_DIR"
    if [[ -n "${WHISPER_CUDA_VISIBLE_DEVICES:-}" ]]; then
      export CUDA_VISIBLE_DEVICES="$WHISPER_CUDA_VISIBLE_DEVICES"
    fi
    export VOICE_STT_BACKEND
    export VOICE_TTS_BACKEND
    export WHISPER_MODEL_SIZE
    export WHISPER_MODEL_PATH
    export WHISPER_DEVICE
    export WHISPER_COMPUTE_TYPE
    exec "$VOICE_PYTHON_BIN" -m uvicorn voice_service:app --host "$VOICE_HOST" --port "$VOICE_PORT"
  ) &
  pids+=("$!")
fi

echo "[models] Backend .env should point to:"
echo "[models]   MIDM_BASE_URL=http://${MIDM_HOST}:${MIDM_PORT}/v1"
echo "[models]   MIDM_MODEL=${MIDM_SERVED_MODEL_NAME}"
echo "[models]   VOICE_SERVICE_URL=http://${VOICE_HOST}:${VOICE_PORT}"
echo "[models] Press Ctrl+C to stop."

while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      wait "$pid" || exit_code=$?
      exit_code="${exit_code:-0}"
      echo "[models] One model service exited with code ${exit_code}."
      exit "$exit_code"
    fi
  done
  sleep 1
done
