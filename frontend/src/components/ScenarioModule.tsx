/**
 * ScenarioModule.tsx - 나만의 동화 만들기
 * 동화 선택 → 챕터별 선택지 → 제작중 화면 → 나만의 책장
 */
import { useState } from 'react'
import styles from './ScenarioModule.module.css'

type Phase = 'SELECT_STORY' | 'STEP_1' | 'STEP_2' | 'STEP_3' | 'GENERATING' | 'BOOKSHELF'

const STORIES = [
  { id: 'pig', title: '아기돼지 삼형제' },
  { id: 'duck', title: '미운오리새끼' },
  { id: 'hansel', title: '헨젤과 그레텔' },
]

const CHARACTERS = [
  { id: 'rabbit', label: '토끼', img: '/svg/토끼.png' },
  { id: 'pig', label: '돼지', img: '/svg/숭이.png' },
  { id: 'elephant', label: '코끼리', img: '/svg/코끼리.png' },
]

const STEP2_CHOICES = [
  { id: 'fight', label: '늑대와 싸우기', desc: '용감하게 맞서는 이야기' },
  { id: 'run', label: '도망가기', desc: '지혜롭게 피하는 이야기' },
]

const STEP3_CHOICES = [
  { id: 'good', label: '알고보니 착한 늑대', desc: '늑대와 친구가 되는 결말' },
  { id: 'bad', label: '늑대를 혼내주기', desc: '늑대에게 교훈을 주는 결말' },
]

// 장면별 이미지 매핑
const SCENE_IMAGES: Record<string, string> = {
  STEP_1: '/flowai/scene1.png',
  STEP_2: '/flowai/scene2.png',
  STEP_3: '/flowai/scene3.png',
  GENERATING: '/flowai/scene4.png',
}

interface MyBook {
  title: string
  character: string
  choices: string[]
  createdAt: string
}

export default function ScenarioModule() {
  const [phase, setPhase] = useState<Phase>('SELECT_STORY')
  const [selectedStory, setSelectedStory] = useState('')
  const [character, setCharacter] = useState('')
  const [choices, setChoices] = useState<string[]>([])
  const [books, setBooks] = useState<MyBook[]>([])

  function selectStory(id: string) {
    setSelectedStory(id)
    setPhase('STEP_1')
  }

  function selectCharacter(id: string) {
    setCharacter(id)
    setChoices([id])
    setPhase('STEP_2')
  }

  function selectStep2(id: string) {
    setChoices(prev => [...prev, id])
    setPhase('STEP_3')
  }

  function selectStep3(id: string) {
    setChoices(prev => [...prev, id])
    setPhase('GENERATING')
    // 3초 후 완성
    setTimeout(() => {
      const charLabel = CHARACTERS.find(c => c.id === character)?.label || '동물'
      const storyTitle = STORIES.find(s => s.id === selectedStory)?.title || '동화'
      setBooks(prev => [...prev, {
        title: `${charLabel}의 ${storyTitle}`,
        character,
        choices: [...choices, id],
        createdAt: new Date().toLocaleString('ko-KR'),
      }])
      setTimeout(() => setPhase('BOOKSHELF'), 2000)
    }, 3000)
  }

  function reset() {
    setPhase('SELECT_STORY')
    setSelectedStory('')
    setCharacter('')
    setChoices([])
  }

  // 동화 선택 화면
  if (phase === 'SELECT_STORY') {
    return (
      <div className={styles.container}>
        <h1 className={styles.mainTitle}>나만의 동화 만들기</h1>
        <p className={styles.subtitle}>어떤 동화를 만들어볼까요?</p>
        <div className={styles.storyGrid}>
          {STORIES.map(s => (
            <button key={s.id} className={styles.storyCard} onClick={() => selectStory(s.id)}>
              <span className={styles.storyTitle}>{s.title}</span>
            </button>
          ))}
        </div>
        {books.length > 0 && (
          <button className={styles.shelfBtn} onClick={() => setPhase('BOOKSHELF')}>
            나만의 책장 ({books.length}권)
          </button>
        )}
      </div>
    )
  }

  // 나만의 책장
  if (phase === 'BOOKSHELF') {
    return (
      <div className={styles.container}>
        <h1 className={styles.mainTitle}>나만의 책장</h1>
        {books.length === 0 ? (
          <p className={styles.subtitle}>아직 만든 동화가 없어요. 동화를 만들어보세요!</p>
        ) : (
          <div className={styles.bookshelf}>
            {books.map((book, i) => (
              <div key={i} className={styles.bookItem}>
                <div>
                  <strong>{book.title}</strong>
                  <p className={styles.bookDate}>{book.createdAt}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <button className={styles.backBtn} onClick={reset}>+ 새 동화 만들기</button>
      </div>
    )
  }

  // 제작중 화면
  if (phase === 'GENERATING') {
    return (
      <div className={styles.container}>
        <div className={styles.sceneWrap}>
          <img src={SCENE_IMAGES.GENERATING} alt="제작중" className={styles.sceneImg} />
          <div className={styles.generating}>
            <div className={styles.spinner} />
            <p>동화를 제작하고 있어요...</p>
            <p className={styles.genSub}>AI가 이야기를 엮고 있어요</p>
          </div>
        </div>
      </div>
    )
  }

  // 선택지 단계 (STEP_1, STEP_2, STEP_3)
  const sceneImg = SCENE_IMAGES[phase] || ''

  return (
    <div className={styles.container}>
      <div className={styles.splitLayout}>
        {/* 왼쪽: 장면 이미지 */}
        <div className={styles.leftPanel}>
          {sceneImg && <img src={sceneImg} alt="장면" className={styles.sceneImg} />}
        </div>

        {/* 오른쪽: 선택지 */}
        <div className={styles.rightPanel}>
          {phase === 'STEP_1' && (
            <>
              <h2 className={styles.stepTitle}>주인공을 골라보세요!</h2>
              <div className={styles.charGrid}>
                {CHARACTERS.map(c => (
                  <button key={c.id} className={styles.charBtn} onClick={() => selectCharacter(c.id)}>
                    <img src={c.img} alt={c.label} className={styles.charImg} />
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {phase === 'STEP_2' && (
            <>
              <h2 className={styles.stepTitle}>늑대를 만났어요! 어떻게 할까요?</h2>
              <div className={styles.choiceList}>
                {STEP2_CHOICES.map(c => (
                  <button key={c.id} className={styles.choiceCard} onClick={() => selectStep2(c.id)}>
                    <strong>{c.label}</strong>
                    <span>{c.desc}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {phase === 'STEP_3' && (
            <>
              <h2 className={styles.stepTitle}>이야기의 결말은?</h2>
              <div className={styles.choiceList}>
                {STEP3_CHOICES.map(c => (
                  <button key={c.id} className={styles.choiceCard} onClick={() => selectStep3(c.id)}>
                    <strong>{c.label}</strong>
                    <span>{c.desc}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <button className={styles.backBtn} onClick={reset}>← 처음으로</button>
        </div>
      </div>
    </div>
  )
}
