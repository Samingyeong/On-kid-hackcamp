/**
 * useBrailleChording.ts
 * ?レ옄?⑤뱶 ?숈떆 ?낅젰(Key Chording) 媛먯? 而ㅼ뒪? ?? *
 * 留ㅽ븨: 7?믪젏1, 4?믪젏2, 1?믪젏3, 8?믪젏4, 5?믪젏5, 2?믪젏6
 * ?뱀닔?? 0?믪뒪?섏씠?? Enter(numpad)?믪쟾泥댁씫湲? .(Decimal)?믪??곌린
 */

import { useEffect, useRef, useCallback } from 'react'
import type { Dots } from '../utils/brailleConverter'

// ?レ옄?⑤뱶 ?ㅼ퐫???????몃뜳??(0-based)
const KEY_TO_DOT: Record<string, number> = {
  Numpad7: 0, // ??
  Numpad4: 1, // ??
  Numpad1: 2, // ??
  Numpad8: 3, // ??
  Numpad5: 4, // ??
  Numpad2: 5, // ??
}

export type SpecialKey = 'space' | 'readAll' | 'delete'

export interface ChordingCallbacks {
  onChord: (dots: Dots) => void          // ?먯옄 議고빀 ?꾩꽦 ??  onSpecial: (key: SpecialKey) => void   // ?뱀닔???낅젰 ??  onDotsChange: (dots: Dots) => void     // ?ㅼ떆媛????곹깭 蹂????(UI ?낅뜲?댄듃??
}

const DEBOUNCE_MS = 50 // 留덉?留?keyup ???湲??쒓컙

export function useBrailleChording(callbacks: ChordingCallbacks) {
  const pressedDotsRef = useRef<boolean[]>([false, false, false, false, false, false])
  const activeKeysRef = useRef<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chordStartedRef = useRef(false) // ?먯옄 ?ㅺ? ?섎굹?쇰룄 ?뚮졇?붿?

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
    // ?곹깭 珥덇린??    pressedDotsRef.current = [false, false, false, false, false, false]
    chordStartedRef.current = false
    callbacksRef.current.onDotsChange([false, false, false, false, false, false])
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 諛섎났 ?낅젰 臾댁떆
      if (e.repeat) return

      const code = e.code

      // ?먯옄 ??泥섎━
      if (code in KEY_TO_DOT) {
        e.preventDefault()
        const dotIdx = KEY_TO_DOT[code]!
        if (!activeKeysRef.current.has(code)) {
          activeKeysRef.current.add(code)
          pressedDotsRef.current[dotIdx] = true
          chordStartedRef.current = true
          // 吏꾪뻾 以묒씤 ??대㉧ 痍⑥냼
          if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
          }
          // ?ㅼ떆媛?UI ?낅뜲?댄듃
          callbacksRef.current.onDotsChange(
            pressedDotsRef.current.slice() as Dots
          )
        }
        return
      }

      // ?뱀닔??泥섎━
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

      // 紐⑤뱺 ?먯옄 ?ㅺ? ?⑥뼱議뚯쓣 ???붾컮?댁뒪 ??대㉧ ?쒖옉
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
