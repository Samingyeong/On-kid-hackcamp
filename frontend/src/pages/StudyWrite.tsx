import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { fetchStudyWords, checkWriting, updateWordKnown, type StudyWord } from '../api/library'
import './StudyWrite.css'

const STAGE_MESSAGES = [
  '한번 따라써보아요!',
  '와! 이번엔 없이 써볼까요?',
  '마지막으로 한번더 써볼까요?',
]

export default function StudyWrite() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const book = params.get('book') || ''

  const [words, setWords] = useState<StudyWord[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [stage, setStage] = useState(1) // 1, 2, 3
  const [hintActive, setHintActive] = useState(false)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{ correct: boolean; recognized: string } | null>(null)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const drawingRef = useRef(false)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)

  // "몰라요" 체크한 단어만 가져오기 (해당 책 기준)
  useEffect(() => {
    fetchStudyWords(0)
      .then(list => {
        const filtered = book ? list.filter(w => w.from_book === book) : list
        setWords(filtered.length > 0 ? filtered : [])
      })
      .catch(() => setWords([]))
  }, [book])

  const currentWord = words[currentIdx]?.base_form || ''
  const chars = currentWord.split('')
  const learnedCount = words.filter(w => w.known === 1).length

  function clearAllCanvas() {
    canvasRefs.current.forEach(canvas => {
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    })
    setResult(null)
  }

  // 채점: 모든 캔버스를 합쳐서 하나의 이미지로 만들고 API 호출
  async function handleCheck() {
    setChecking(true)
    setResult(null)
    try {
      const cellSize = 120
      const totalWidth = chars.length * cellSize
      const exportCanvas = document.createElement('canvas')
      exportCanvas.width = totalWidth
      exportCanvas.height = cellSize
      const ctx = exportCanvas.getContext('2d')!
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, totalWidth, cellSize)
      canvasRefs.current.forEach((canvas, i) => {
        if (canvas) ctx.drawImage(canvas, i * cellSize, 0)
      })
      const base64 = exportCanvas.toDataURL('image/png').split(',')[1]
      const res = await checkWriting(base64, currentWord)
      setResult({ correct: res.correct, recognized: res.recognized })

      // 정답이면 자동으로 다음 단계 또는 다음 단어
      if (res.correct) {
        setTimeout(() => {
          if (stage < 3) {
            setStage(s => s + 1)
            clearAllCanvas()
          } else {
            // 3단계 완료 → known=1로 업데이트
            const w = words[currentIdx]
            if (w) updateWordKnown(w.id, 1)
            setWords(prev => prev.map((item, i) => i === currentIdx ? { ...item, known: 1 } : item))
            if (currentIdx < words.length - 1) {
              setCurrentIdx(i => i + 1)
              setStage(1)
              clearAllCanvas()
            }
          }
        }, 1200)
      }
    } catch {
      setResult({ correct: false, recognized: '채점 실패' })
    } finally {
      setChecking(false)
    }
  }

  function goNext() {
    if (currentIdx < words.length - 1) {
      setCurrentIdx(i => i + 1)
      setStage(1) // 새 단어는 1단계부터
      clearAllCanvas()
    }
  }
  function goPrev() {
    if (currentIdx > 0) {
      setCurrentIdx(i => i - 1)
      setStage(1) // 새 단어는 1단계부터
      clearAllCanvas()
    }
  }

  // 캔버스 드로잉
  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = true
    lastPosRef.current = getPos(e)
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastPosRef.current) return
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.stroke()
    lastPosRef.current = pos
  }
  function onPointerUp() {
    drawingRef.current = false
    lastPosRef.current = null
  }

  if (words.length === 0) {
    return (
      <div className="study-write">
        <div className="sw-main" style={{ flex: 1, borderRadius: 0 }}>
          <p style={{ fontSize: 20, color: '#888', textAlign: 'center' }}>
            아직 모르는 단어가 없어요!<br />동화를 읽으면서 "몰라요" 버튼을 눌러보세요.
          </p>
          <button className="sw-next-stage-btn" onClick={() => navigate(-1)}>← 돌아가기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="study-write">
      {/* 왼쪽: 원숭이 + 말풍선 (임시 박스) */}
      <div className="sw-left">
        <div className="sw-speech-bubble">
          {STAGE_MESSAGES[stage - 1]}
        </div>
        <div className="sw-monkey-placeholder">
          🐵
        </div>
      </div>

      {/* 오른쪽: 학습 영역 */}
      <div className="sw-main">
        {/* 단계 표시 */}
        <div className="sw-stages">
          {[1, 2, 3].map(s => (
            <div key={s} className={`sw-stage-dot ${s === stage ? 'active' : ''} ${s < stage ? 'done' : ''}`}>
              {s}
            </div>
          ))}
        </div>

        {/* 단어 표시 */}
        <div className="sw-word">{currentWord}</div>

        {/* 쓰기 영역 */}
        <div className="sw-canvas-row">
          <button className="sw-nav-btn" onClick={goPrev} disabled={currentIdx === 0}>‹</button>
          <div className="sw-cells">
            {chars.map((char, i) => (
              <div key={i} className="sw-cell">
                {/* 1단계: 회색 글자 가이드 */}
                {stage === 1 && <span className="sw-guide-char">{char}</span>}
                {/* 3단계: 힌트 누르고 있을 때만 표시 */}
                {stage === 3 && hintActive && <span className="sw-guide-char">{char}</span>}
                {/* 캔버스 */}
                <canvas
                  ref={el => { canvasRefs.current[i] = el }}
                  width={120}
                  height={120}
                  className="sw-canvas"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                />
              </div>
            ))}
          </div>
          <button className="sw-nav-btn" onClick={goNext} disabled={currentIdx === words.length - 1}>›</button>
        </div>

        {/* 3단계: 힌트 버튼 */}
        {stage === 3 && (
          <div className="sw-hint-wrap">
            <button
              className="sw-hint-btn"
              onPointerDown={() => setHintActive(true)}
              onPointerUp={() => setHintActive(false)}
              onPointerLeave={() => setHintActive(false)}
            >
              ?
            </button>
            <span className="sw-hint-label">힌트</span>
          </div>
        )}

        {/* 채점 + 다시쓰기 버튼 */}
        <div className="sw-check-row">
          <button className="sw-clear-btn" onClick={clearAllCanvas}>🔄 다시 쓰기</button>
          <button className="sw-check-btn" onClick={handleCheck} disabled={checking}>
            {checking ? '채점 중...' : '✅ 채점하기'}
          </button>
          {result && (
            <span className={`sw-result ${result.correct ? 'correct' : 'wrong'}`}>
              {result.correct ? '🎉 정답!' : `아쉬워요! (인식: ${result.recognized})`}
            </span>
          )}
        </div>

        {/* 진행도 + 단어 상태 */}
        <div className="sw-footer">
          <div className="sw-word-dots">
            {words.map((w, i) => (
              <span
                key={i}
                className={`sw-dot ${w.known === 1 ? 'done' : ''} ${i === currentIdx ? 'current' : ''}`}
                onClick={() => { setCurrentIdx(i); setStage(1); clearAllCanvas() }}
              />
            ))}
          </div>
          <span className="sw-progress">{learnedCount}/{words.length} 완료</span>
          {currentIdx === words.length - 1 && stage === 3 && result?.correct && (
            <button className="sw-next-stage-btn" onClick={() => navigate(-1)}>
              🎉 학습 완료!
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
