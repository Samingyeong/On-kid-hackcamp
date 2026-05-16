/**
 * FLOWAI API 모듈 - 나만의 동화 만들기
 * 현재 Mock 모드로 동작
 */

export interface ScenarioChoice {
  id: string
  label: string
  emoji?: string
}

export interface ScenarioStep {
  id: string
  question: string
  choices: ScenarioChoice[]
  correctId?: string
  feedback?: { correct: string; wrong: string }
}

export interface ScenarioSession {
  sessionId: string
  title: string
  steps: ScenarioStep[]
  totalSteps: number
}

export interface ScenarioResult {
  sessionId: string
  stepId: string
  choiceId: string
  isCorrect: boolean
  feedbackMessage: string
  nextStepId: string | null
  encouragement: string
}

// Mock 데이터
const MOCK_SCENARIOS: ScenarioSession[] = [
  {
    sessionId: 'mock-001',
    title: '학교에서 생긴 일',
    totalSteps: 3,
    steps: [
      {
        id: 'step-1',
        question: '친구가 넘어졌어요. 어떻게 할까요?',
        choices: [
          { id: 'a', label: '도와줘요', emoji: '🤝' },
          { id: 'b', label: '그냥 지나가요', emoji: '🚶' },
          { id: 'c', label: '선생님께 알려요', emoji: '📢' },
        ],
        correctId: 'a',
        feedback: { correct: '잘했어요! 친구를 도와주는 건 정말 멋진 일이에요.', wrong: '친구가 다쳤을 때는 도와주거나 선생님께 알려야 해요.' },
      },
      {
        id: 'step-2',
        question: '급식 시간에 줄을 서야 해요. 어떻게 할까요?',
        choices: [
          { id: 'a', label: '새치기해요', emoji: '😤' },
          { id: 'b', label: '차례를 기다려요', emoji: '😊' },
          { id: 'c', label: '밥을 안 먹어요', emoji: '😶' },
        ],
        correctId: 'b',
        feedback: { correct: '맞아요! 차례를 지키면 모두가 행복해요.', wrong: '줄을 설 때는 차례를 기다리는 게 중요해요.' },
      },
      {
        id: 'step-3',
        question: '수업 시간에 모르는 게 생겼어요. 어떻게 할까요?',
        choices: [
          { id: 'a', label: '손을 들어요', emoji: '✋' },
          { id: 'b', label: '그냥 넘어가요', emoji: '😴' },
          { id: 'c', label: '친구에게 물어봐요', emoji: '🗣️' },
        ],
        correctId: 'a',
        feedback: { correct: '훌륭해요! 모르면 손을 들고 물어보는 게 최고예요.', wrong: '모를 때는 손을 들어 선생님께 물어보세요.' },
      },
    ],
  },
  {
    sessionId: 'mock-002',
    title: '마트에서 생긴 일',
    totalSteps: 3,
    steps: [
      {
        id: 'step-1',
        question: '마트에서 갖고 싶은 과자가 있어요. 어떻게 할까요?',
        choices: [
          { id: 'a', label: '몰래 가져가요', emoji: '😰' },
          { id: 'b', label: '부모님께 말해요', emoji: '🙋' },
          { id: 'c', label: '울어요', emoji: '😭' },
        ],
        correctId: 'b',
        feedback: { correct: '잘했어요! 갖고 싶은 게 있으면 부모님께 말하는 게 맞아요.', wrong: '물건은 돈을 내고 사야 해요. 부모님께 말해보세요.' },
      },
      {
        id: 'step-2',
        question: '마트에서 길을 잃었어요. 어떻게 할까요?',
        choices: [
          { id: 'a', label: '그 자리에 서 있어요', emoji: '🧍' },
          { id: 'b', label: '직원에게 도움 요청해요', emoji: '🙏' },
          { id: 'c', label: '혼자 찾아다녀요', emoji: '🔍' },
        ],
        correctId: 'b',
        feedback: { correct: '맞아요! 어른에게 도움을 요청하는 게 가장 안전해요.', wrong: '길을 잃으면 직원이나 어른에게 도움을 요청하세요.' },
      },
      {
        id: 'step-3',
        question: '계산대에서 거스름돈을 더 받았어요. 어떻게 할까요?',
        choices: [
          { id: 'a', label: '그냥 가져가요', emoji: '💰' },
          { id: 'b', label: '직원에게 돌려줘요', emoji: '🤲' },
          { id: 'c', label: '모른 척해요', emoji: '🙈' },
        ],
        correctId: 'b',
        feedback: { correct: '정직하게 돌려줬군요! 정말 훌륭해요.', wrong: '남의 돈은 돌려줘야 해요. 정직한 행동이 중요해요.' },
      },
    ],
  },
]

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function fetchScenarios(): Promise<ScenarioSession[]> {
  await delay(400)
  return MOCK_SCENARIOS
}

export async function startScenarioSession(scenarioId: string): Promise<ScenarioSession> {
  await delay(300)
  const found = MOCK_SCENARIOS.find(s => s.sessionId === scenarioId)
  if (!found) throw new Error('시나리오를 찾을 수 없어요')
  return { ...found }
}

export async function submitScenarioAnswer(sessionId: string, stepId: string, choiceId: string): Promise<ScenarioResult> {
  await delay(500)
  const session = MOCK_SCENARIOS.find(s => s.sessionId === sessionId)
  if (!session) throw new Error('세션을 찾을 수 없어요')
  const stepIdx = session.steps.findIndex(s => s.id === stepId)
  const step = session.steps[stepIdx]
  if (!step) throw new Error('단계를 찾을 수 없어요')

  const isCorrect = step.correctId ? step.correctId === choiceId : true
  const feedbackMessage = step.feedback
    ? (isCorrect ? step.feedback.correct : step.feedback.wrong)
    : '잘 선택했어요!'
  const nextStep = session.steps[stepIdx + 1]

  return {
    sessionId,
    stepId,
    choiceId,
    isCorrect,
    feedbackMessage,
    nextStepId: nextStep?.id ?? null,
    encouragement: isCorrect ? '정말 잘하고 있어요!' : '괜찮아요, 다시 해봐요!',
  }
}
