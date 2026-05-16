export type VisionNavigationIntent =
  | 'GO_HOME'
  | 'OPEN_TUTOR'
  | 'OPEN_STUDY_MENU'
  | 'OPEN_STORY_LEARNING'
  | 'OPEN_WORD_STUDY'
  | 'OPEN_SENTENCE_STUDY'
  | 'OPEN_VOICE_STUDY'
  | 'OPEN_BOOK_LIST'
  | 'OPEN_PARENT_DASHBOARD'

export type VisionNavigationTarget = {
  intent: VisionNavigationIntent
  label: string
  route: string
  requiresConfirmation: boolean
}

export const VISION_NAVIGATION_INTENTS: VisionNavigationIntent[] = [
  'GO_HOME',
  'OPEN_TUTOR',
  'OPEN_STUDY_MENU',
  'OPEN_STORY_LEARNING',
  'OPEN_WORD_STUDY',
  'OPEN_SENTENCE_STUDY',
  'OPEN_VOICE_STUDY',
  'OPEN_BOOK_LIST',
  'OPEN_PARENT_DASHBOARD',
]

const NAVIGATION_TARGETS: Record<VisionNavigationIntent, VisionNavigationTarget> = {
  GO_HOME: {
    intent: 'GO_HOME',
    label: '홈',
    route: '/tutor?entry=home',
    requiresConfirmation: true,
  },
  OPEN_TUTOR: {
    intent: 'OPEN_TUTOR',
    label: '오늘의 학습',
    route: '/tutor?entry=level',
    requiresConfirmation: false,
  },
  OPEN_STUDY_MENU: {
    intent: 'OPEN_STUDY_MENU',
    label: '학습 메뉴',
    route: '/tutor?entry=home',
    requiresConfirmation: true,
  },
  OPEN_STORY_LEARNING: {
    intent: 'OPEN_STORY_LEARNING',
    label: '동화 내용 학습',
    route: `/study/voice?book=${encodeURIComponent('암탉과 누렁이')}&entry=vision&mode=story`,
    requiresConfirmation: false,
  },
  OPEN_WORD_STUDY: {
    intent: 'OPEN_WORD_STUDY',
    label: '단어 공부',
    route: `/study/select?type=word&entry=vision&book=${encodeURIComponent('암탉과 누렁이')}`,
    requiresConfirmation: false,
  },
  OPEN_SENTENCE_STUDY: {
    intent: 'OPEN_SENTENCE_STUDY',
    label: '문장 공부',
    route: `/study/select?type=sentence&entry=vision&book=${encodeURIComponent('암탉과 누렁이')}`,
    requiresConfirmation: false,
  },
  OPEN_VOICE_STUDY: {
    intent: 'OPEN_VOICE_STUDY',
    label: '말하기 연습',
    route: `/study/voice?book=${encodeURIComponent('암탉과 누렁이')}&entry=vision&mode=word`,
    requiresConfirmation: false,
  },
  OPEN_BOOK_LIST: {
    intent: 'OPEN_BOOK_LIST',
    label: '동화 목록',
    route: '/books',
    requiresConfirmation: false,
  },
  OPEN_PARENT_DASHBOARD: {
    intent: 'OPEN_PARENT_DASHBOARD',
    label: '학부모 화면',
    route: '/parent',
    requiresConfirmation: true,
  },
}

export function getVisionNavigationTarget(intent?: string | null) {
  if (!intent || !(intent in NAVIGATION_TARGETS)) return null
  return NAVIGATION_TARGETS[intent as VisionNavigationIntent]
}

export function looksLikeVisionNavigationRequest(text: string) {
  return /(믿음|미듬|홈|처음|밖|나가|메뉴|들어가|열어|이동|공부|학습|단어|문장|말하기|음성|책|동화|내용|목록|부모|학부모)/.test(text)
}

export function isNavigationAffirmative(text: string) {
  return /^(응|네|예|맞아|그래|좋아|이동|가줘|해줘|열어|들어가)/.test(text)
}

export function isNavigationNegative(text: string) {
  return /^(아니|아니야|취소|가지마|그만|멈춰|안돼)/.test(text)
}
