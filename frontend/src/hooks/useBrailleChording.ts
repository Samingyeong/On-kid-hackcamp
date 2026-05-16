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
  onChord: (dots: Dots) => void
  onSpecial: (key: SpecialKey) => void
  onDotsChange: (dots: Dots) => void
}

const DEBOUNCE_MS = 50

export function useBrailleChording(callbacks: ChordingCallbacks) {
  const pressedDotsRef = useRef<boolean[]>([false, false, false, false, false, false])
  const activeKeysRef = useRef<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chordStartedRef = useRef(false)

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
    pressedDotsRef.current = [false, false, false, false, false, false]
    chordStartedRef.current = false
    callbacksRef.current.onDotsChange([false, false, false, false, false, false])
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const code = e.code

      if (code in KEY_TO_DOT) {
        e.preventDefault()
        const dotIdx = KEY_TO_DOT[code]!
        if (!activeKeysRef.current.has(code)) {
          activeKeysRef.current.add(code)
          pressedDotsRef.current[dotIdx] = true
          chordStartedRef.current = true
          if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
          }
          callbacksRef.current.onDotsChange(pressedDotsRef.current.slice() as Dots)
        }
        return
      }

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
