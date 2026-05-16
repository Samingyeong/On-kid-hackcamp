# 모두의 동화 — 멀티모달 동화 학습 플랫폼

> 장애아동 맞춤 멀티모달 동화 학습 플랫폼  
> "듣고, 보고, 쓰고, 손으로 말하는" AI 기반 동화 학습 서비스

청각장애·언어발달 지연 아동을 포함한 모든 아이들이 동화를 통해 한국어를 배울 수 있도록,  
영상·자막·수어·필기 인식을 하나의 플랫폼에 통합한 학습 서비스입니다.

---

## 프로젝트 개요

### 문제 정의

국내 장애아동(청각장애, 언어발달 지연 등)은 일반 아동 대비 언어 학습 기회가 현저히 부족합니다.  
기존 동화 콘텐츠는 음성 중심으로 설계되어 있어 청각장애 아동이 접근하기 어렵고,  
수어 병행 콘텐츠는 극히 드뭅니다.

### 해결 방향

공공 동화 영상 + AI 형태소 분석 + 수어 키포인트 데이터 + 필기 인식을 결합하여,  
장애 유무와 언어 배경에 관계없이 누구나 동화로 한국어를 배울 수 있는 플랫폼을 구축합니다.

---

## 주요 기능

### 1. 멀티모달 동화 뷰어
- 국립어린이청소년도서관 동화 영상을 영상+자막 병렬 화면으로 제공
- 한국어 자막 동기화 지원 (다국어 자막 추후 확장 예정)
- 영상 재생 위치와 자막 자동 동기화

### 2. 단어 학습 (클릭 사전)
- 자막의 모든 단어를 클릭하면 AI 형태소 분석으로 기본형 추출
- 한국어기초사전 API 연동으로 뜻·품사·난이도 등급 즉시 표시
- "알아요 / 몰라요" 버튼으로 개인 단어장 자동 구성

### 3. 따라쓰기 학습
- 3단계 학습: 가이드 따라쓰기 → 혼자 쓰기 → 힌트 없이 쓰기
- Canvas 기반 필기 입력 (터치/펜 지원)
- Google Vision API 연동 OCR 채점

### 4. 타자치기 학습
- 한글 자모 키보드 UI + 3D 손 모델 애니메이션
- 키 입력에 따라 해당 손가락 실시간 반응
- 오타 감지 + 경과 시간 + 진행도 통계

### 5. 문장 학습
- 동화에서 추출된 문장을 카드 형태로 학습
- 순차 네비게이션 + 진행 표시

### 6. 수어 따라하기 평가
- "암탉과 누렁이" 동화 단어 기준 수어 예시를 VRM 아바타로 재생
- 웹캠 입력에서 MediaPipe pose/hand 키포인트를 실시간 추출
- 정답 prototype sequence와 사용자 keypoint sequence를 DTW 기반으로 비교
- 손모양, 손위치, 움직임 방향 항목별 점수를 내부 산출하고, MVP 화면에서는 정답/재시도 흐름만 노출

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 19 + TypeScript + Vite 8 |
| 3D 렌더링 | Three.js + @react-three/fiber + @react-three/drei |
| 백엔드 | Node.js + Express 4 |
| 데이터베이스 | SQLite (better-sqlite3) |
| AI/NLP | Python (KoNLPy Okt) + Groq API (Llama 3.1) |
| 필기 인식 | Google Vision API (OCR) |
| 사전 | 국립국어원 한국어기초사전 API |
| 동화 데이터 | 문화공공데이터광장 API + 국립어린이청소년도서관 |

---

## 활용 데이터

| 데이터 | 출처 | 활용 방식 |
|--------|------|-----------|
| 다국어 동화 영상·자막 | 국립어린이청소년도서관 (NLCY) | 동화 콘텐츠 및 VTT 자막 제공 |
| 동화 메타데이터 | 문화공공데이터광장 API | 책 목록 자동 동기화 |
| 한국 수어 키포인트 | NIA 한국지능정보사회진흥원 | 수어 동작 시각화 |
| 한국어 사전 | 국립국어원 한국어기초사전 API | 단어 뜻·품사·등급 조회 |

---

## 활용 AI 기술

| 기술 | 도구 | 역할 |
|------|------|------|
| 한국어 형태소 분석 | KoNLPy (Okt) | 자막 단어 기본형 추출, 품사 태깅 |
| LLM 형태소 보정 | Groq (Llama 3.1) | 문맥 기반 동형이의어 판별, 핵심 단어 추출 |
| 필기 인식 | Google Vision API | 아이 필기 텍스트 인식 및 정확도 평가 |
| 수어 키포인트 | NIA 라벨링 데이터 | 수어 동작 재현 (개발 중) |

---

## 프로젝트 구조

```
On-kid-hackcamp/
├── frontend/           # React 프론트엔드
│   ├── public/
│   │   ├── mediapipe/  # 웹캠 keypoint 추출용 WASM
│   │   ├── models/     # 3D 손 모델 + MediaPipe task 모델
│   │   ├── sign-vrm/   # 수어 예시 VRM 아바타 런타임
│   │   └── svg/        # 아이콘 및 이미지 에셋
│   └── src/
│       ├── api/        # 백엔드 API 통신 모듈
│       ├── components/ # 공통 컴포넌트 (Navbar, CalendarModal, Hand3D 등)
│       ├── constants/  # 카테고리 상수
│       ├── layouts/    # 레이아웃
│       ├── pages/      # 페이지 (Home, BookList, Reader, Study*)
│       ├── router/     # 라우팅 설정
│       └── types/      # TypeScript 타입 정의
├── backend/            # Express 백엔드
│   ├── server.js       # 메인 서버 (API 엔드포인트)
│   ├── db.js           # SQLite DB 연결 + 스키마
│   ├── sync.js         # 외부 API 동기화
│   ├── images.js       # 이미지 로컬 캐시
│   ├── videos.js       # 영상/VTT 프록시
│   ├── sign_motion.js  # 수어 reference segment 조회
│   ├── sign_practice_eval.js # DTW 기반 수어 따라하기 평가
│   ├── data/
│   │   ├── books.db    # 데모용 SQLite DB
│   │   └── sign_motion/# 데모용 수어 keypoint 데이터
│   ├── korean_nlp.py   # 형태소 분석 (KoNLPy)
│   └── korean_nlp_daemon.py  # NLP 상주 프로세스
└── README.md
```

---

## 실행 방법

### 공통 요구사항
- Node.js 22 LTS 권장
- Python 3.8 이상 권장. 현재 macOS 데모는 conda `v1`의 Python 3.8.17로 검증했습니다.
- Java JDK 17 이상 권장 (KoNLPy Okt 실행에 필요). Windows에서는 `JAVA_HOME`과 `Path`에 JDK가 잡혀 있어야 합니다.
- Python 실행 파일은 OS별로 `PYTHON_BIN`을 지정할 수 있습니다. macOS 데모는 `/opt/homebrew/Caskroom/miniforge/base/envs/v1/bin/python`, Windows는 `py` 또는 `python`을 권장합니다.
- Supertonic TTS는 프로젝트 Python 환경에 설치하지 않고 전용 GUI/service 환경에서 별도로 실행합니다.

### 한 번에 설치 및 확인
```bash
npm run setup
```

위 명령은 백엔드/프론트엔드 JS 의존성, Python `requirements.txt`, 데모용 DB·키포인트·VRM·MediaPipe asset 상태를 함께 확인합니다.

### Midm-mini / faster-whisper 모델 API 실행

처음 clone한 뒤 모델 API까지 같은 프로젝트에서 띄우려면 먼저 기본 설정 파일을 만듭니다.

```bash
cp backend/.env.example backend/.env
```

STT만 로컬 또는 서버에서 켤 경우:

```bash
npm run setup:voice-models
```

Supertonic TTS는 전용 GUI/service 환경에서 실행하고, 백엔드는 해당 서비스로 프록시합니다. `backend/.env`는 아래처럼 둡니다. `backend/voice_service.py`를 브리지로 쓰는 경우에도 `v1`이 아니라 Supertonic 런타임이 설치된 별도 Python을 `VOICE_PYTHON_BIN`으로 지정합니다.

```env
VOICE_SERVICE_URL=http://127.0.0.1:4100
VOICE_TTS_BACKEND=supertonic
# macOS/Linux 예: VOICE_PYTHON_BIN=/path/to/supertonic/python
# Windows 예: VOICE_PYTHON_BIN=C:\path\to\supertonic\python.exe
```

Midm-mini를 vLLM OpenAI-compatible API로 직접 띄울 Linux/CUDA 서버에서는 별도 Python 환경에서 아래 의존성을 설치합니다. vLLM은 Windows/macOS 로컬보다 Linux/CUDA 서버 또는 WSL2에서 실행하는 쪽이 안정적입니다.

```bash
npm run setup:midm-model
```

macOS/Linux 터미널:

```bash
npm run models:apis
```

Windows PowerShell:

```powershell
npm run models:apis:win
```

Windows에서 Midm-mini를 WSL2/Linux 쪽에서 띄우려면:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-model-apis.ps1 -UseWsl
```

기본 포트는 Midm-mini `http://127.0.0.1:8000/v1`, voice API `http://127.0.0.1:4100`입니다. GPU 서버에서는 예를 들어 아래처럼 모델별 GPU를 분리할 수 있습니다.

```bash
MIDM_CUDA_VISIBLE_DEVICES=0,1 WHISPER_CUDA_VISIBLE_DEVICES=2 npm run models:apis
```

모델 서버가 떠 있으면 `backend/.env`는 아래 값을 기준으로 둡니다.

```env
MIDM_BASE_URL=http://127.0.0.1:8000/v1
MIDM_MODEL=midm-mini
VOICE_SERVICE_URL=http://127.0.0.1:4100
```

### 백엔드
macOS/Linux:

```bash
cd backend
npm install
PYTHON_BIN=/opt/homebrew/Caskroom/miniforge/base/envs/v1/bin/python npm run install:python
npm run check:setup
PYTHON_BIN=/opt/homebrew/Caskroom/miniforge/base/envs/v1/bin/python npm run dev  # http://localhost:4000
```

Windows에서 Python 실행명이 `py`인 경우 PowerShell에서 아래처럼 지정할 수 있습니다.

```powershell
cd backend
npm install
$env:PYTHON_BIN="py"
npm run install:python
npm run check:setup
npm run dev
```

macOS/Linux에서 Python 실행명이 `python3`가 아닌 경우에도 `PYTHON_BIN`으로 지정하면 됩니다.

루트에서 실행할 수도 있습니다.

```bash
npm run dev:backend
```

### 프론트엔드
```bash
cd frontend
npm install
npm run dev           # http://localhost:5173
```

루트에서 실행할 수도 있습니다.

```bash
npm run dev:frontend
```

수어 따라하기 데모는 백엔드와 프론트엔드를 모두 켠 뒤 아래 경로에서 확인할 수 있습니다.

```text
http://localhost:5173/study/sign?book=암탉과%20누렁이
```

### 환경변수 설정 (backend/.env)
```env
CULTURE_API_KEY=문화공공데이터광장_서비스키
KRDICT_API_KEY=한국어기초사전_API키
GOOGLE_VISION_API_KEY=구글비전_API키
GROQ_API_KEY=Groq_API키
PYTHON_BIN=python
```

템플릿은 `backend/.env.example`, `frontend/.env.example`를 참고하면 됩니다. 수어 따라하기 MVP는 커밋된 `backend/data/books.db`, `backend/data/sign_motion`, `frontend/public/sign-vrm`, `frontend/public/mediapipe`, `frontend/public/models/*landmarker*.task`만으로 로컬 데모가 실행되도록 구성되어 있습니다.

---

## 구현 현황

- ✅ 동화 목록 자동 수집 및 DB 저장
- ✅ 다국어 동화 영상 + 자막 뷰어
- ✅ 단어 클릭 → 형태소 분석 → 사전 조회
- ✅ 개인 단어장 (알아요/몰라요)
- ✅ 필기 따라쓰기 (3단계 + OCR 채점)
- ✅ 타자치기 (한글 키보드 + 3D 손 모델)
- ✅ 문장 학습 카드
- ✅ 홈화면 추천 동화 + 순위
- ✅ 수어 따라하기 평가 (VRM 예시 + 웹캠 keypoint + DTW 비교)
- 🔄 학부모 대시보드 (기획 중)

---

## 기대효과

### 사회적 효과
- 청각장애·언어발달 지연 아동이 수어와 시각 자막을 통해 동화 학습에 동등하게 참여
- 한국어 자막 기반 학습 지원, 다국어 자막 확장 예정
- 분산된 공공 데이터(국립도서관·NIA·국립국어원)를 하나의 학습 경험으로 통합

### 정책적 시사점
- 특수교육 디지털 전환 정책과 연계 가능
- 국립어린이청소년도서관 다국어 동화 콘텐츠의 실질적 활용 모델 제시
- NIA 수어 데이터셋의 서비스 적용 가능성 실증

---

## 라이선스

이 프로젝트는 교육 목적으로 개발되었습니다.
