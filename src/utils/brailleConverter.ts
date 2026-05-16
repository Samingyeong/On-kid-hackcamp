/**
 * brailleConverter.ts
 * 점자 6점 조합 → 한글 자모 변환 및 음절 조합 유틸리티
 *
 * 점 번호 배열: [dot1, dot2, dot3, dot4, dot5, dot6]  (index 0~5)
 * 숫자패드 매핑: 7→점1, 4→점2, 1→점3, 8→점4, 5→점5, 2→점6
 */

export type Dots = [boolean, boolean, boolean, boolean, boolean, boolean]

/** 점 배열을 비트마스크 문자열로 변환 (예: "100100") */
function dotsToKey(dots: Dots): string {
  return dots.map((d) => (d ? '1' : '0')).join('')
}

// ────────────────────────────────────────────────
// 초성 점자 매핑 (한국 점자 표준 규정 - Wikipedia Korean Braille 기준)
//
// 배열 인덱스: [dot1, dot2, dot3, dot4, dot5, dot6]
//              [idx0, idx1, idx2, idx3, idx4, idx5]
// 숫자패드:     7=idx0(점1)  4=idx1(점2)  1=idx2(점3)
//               8=idx3(점4)  5=idx4(점5)  2=idx5(점6)
// ────────────────────────────────────────────────
const CHOSUNG_MAP: Record<string, string> = {
  '000100': 'ㄱ',  // dots-4      키: 8
  '100100': 'ㄴ',  // dots-14     키: 7+8
  '010100': 'ㄷ',  // dots-24     키: 4+8
  '000010': 'ㄹ',  // dots-5      키: 5
  '100010': 'ㅁ',  // dots-15     키: 7+5
  '000110': 'ㅂ',  // dots-45     키: 8+5
  '000001': 'ㅅ',  // dots-6      키: 2
  '000101': 'ㅈ',  // dots-46     키: 8+2
  '000011': 'ㅊ',  // dots-56     키: 5+2
  '110100': 'ㅋ',  // dots-124    키: 7+4+8
  '110010': 'ㅌ',  // dots-125    키: 7+4+5
  '100110': 'ㅍ',  // dots-145    키: 7+8+5
  '010110': 'ㅎ',  // dots-245    키: 4+8+5
}

// ────────────────────────────────────────────────
// 중성 점자 매핑 (한국 점자 표준 규정 - Wikipedia Korean Braille 기준)
// ────────────────────────────────────────────────
const JUNGSUNG_MAP: Record<string, string> = {
  '110001': 'ㅏ',  // dots-126    키: 7+4+2
  '001110': 'ㅑ',  // dots-345    키: 1+8+5
  '011100': 'ㅓ',  // dots-234    키: 4+1+8
  '100011': 'ㅕ',  // dots-156    키: 7+5+2
  '101001': 'ㅗ',  // dots-136    키: 7+1+2
  '001101': 'ㅛ',  // dots-346    키: 1+8+2
  '101100': 'ㅜ',  // dots-134    키: 7+1+8
  '100101': 'ㅠ',  // dots-146    키: 7+8+2
  '010101': 'ㅡ',  // dots-246    키: 4+8+2
  '101010': 'ㅣ',  // dots-135    키: 7+1+5
  '101110': 'ㅔ',  // dots-1345   키: 7+1+8+5
  '111010': 'ㅐ',  // dots-1235   키: 7+4+1+5
  '001100': 'ㅖ',  // dots-34     키: 1+8
  '111001': 'ㅘ',  // dots-1236   키: 7+4+1+2
  '111100': 'ㅝ',  // dots-1234   키: 7+4+1+8
  '101111': 'ㅚ',  // dots-13456  키: 7+1+8+5+2
  '010111': 'ㅢ',  // dots-2456   키: 4+8+5+2
}

// ────────────────────────────────────────────────
// 종성 점자 매핑 (받침, 한국 점자 표준 규정 - Wikipedia Korean Braille 기준)
// ────────────────────────────────────────────────
const JONGSUNG_MAP: Record<string, string> = {
  '100000': 'ㄱ',  // dots-1      키: 7
  '010010': 'ㄴ',  // dots-25     키: 4+5
  '001010': 'ㄷ',  // dots-35     키: 1+5
  '010000': 'ㄹ',  // dots-2      키: 4
  '010001': 'ㅁ',  // dots-26     키: 4+2
  '110000': 'ㅂ',  // dots-12     키: 7+4
  '001000': 'ㅅ',  // dots-3      키: 1
  '101000': 'ㅈ',  // dots-13     키: 7+1
  '011000': 'ㅊ',  // dots-23     키: 4+1
  '011010': 'ㅋ',  // dots-235    키: 4+1+5
  '011001': 'ㅌ',  // dots-236    키: 4+1+2
  '010011': 'ㅍ',  // dots-256    키: 4+5+2
  '001011': 'ㅎ',  // dots-356    키: 1+5+2
  '011011': 'ㅇ',  // dots-2356   키: 4+1+5+2
}

// ────────────────────────────────────────────────
// 겹받침 조합 테이블
// key: "첫받침+둘째받침" → 겹받침
// ────────────────────────────────────────────────
const DOUBLE_JONGSUNG: Record<string, string> = {
  'ㄱ+ㅅ': 'ㄳ',
  'ㄴ+ㅈ': 'ㄵ',
  'ㄴ+ㅎ': 'ㄶ',
  'ㄹ+ㄱ': 'ㄺ',
  'ㄹ+ㅁ': 'ㄻ',
  'ㄹ+ㅂ': 'ㄼ',
  'ㄹ+ㅅ': 'ㄽ',
  'ㄹ+ㅌ': 'ㄾ',
  'ㄹ+ㅍ': 'ㄿ',
  'ㄹ+ㅎ': 'ㅀ',
  'ㅂ+ㅅ': 'ㅄ',
}

// 겹받침 → 첫 번째 자음 (중성이 뒤따를 때 분리용)
const DOUBLE_JONGSUNG_FIRST: Record<string, string> = {
  'ㄳ': 'ㄱ',
  'ㄵ': 'ㄴ',
  'ㄶ': 'ㄴ',
  'ㄺ': 'ㄹ',
  'ㄻ': 'ㄹ',
  'ㄼ': 'ㄹ',
  'ㄽ': 'ㄹ',
  'ㄾ': 'ㄹ',
  'ㄿ': 'ㄹ',
  'ㅀ': 'ㄹ',
  'ㅄ': 'ㅂ',
}

// ────────────────────────────────────────────────
// 쌍자음 조합 테이블 (초성 ㅅ 접두 방식)
// 한국 점자 표준: ㅅ(점6) + 기본자음 → 쌍자음
// ────────────────────────────────────────────────
const SSANG_MAP: Record<string, string> = {
  'ㅅ+ㄱ': 'ㄲ',
  'ㅅ+ㄷ': 'ㄸ',
  'ㅅ+ㅂ': 'ㅃ',
  'ㅅ+ㅅ': 'ㅆ',
  'ㅅ+ㅈ': 'ㅉ',
}

// ────────────────────────────────────────────────
// 한글 유니코드 조합 상수
// ────────────────────────────────────────────────
const CHOSUNG_LIST = [
  'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ',
  'ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
]
const JUNGSUNG_LIST = [
  'ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ',
  'ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ',
]
const JONGSUNG_LIST = [
  '','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ',
  'ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
]

/** 초성+중성+종성 인덱스로 완성형 한글 음절 생성 */
export function combineHangul(cho: string, jung: string, jong: string = ''): string {
  const choIdx = CHOSUNG_LIST.indexOf(cho)
  const jungIdx = JUNGSUNG_LIST.indexOf(jung)
  const jongIdx = JONGSUNG_LIST.indexOf(jong)
  if (choIdx < 0 || jungIdx < 0 || jongIdx < 0) return cho + jung + jong
  return String.fromCharCode(0xAC00 + choIdx * 21 * 28 + jungIdx * 28 + jongIdx)
}

/** 완성형 음절을 초성/중성/종성으로 분해 */
export function decomposeHangul(char: string): { cho: string; jung: string; jong: string } | null {
  const code = char.charCodeAt(0) - 0xAC00
  if (code < 0 || code > 11171) return null
  const jong = JONGSUNG_LIST[code % 28]!
  const jung = JUNGSUNG_LIST[Math.floor((code % (28 * 21)) / 28)]!
  const cho = CHOSUNG_LIST[Math.floor(code / (28 * 21))]!
  return { cho, jung, jong }
}

// ────────────────────────────────────────────────
// 점자 → 자모 변환 (문맥 기반)
// ────────────────────────────────────────────────
export type JamoType = 'chosung' | 'jungsung' | 'jongsung'

export function dotsToJamo(dots: Dots, context: JamoType): string | null {
  const key = dotsToKey(dots)
  if (context === 'jungsung') return JUNGSUNG_MAP[key] ?? null
  if (context === 'jongsung') return JONGSUNG_MAP[key] ?? CHOSUNG_MAP[key] ?? null
  return CHOSUNG_MAP[key] ?? null
}

/** 점 배열이 모두 false인지 확인 */
export function isEmptyDots(dots: Dots): boolean {
  return dots.every((d) => !d)
}

// ────────────────────────────────────────────────
// 한글 조합 상태 머신
// jong  : 첫 번째 받침 (단일 or 겹받침 완성형)
// jong2 : 겹받침 대기 중인 두 번째 자음 후보
//         → 다음 입력이 중성이면 jong2가 다음 음절 초성으로 이동
//         → 다음 입력이 자음이면 현재 음절 확정 후 jong2가 새 초성
// ────────────────────────────────────────────────
export interface HangulState {
  cho: string    // 현재 초성
  jung: string   // 현재 중성
  jong: string   // 현재 종성 (단일 or 겹받침)
  jong2: string  // 겹받침 두 번째 자음 대기 (아직 확정 전)
}

export const EMPTY_STATE: HangulState = { cho: '', jung: '', jong: '', jong2: '' }

/**
 * 새 자모를 받아 현재 조합 상태를 업데이트하고
 * 확정된 음절 문자열(0개 이상)과 새 상태를 반환
 */
export function feedJamo(
  state: HangulState,
  jamo: string,
  jamoType: JamoType,
): { committed: string; newState: HangulState } {
  const { cho, jung, jong, jong2 } = state

  // ── 중성 입력 ──
  if (jamoType === 'jungsung') {
    if (!cho) {
      // 초성 없이 중성 → ㅇ 묵음 초성
      return { committed: '', newState: { cho: 'ㅇ', jung: jamo, jong: '', jong2: '' } }
    }
    if (!jung) {
      // 초성만 있음 → 중성 결합
      return { committed: '', newState: { cho, jung: jamo, jong: '', jong2: '' } }
    }
    if (jong2) {
      // 겹받침 대기 중 → jong2(두 번째 자음)가 다음 음절 초성으로 이동
      // 현재 음절은 첫 번째 자음만 받침으로 확정
      // jong은 겹받침 완성형이므로 첫 번째 자음을 역산
      const firstJong = DOUBLE_JONGSUNG_FIRST[jong] ?? jong
      const committed = combineHangul(cho, jung, firstJong)
      return { committed, newState: { cho: jong2, jung: jamo, jong: '', jong2: '' } }
    }
    if (jong) {
      // 단일 종성 있음 → 종성이 다음 음절 초성으로 이동
      const committed = combineHangul(cho, jung, '')
      return { committed, newState: { cho: jong, jung: jamo, jong: '', jong2: '' } }
    }
    // 초성+중성만 있는데 또 중성 → 현재 음절 확정, ㅇ 묵음으로 새 음절
    const committed = combineHangul(cho, jung, '')
    return { committed, newState: { cho: 'ㅇ', jung: jamo, jong: '', jong2: '' } }
  }

  // ── 자음 입력 (초성 or 종성) ──
  if (!cho) {
    return { committed: '', newState: { cho: jamo, jung: '', jong: '', jong2: '' } }
  }
  if (!jung) {
    // 초성만 있는 상태에서 자음 → 쌍자음 가능한지 먼저 확인
    const ssangKey = `${cho}+${jamo}`
    const ssang = SSANG_MAP[ssangKey]
    if (ssang) {
      // 쌍자음 성립 → 초성을 쌍자음으로 교체
      return { committed: '', newState: { cho: ssang, jung: '', jong: '', jong2: '' } }
    }
    // 쌍자음 불가 → 이전 초성 확정, 새 초성 시작
    return { committed: cho, newState: { cho: jamo, jung: '', jong: '', jong2: '' } }
  }
  if (!jong) {
    // 초성+중성 → 첫 번째 종성 후보
    return { committed: '', newState: { cho, jung, jong: jamo, jong2: '' } }
  }
  if (!jong2) {
    // 종성 하나 있음 → 겹받침 가능한지 확인
    const doubleKey = `${jong}+${jamo}`
    const doubled = DOUBLE_JONGSUNG[doubleKey]
    if (doubled) {
      // 겹받침 성립
      // jong  = 겹받침 완성형 (미리보기용: 닭 → ㄺ으로 표시)
      // jong2 = 두 번째 자음 단독 보관 (다음에 중성 오면 초성으로 분리)
      return { committed: '', newState: { cho, jung, jong: doubled, jong2: jamo } }
    }
    // 겹받침 불가 → 현재 음절 확정, 새 초성
    const committed = combineHangul(cho, jung, jong)
    return { committed, newState: { cho: jamo, jung: '', jong: '', jong2: '' } }
  }
  // jong2까지 있는 상태에서 또 자음 → 현재 음절 확정(겹받침 포함), 새 초성
  const committed = combineHangul(cho, jung, jong)
  return { committed, newState: { cho: jamo, jung: '', jong: '', jong2: '' } }
}

/** 현재 조합 중인 음절을 미리보기 문자로 반환 */
export function previewSyllable(state: HangulState): string {
  const { cho, jung, jong } = state
  if (!cho) return ''
  if (!jung) return cho
  return combineHangul(cho, jung, jong)
}

/** 조합 상태를 확정하여 문자열로 반환 */
export function commitState(state: HangulState): string {
  const { cho, jung, jong } = state
  if (!cho) return ''
  if (!jung) return cho
  return combineHangul(cho, jung, jong)
}
