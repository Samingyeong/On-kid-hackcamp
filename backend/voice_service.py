import base64
import io
import os
import sys
import tempfile
import wave
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


APP_NAME = "on-kid-voice-service"
STT_BACKEND = os.getenv("VOICE_STT_BACKEND", "mock").lower()
TTS_BACKEND = os.getenv("VOICE_TTS_BACKEND", "supertonic").lower()
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "large-v3")
WHISPER_MODEL_PATH = os.getenv("WHISPER_MODEL_PATH", "")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "auto")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "auto")
SUPERTONIC_REPO_DIR = os.getenv("SUPERTONIC_REPO_DIR", "")
SUPERTONIC_ASSET_DIR = os.getenv("SUPERTONIC_ASSET_DIR", "")
SUPERTONIC_VOICE = os.getenv("SUPERTONIC_VOICE", "F1")
SUPERTONIC_TOTAL_STEPS = int(os.getenv("SUPERTONIC_TOTAL_STEPS", "8"))
SUPERTONIC_USE_GPU = os.getenv("SUPERTONIC_USE_GPU", "0") == "1"
SUPERTONIC_CACHE_DIR = str(Path(os.getenv("SUPERTONIC_HOME_DIR", str(Path.home()))) / ".cache" / "supertonic3")

app = FastAPI(title=APP_NAME)


class SttRequest(BaseModel):
  audioBase64: str = ""
  mimeType: str = "audio/webm"
  language: str = "ko"
  prompt: str = ""


class TtsRequest(BaseModel):
  text: str
  voice: str = "default"
  rate: float = 1.0
  lang: str = "ko"
  format: str = "wav"
  totalSteps: int = 0


def _decode_audio(audio_base64: str) -> bytes:
  if not audio_base64:
    return b""
  if "," in audio_base64 and audio_base64.split(",", 1)[0].startswith("data:"):
    audio_base64 = audio_base64.split(",", 1)[1]
  try:
    return base64.b64decode(audio_base64)
  except Exception as exc:
    raise HTTPException(status_code=400, detail="invalid audioBase64") from exc


@lru_cache(maxsize=1)
def _load_whisper_model():
  try:
    from faster_whisper import WhisperModel
  except Exception as exc:
    raise RuntimeError("faster-whisper is not installed in this Python environment") from exc

  model_kwargs = {}
  if WHISPER_DEVICE != "auto":
    model_kwargs["device"] = WHISPER_DEVICE
  if WHISPER_COMPUTE_TYPE != "auto":
    model_kwargs["compute_type"] = WHISPER_COMPUTE_TYPE
  return WhisperModel(WHISPER_MODEL_PATH or WHISPER_MODEL_SIZE, **model_kwargs)


@lru_cache(maxsize=8)
def _load_supertonic_voice(voice_name: str):
  safe_voice = Path(voice_name if voice_name != "default" else SUPERTONIC_VOICE).stem

  if not SUPERTONIC_REPO_DIR or not SUPERTONIC_ASSET_DIR:
    from supertonic import TTS

    tts = TTS(auto_download=True)
    style = tts.get_voice_style(voice_name=safe_voice)
    return "sdk", tts, style, safe_voice

  helper_dir = Path(SUPERTONIC_REPO_DIR) / "py"
  asset_dir = Path(SUPERTONIC_ASSET_DIR)
  onnx_dir = asset_dir / "onnx"
  voice_path = asset_dir / "voice_styles" / f"{safe_voice}.json"

  if not onnx_dir.exists():
    raise RuntimeError(f"Supertonic ONNX directory not found: {onnx_dir}")
  if not voice_path.exists():
    raise RuntimeError(f"Supertonic voice style not found: {voice_path}")

  helper_dir_str = str(helper_dir)
  if helper_dir_str not in sys.path:
    sys.path.insert(0, helper_dir_str)

  from helper import load_text_to_speech, load_voice_style

  tts = load_text_to_speech(str(onnx_dir), use_gpu=SUPERTONIC_USE_GPU)
  style = load_voice_style([str(voice_path)])
  return "onnx", tts, style, safe_voice


def _wav_float_to_base64(wav_array, sample_rate: int) -> str:
  import numpy as np

  samples = np.asarray(wav_array, dtype=np.float32).reshape(-1)
  samples = np.clip(samples, -1.0, 1.0)
  pcm = (samples * 32767.0).astype("<i2").tobytes()

  buffer = io.BytesIO()
  with wave.open(buffer, "wb") as wav_file:
    wav_file.setnchannels(1)
    wav_file.setsampwidth(2)
    wav_file.setframerate(sample_rate)
    wav_file.writeframes(pcm)

  return base64.b64encode(buffer.getvalue()).decode("ascii")


def _is_supertonic_ready() -> bool:
  if TTS_BACKEND != "supertonic":
    return False
  if SUPERTONIC_REPO_DIR and SUPERTONIC_ASSET_DIR:
    asset_dir = Path(SUPERTONIC_ASSET_DIR)
    return (
      (Path(SUPERTONIC_REPO_DIR) / "py" / "helper.py").exists()
      and (asset_dir / "onnx" / "tts.json").exists()
      and (asset_dir / "voice_styles").exists()
    )
  try:
    import importlib.util
    return importlib.util.find_spec("supertonic") is not None
  except Exception:
    return False


@app.get("/health")
def health():
  return {
    "ok": True,
    "service": APP_NAME,
    "sttBackend": STT_BACKEND,
    "ttsBackend": TTS_BACKEND,
    "whisperModelSize": WHISPER_MODEL_SIZE,
    "whisperModelPath": WHISPER_MODEL_PATH,
    "supertonicMode": "onnx-assets" if SUPERTONIC_REPO_DIR and SUPERTONIC_ASSET_DIR else "python-sdk",
    "supertonicReady": _is_supertonic_ready(),
    "supertonicUseGpu": SUPERTONIC_USE_GPU,
    "supertonicCacheDir": SUPERTONIC_CACHE_DIR,
  }


@app.post("/stt/transcribe")
def transcribe(req: SttRequest):
  audio_bytes = _decode_audio(req.audioBase64)

  if STT_BACKEND == "mock":
    return {
      "text": "",
      "language": req.language,
      "duration": 0,
      "segments": [],
      "backend": "mock",
      "status": "not_configured",
      "message": "Set VOICE_STT_BACKEND=faster-whisper after installing faster-whisper.",
    }

  if STT_BACKEND != "faster-whisper":
    raise HTTPException(status_code=400, detail=f"unsupported STT backend: {STT_BACKEND}")

  if not audio_bytes:
    raise HTTPException(status_code=400, detail="audioBase64 is required")

  suffix = ".webm"
  if "wav" in req.mimeType:
    suffix = ".wav"
  elif "mp4" in req.mimeType or "m4a" in req.mimeType:
    suffix = ".m4a"

  temp_path = ""
  try:
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as audio_file:
      temp_path = audio_file.name
      audio_file.write(audio_bytes)
      audio_file.flush()

    model = _load_whisper_model()
    segments, info = model.transcribe(
      temp_path,
      language=req.language or "ko",
      initial_prompt=req.prompt or None,
      vad_filter=True,
    )
    items = [
      {
        "start": segment.start,
        "end": segment.end,
        "text": segment.text.strip(),
      }
      for segment in segments
    ]
  finally:
    if temp_path:
      try:
        os.unlink(temp_path)
      except FileNotFoundError:
        pass

  return {
    "text": " ".join(item["text"] for item in items).strip(),
    "language": getattr(info, "language", req.language),
    "duration": getattr(info, "duration", 0),
    "segments": items,
    "backend": "faster-whisper",
    "status": "ok",
  }


@app.post("/tts/synthesize")
def synthesize(req: TtsRequest):
  if not req.text.strip():
    raise HTTPException(status_code=400, detail="text is required")

  if TTS_BACKEND in ("browser", "mock"):
    return {
      "audioBase64": "",
      "mimeType": "",
      "text": req.text,
      "backend": TTS_BACKEND,
      "status": "client_fallback",
      "message": "Use browser speechSynthesis for now; plug Supertonic here later.",
    }

  if TTS_BACKEND != "supertonic":
    raise HTTPException(status_code=400, detail=f"unsupported TTS backend: {TTS_BACKEND}")

  try:
    mode, tts, style, voice_name = _load_supertonic_voice(req.voice)
    total_steps = req.totalSteps or SUPERTONIC_TOTAL_STEPS
    speed = max(0.7, min(req.rate or 1.0, 2.0))
    if mode == "sdk":
      wav, duration = tts.synthesize(
        text=req.text,
        lang=req.lang or "ko",
        voice_style=style,
        total_steps=total_steps,
        speed=speed,
      )
      sample_rate = 44100
    else:
      wav, duration = tts(
        req.text,
        req.lang or "ko",
        style,
        total_steps,
        speed,
      )
      sample_rate = tts.sample_rate
    try:
      duration_value = float(duration[0]) if len(duration) else 0.0
    except TypeError:
      duration_value = float(duration or 0)
    sample_count = int(sample_rate * duration_value) if duration_value > 0 else wav.shape[-1]
    audio_base64 = _wav_float_to_base64(wav[0, :sample_count], sample_rate)
    return {
      "audioBase64": audio_base64,
      "mimeType": "audio/wav",
      "sampleRate": sample_rate,
      "duration": duration_value,
      "voice": voice_name,
      "text": req.text,
      "backend": "supertonic",
      "mode": mode,
      "status": "ok",
    }
  except NotImplementedError as exc:
    raise HTTPException(status_code=501, detail=str(exc)) from exc
  except Exception as exc:
    raise HTTPException(status_code=500, detail=f"Supertonic synthesis failed: {exc}") from exc
