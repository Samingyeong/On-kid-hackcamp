/**
 * ScenarioModule.tsx - 나만의 동화: 아기돼지 3형제 인터랙티브
 * TTS + 선택지 분기 + 장면 전환
 */
import { useState, useCallback, useEffect } from 'react'
import styles from './ScenarioModule.module.css'

type Phase = 'START' | 'CHAR_SELECT' | 'SCENARIO_SELECT' | 'SCENE_4' | 'SCENE_5A' | 'SCENE_6A' | 'SCENE_5B' | 'SCENE_6B' | 'ENDING'

const CHARACTERS = [
  { id: 'elephant', label: '코끼리', emoji: '🐘' },
  { id: 'monkey', label: '원숭이', emoji: '🐵' },
  { id: 'rabbit', label: '토끼', emoji: '🐰' },
  { id: 'dog', label: '강아지', emoji: '🐶' },
]

const IMAGES: Record<Phase, string> = {
  START: '/flowai/KakaoTalk_20260517_075158632.png',
  CHAR_SELECT: '/flowai/KakaoTalk_20260517_075158632_01.png',
  SCENARIO_SELECT: '/flowai/KakaoTalk_20260517_075158632_02.png',
  SCENE_4: '/flowai/KakaoTalk_20260517_075158632_03.png',
  SCENE_5A: '/flowai/KakaoTalk_20260517_075158632_04.png',
  SCENE_6A: '/flowai/KakaoTalk_20260517_075158632_05.png',
  SCENE_5B: '/flowai/KakaoTalk_20260517_075158632_06.png',
  SCENE_6B: '/flowai/KakaoTalk_20260517_075158632_07.png',
  ENDING: '/flowai/KakaoTalk_20260517_075158632_08.png',
}

function speak(text: string, onEnd?: () => void) {
  if (!('speechSynthesis' in window)) { onEnd?.(); return }
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ko-KR'; u.rate = 0.88; u.pitch = 1.1
  u.onend = () => onEnd?.()
  u.onerror = () => onEnd?.()
  window.speechSynthesis.speak(u)
}

export default function ScenarioModule() {
  const [phase, setPhase] = useState<Phase>('START')
  const [character, setCharacter] = useState('')
  const [scenario, setScenario] = useState<'DESTRUCTION' | 'COOPERATION' | ''>('')
  const [narrating, setNarrating] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [caption, setCaption] = useState('')

  const charName = CHARACTERS.find(c => c.id === character)?.label || '동물'

  const narrate = useCallback((text: string, nextPhase?: Phase) => {
    setNarrating(true)
    setShowNext(false)
    setCaption(text)
    speak(text, () => {
      setNarrating(false)
      if (nextPhase) setPhase(nextPhase)
      else setShowNext(true)
    })
  }, [])

  // 시작 버튼
  function handleStart() {
    narrate(
      '옛날 옛적에, 귀여운 아기돼지 삼형제가 살고 있었어요. 삼형제는 무서운 늑대를 피해 숲속에 각자 집을 짓기로 했답니다.',
      'CHAR_SELECT'
    )
  }

  // 캐릭터 선택
  function handleCharSelect(id: string) {
    setCharacter(id)
    const name = CHARACTERS.find(c => c.id === id)?.label || '동물'
    narrate(
      `우와, 귀여운 ${name} 삼형제의 이야기군요! 그럼 이번엔 어떤 이야기가 펼쳐질지 골라볼까요?`,
      'SCENARIO_SELECT'
    )
  }

  // 시나리오 선택
  function handleScenarioSelect(mode: 'DESTRUCTION' | 'COOPERATION') {
    setScenario(mode)
    narrate(
      `숲속으로 간 ${charName} 삼형제는 각자 집을 짓기 시작했어요. 첫째와 둘째는 짚과 나무로 뚝딱뚝딱 집을 지었지만, 의젓한 셋째는 설계도를 꼼꼼히 보며 아주 단단한 벽돌집을 지었답니다.`,
      'SCENE_4'
    )
  }

  // 다음 장면
  function handleNext() {
    setShowNext(false)
    if (phase === 'SCENE_4') {
      if (scenario === 'DESTRUCTION') {
        narrate(
          `그때, 배고픈 늑대 아저씨가 나타났어요! 늑대가 숨을 크게 모아 후~ 하고 불자, 짚 집과 나무 집이 힘없이 날아가 버렸어요! 깜짝 놀란 ${charName} 형제들은 셋째의 벽돌집으로 도망쳤답니다.`,
          'SCENE_5A'
        )
      } else {
        narrate(
          `늑대 아저씨도 ${charName} 삼형제처럼 멋진 벽돌집이 갖고 싶었나 봐요! 하지만 복잡한 설명서를 봐도 어떻게 짓는지 도무지 알 수 없어 눈물이 찔끔 났어요.`,
          'SCENE_5B'
        )
      }
    } else if (phase === 'SCENE_5A') {
      narrate(
        `늑대 아저씨는 벽돌집 앞에서도 온 힘을 다해 바람을 불었어요. 하지만 셋째의 벽돌집은 꿈쩍도 하지 않았지요. 결국 지쳐버린 늑대 아저씨는 숲속으로 도망치고 말았답니다. ${charName} 삼형제의 승리예요!`,
        'SCENE_6A'
      )
    } else if (phase === 'SCENE_5B') {
      narrate(
        `${charName} 형제들의 다정한 가르침 덕분에, 늑대 아저씨도 마침내 집 짓는 방법을 이해하게 되었어요. 이제 늑대 아저씨는 ${charName} 삼형제와 함께 세상에서 가장 아름다운 벽돌집을 짓는 최고의 친구가 되었답니다.`,
        'SCENE_6B'
      )
    } else if (phase === 'SCENE_6A' || phase === 'SCENE_6B') {
      narrate('동화가 끝났어요! 정말 재미있었지? 다음에 또 만나자!', 'ENDING')
    }
  }

  // 리마인드 타이머 (7초 무응답 시)
  useEffect(() => {
    if (phase !== 'CHAR_SELECT' && phase !== 'SCENARIO_SELECT') return
    const timer = setTimeout(() => {
      if (phase === 'CHAR_SELECT') speak('화면에서 마음에 드는 주인공을 골라보세요!')
      if (phase === 'SCENARIO_SELECT') speak('늑대 아저씨와 대결? 아니면 도와주기?')
    }, 7000)
    return () => clearTimeout(timer)
  }, [phase])

  // 키보드 Enter로 다음
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && showNext) handleNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showNext, phase, scenario, charName])

  return (
    <div className={styles.container}>
      <div className={styles.scene}>
        <img src={IMAGES[phase]} alt="장면" className={styles.sceneImg} />
        {caption && narrating && (
          <div className={styles.caption}>{caption}</div>
        )}
      </div>

      <div className={styles.controls}>
        {phase === 'START' && (
          <button className={styles.startBtn} onClick={handleStart} disabled={narrating}>
            🎬 동화 시작하기
          </button>
        )}

        {phase === 'CHAR_SELECT' && !narrating && (
          <div className={styles.choices}>
            <p className={styles.prompt}>오늘의 주인공을 골라보세요!</p>
            <div className={styles.choiceGrid}>
              {CHARACTERS.map(c => (
                <button key={c.id} className={styles.charBtn} onClick={() => handleCharSelect(c.id)}>
                  <span className={styles.charEmoji}>{c.emoji}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === 'SCENARIO_SELECT' && !narrating && (
          <div className={styles.choices}>
            <p className={styles.prompt}>어떤 이야기를 볼까요?</p>
            <div className={styles.scenarioGrid}>
              <button className={styles.scenarioBtn} onClick={() => handleScenarioSelect('DESTRUCTION')}>
                <span className={styles.scenarioEmoji}>💨</span>
                <span>늑대와 대결!</span>
              </button>
              <button className={styles.scenarioBtn} onClick={() => handleScenarioSelect('COOPERATION')}>
                <span className={styles.scenarioEmoji}>🤝</span>
                <span>늑대를 도와주기</span>
              </button>
            </div>
          </div>
        )}

        {showNext && (
          <button className={styles.nextBtn} onClick={handleNext}>
            다음 장면 →
          </button>
        )}

        {phase === 'ENDING' && !narrating && (
          <button className={styles.startBtn} onClick={() => { setPhase('START'); setCharacter(''); setScenario('') }}>
            🔄 다시 하기
          </button>
        )}

        {narrating && <p className={styles.narrating}>📖 이야기를 들려주고 있어요...</p>}
      </div>
    </div>
  )
}
