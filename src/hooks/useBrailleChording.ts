/**
 * useBrailleChording.ts
 * 숫자패드 동시 입력(Key Chording) 감지 커스텀 훅
 *
 * 매핑: 7→점1, 4→점2, 1→점3, 8→점4, 5→점5, 2→점6
 * 특수키: 0→스페이스, Enter(numpad)→전체읽기, .(Decimal)→지우기
 */

import { useEffect, useRef, useCallback } from 'react'
import type { Dots } from '../utils/brailleConverter'

// 숫자패드 키코드 → 점 인덱스 (0-based)
const KEY_TO_DOT: Record<string, number> = {
  Numpad7: 0, // 점1
  Numpad4: 1, // 점2
  Numpad1: 2, // 점3
  Numpad8: 3, // 점4
  Numpad5: 4, // 점5
  Numpad2: 5, // 점6
}

export type SpecialKey = 'space' | 'readAll' | 'delete'

export interface ChordingCallbacks {
  onChord: (dots: Dots) => void          // 점자 조합 완성 시
  onSpecial: (key: SpecialKey) => void   // 특수키 입력 시
  onDotsChange: (dots: Dots) => void     // 실시간 점 상태 변화 시 (UI 업데이트용)
}

const DEBOUNCE_MS = 50 // 마지막 keyup 후 대기 시간

export function useBrailleChording(callbacks: ChordingCallbacks) {
  const pressedDotsRef = useRef<boolean[]>([false, false, false, false, false, false])
  const activeKeysRef = useRef<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chordStartedRef = useRef(false) // 점자 키가 하나라도 눌렸는지

  const callbacksRef = useRef(callbacks)
  useEffect(() => {
    callbacksRef.current = callbacks
  })

  const fireDots = useCallback(() => {
    const dots = pressedDotsRef.current.slice() as Dots
    const hasAny = dots.some(Boolean)
    if (hasAny) {
      callbacksRef.current.onChord(dots)
    }
    // 상태 초기화
    pressedDotsRef.current = [false, false, false, false, false, false]
    chordStartedRef.current = false
    callbacksRef.current.onDotsChange([false, false, false, false, false, false])
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 반복 입력 무시
      if (e.repeat) return

      const code = e.code

      // 점자 키 처리
      if (code in KEY_TO_DOT) {
        e.preventDefault()
        const dotIdx = KEY_TO_DOT[code]!
        if (!activeKeysRef.current.has(code)) {
          activeKeysRef.current.add(code)
          pressedDotsRef.current[dotIdx] = true
          chordStartedRef.current = true
          // 진행 중인 타이머 취소
          if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
          }
          // 실시간 UI 업데이트
          callbacksRef.current.onDotsChange(
            pressedDotsRef.current.slice() as Dots
          )
        }
        return
      }

      // 특수키 처리
      if (code === 'Numpad0') {
        e.preventDefault()
        callbacksRef.current.onSpecial('space')
        return
      }
      if (code === 'NumpadEnter') {
        e.preventDefault()
        callbacksRef.current.onSpecial('readAll')
        return
      }
      if (code === 'NumpadDecimal' || code === 'NumpadDelete') {
        e.preventDefault()
        callbacksRef.current.onSpecial('delete')
        return
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code

      if (!(code in KEY_TO_DOT)) return
      e.preventDefault()

      activeKeysRef.current.delete(code)

      // 모든 점자 키가 떨어졌을 때 디바운스 타이머 시작
      if (activeKeysRef.current.size === 0 && chordStartedRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          fireDots()
        }, DEBOUNCE_MS)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [fireDots])
}
