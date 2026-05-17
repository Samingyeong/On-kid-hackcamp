/**
 * SmartLoading.tsx
 *
 * FLOWAI 영상 생성 대기 중 아이의 집중력을 유지하는 인터랙티브 로딩 화면.
 *
 * 기능
 * ────────────────────────────────────────────────────────────
 * 1. 선택한 동물 카드의 두근두근 서스펜스 애니메이션
 * 2. Web Speech API(TTS) — 칭찬 + 기대감 음성 자동 재생
 * 3. SVG 원형 카운트다운 타이머 (3~5초 범위)
 * 4. 음성 재생 중 파형 인디케이터 표시
 * 5. isLoading=false 시 부드러운 페이드아웃 후 언마운트
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import styles from './SmartLoading.module.css'

// ─── 타입 ─────────────────────────────────────────────────────

export interface SmartLoadingProps {
  /** true이면 로딩 화면 표시, false이면 페이드아웃 후 숨김 */
  isLoading: boolean
  /** 아이가 선택한 동물 이모지 (예: "🐰") */
  animalEmoji: string
  /** 아이가 선택한 동물 한글 이름 (예: "토끼") */
  animalName: string
  /** 아이 이름 — TTS 문장에 삽입됩니다 (예: "세윤이") */
  childName?: string
  /** 예상 로딩 시간(초) — 카운트다운 기준값, 기본 4 */
  estimatedSeconds?: number
}

// ─── 별 파티클 위치 (고정 시드 — 매 렌더마다 달라지지 않도록) ──
const STAR_POSITIONS = [
  { top: '8%',  left: '12%', size: 6,  delay: 0 },
  { top: '15%', left: '78%', size: 8,  delay: 0.6 },
  { top: '72%', left: '6%',  size: 5,  delay: 1.1 },
  { top: '80%', left: '88%', size: 7,  delay: 0.3 },
  { top: '45%', left: '92%', size: 4,  delay: 1.8 },
  { top: '55%', left: '4%',  size: 6,  delay: 0.9 },
  { top: '25%', left: '50%', size: 5,  delay: 1.4 },
  { top: '90%', left: '40%', size: 8,  delay: 0.2 },
]

// SVG 원형 타이머 반지름 → circumference
const RADIUS = 28
const CIRCUMFERENCE = 2 * Math.PI * RADIUS // ≈ 175.9

// ─── 컴포넌트 ─────────────────────────────────────────────────

export default function SmartLoading({
  isLoading,
  animalEmoji,
  animalName,
  childName = '친구',
  estimatedSeconds = 4,
}: SmartLoadingProps) {
  const [visible, setVisible]       = useState(false)   // DOM 마운트 여부
  const [fadeOut, setFadeOut]       = useState(false)   // 페이드아웃 트리거
  const [countdown, setCountdown]   = useState(estimatedSeconds)
  const [isSpeaking, setIsSpeaking] = useState(false)

  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const utterRef   = useRef<SpeechSynthesisUtterance | null>(null)

  // ── TTS 문장 조립 ────────────────────────────────────────────
  const buildSpeechText = useCallback(() => {
    const sec = estimatedSeconds
    return (
      `우와, ${childName}가 ${animalName}를 골라줬구나! ` +
      `아기 ${animalName}가 멋진 영상을 온키드 AI가 마법처럼 만들고 있어. ` +
      `눈을 동그랗게 뜨고 ${sec}초만 기다려줘!`
    )
  }, [childName, animalName, estimatedSeconds])

  // ── TTS 재생 ─────────────────────────────────────────────────
  const speak = useCallback(() => {
    if (!('speechSynthesis' in window)) return

    // 이전 발화 중단
    window.speechSynthesis.cancel()

    const utter = new SpeechSynthesisUtterance(buildSpeechText())
    utter.lang  = 'ko-KR'
    utter.rate  = 0.88   // 아이가 듣기 편한 속도
    utter.pitch = 1.15   // 밝고 친근한 톤
    utter.volume = 1

    utter.onstart = () => setIsSpeaking(true)
    utter.onend   = () => setIsSpeaking(false)
    utter.onerror = () => setIsSpeaking(false)

    utterRef.current = utter
    window.speechSynthesis.speak(utter)
  }, [buildSpeechText])

  // ── 카운트다운 타이머 ────────────────────────────────────────
  const startTimer = useCallback((seconds: number) => {
    setCountdown(seconds)
    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  // ── isLoading 변화 감지 ──────────────────────────────────────
  useEffect(() => {
    if (isLoading) {
      // 로딩 시작: 마운트 → TTS → 타이머
      setFadeOut(false)
      setVisible(true)
      setCountdown(estimatedSeconds)

      // 브라우저 음성 목록 로드 대기 후 재생 (일부 브라우저 필요)
      const trySpeak = () => {
        const voices = window.speechSynthesis?.getVoices() ?? []
        if (voices.length > 0) {
          speak()
        } else {
          window.speechSynthesis?.addEventListener('voiceschanged', speak, { once: true })
        }
      }
      trySpeak()
      startTimer(estimatedSeconds)
    } else {
      // 로딩 완료: TTS 중단 → 페이드아웃 → 언마운트
      window.speechSynthesis?.cancel()
      setIsSpeaking(false)
      if (timerRef.current) clearInterval(timerRef.current)

      setFadeOut(true)
      const t = setTimeout(() => setVisible(false), 400) // CSS 전환 시간과 맞춤
      return () => clearTimeout(t)
    }
  }, [isLoading, estimatedSeconds, speak, startTimer])

  // ── 언마운트 정리 ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  if (!visible) return null

  // SVG 원형 진행률 계산
  const elapsed  = estimatedSeconds - countdown
  const progress = Math.min(elapsed / estimatedSeconds, 1)
  const dashOffset = CIRCUMFERENCE * (1 - progress)

  return (
    <div
      className={styles.overlay}
      style={{ opacity: fadeOut ? 0 : 1, transition: 'opacity 0.4s ease' }}
      role="status"
      aria-live="polite"
      aria-label={`${animalName} 영상을 만들고 있어요`}
    >
      {/* 별 파티클 배경 */}
      <div className={styles.stars} aria-hidden="true">
        {STAR_POSITIONS.map((s, i) => (
          <div
            key={i}
            className={styles.star}
            style={{
              top:    s.top,
              left:   s.left,
              width:  s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}
      </div>

      {/* 동물 카드 서스펜스 애니메이션 */}
      <div className={styles.cardWrap}>
        <div className={styles.glowRing} aria-hidden="true" />

        {/* 반짝이 파티클 */}
        <span className={styles.sparkle} aria-hidden="true">✨</span>
        <span className={styles.sparkle} aria-hidden="true">⭐</span>
        <span className={styles.sparkle} aria-hidden="true">✨</span>

        <div className={styles.card}>
          <span className={styles.cardEmoji} role="img" aria-label={animalName}>
            {animalEmoji}
          </span>
          <span className={styles.cardLabel}>{animalName}</span>
        </div>
      </div>

      {/* 텍스트 + 음성 파형 */}
      <div className={styles.textArea}>
        <p className={styles.mainText}>
          나만의 동화책을 만드는 중이에요...
        </p>
        <p className={styles.subText}>
          {childName}가 고른 <strong>{animalName}</strong>이(가) 주인공이에요! 🎬
        </p>

        {/* 음성 재생 중 파형 인디케이터 */}
        <div
          className={isSpeaking ? styles.voiceWave : `${styles.voiceWave} ${styles.voiceWaveHidden}`}
          aria-hidden="true"
        >
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className={styles.voiceBar} />
          ))}
        </div>
      </div>

      {/* 카운트다운 타이머 */}
      <div className={styles.timerWrap}>
        <div className={styles.timerCircle}>
          <svg className={styles.timerSvg} viewBox="0 0 72 72" aria-hidden="true">
            <circle
              className={styles.timerTrack}
              cx="36" cy="36" r={RADIUS}
            />
            <circle
              className={styles.timerProgress}
              cx="36" cy="36" r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className={styles.timerNumber} aria-label={`${countdown}초 남음`}>
            {countdown}
          </div>
        </div>
        <span className={styles.timerLabel}>초 남았어요!</span>

        {/* 로딩 도트 */}
        <div className={styles.dots} aria-hidden="true">
          <div className={styles.dot} />
          <div className={styles.dot} />
          <div className={styles.dot} />
        </div>
      </div>
    </div>
  )
}
