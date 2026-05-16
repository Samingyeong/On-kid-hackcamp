import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getVideoUrl, getVttUrl, proxy, lookupDict, analyzeWord, analyzeSentence, analyzeBatch, saveWord, saveReadingHistory, type DictItem } from '../api/library'
import type { Cue } from '../types'
import './Reader.css'

const LANGS = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'ch', label: '中文' },
  { code: 'th', label: 'ภาษาไทย' },
  { code: 'mo', label: 'Монгол' },
]

// ─── VTT 파싱 ────────────────────────────────────────────────
function parseVtt(text: string): Cue[] {
  const lines = text.replace(/\r/g, '').split('\n')
  const result: Cue[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].includes('-->')) {
      const [s, e] = lines[i].split('-->')
      const start = timeToSec(s.trim()), end = timeToSec(e.trim())
      const textLines: string[] = []
      i++
      while (i < lines.length && lines[i].trim()) { textLines.push(lines[i]); i++ }
      if (textLines.length) result.push({ start, end, text: textLines.join(' ') })
    }
    i++
  }
  return result
}

function timeToSec(t: string): number {
  const p = t.split(':')
  return p.length === 3 ? +p[0] * 3600 + +p[1] * 60 + parseFloat(p[2]) : +p[0] * 60 + parseFloat(p[1])
}
function secToTime(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export default function Reader() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const thumb     = params.get('thumb')     || ''
  const nlcyThumb = params.get('nlcyThumb') || thumb
  const title     = params.get('title')     || ''
  const storyUrl  = params.get('url')       || ''

  const [lang, setLang] = useState('ko')
  const [mode, setMode] = useState<'book' | 'watch'>('book')

  // 읽은 기록 자동 저장
  useEffect(() => {
    if (title) saveReadingHistory(title)
  }, [title])
  const [cues, setCues] = useState<Cue[]>([])
  const [activeCue, setActiveCue] = useState(-1)
  const [subtitleLoading, setSubtitleLoading] = useState(false)
  const [videoError, setVideoError] = useState(false)

  // 단어 패널
  const [wordPanel, setWordPanel] = useState<{
    word: string
    baseForm: string
    items: DictItem[] | null
    writeMode: 'none' | 'guided' | 'free'  // 따라쓰기 모드
  } | null>(null)

  // 사전 결과 프리캐시 (자막 로드 시 미리 분석)
  const morphCacheRef = useRef<Map<string, { form: string; tag: string }[]>>(new Map())
  const dictCacheRef  = useRef<Map<string, DictItem[]>>(new Map())

  const videoRef = useRef<HTMLVideoElement>(null)
  const guideCanvasRef = useRef<HTMLCanvasElement>(null)
  const inputCanvasRef = useRef<HTMLCanvasElement>(null)
  const activeCueRef = useRef<HTMLDivElement>(null)

  // ─── 자막 로드 ──────────────────────────────────────────────
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadSubtitles = useCallback(async (l: string) => {
    setSubtitleLoading(true)
    setCues([])
    try {
      const vttUrl = getVttUrl(nlcyThumb, l)
      if (!vttUrl) throw new Error('no url')
      const res = await fetch(vttUrl)
      if (!res.ok) throw new Error()
      const text = await res.text()
      const parsed = parseVtt(text)
      setCues(parsed)

      // 자막에서 단어 추출 → 백엔드에 저장 (학습용, 10초 후 백그라운드, 작가줄 제외)
      if (l === 'ko' && title) {
        const sentences = parsed.filter((_, i) => i !== 1).map(c => c.text)
        // 문장 즉시 저장 (가벼운 작업)
        fetch('http://localhost:4000/api/books/sentences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, sentences }),
        }).catch(() => {})
        // 단어 추출은 10초 후
        setTimeout(() => {
          fetch('http://localhost:4000/api/books/words', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, sentences }),
          }).catch(() => {})
        }, 10000)
      }

      // 형태소 분석은 5초 후 백그라운드에서 실행 (페이지 이동 시 취소됨)
      if (l === 'ko') {
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
        batchTimerRef.current = setTimeout(() => {
          const sentences = parsed.map(c => c.text)
          analyzeBatch(sentences).then(async morphMap => {
            morphCacheRef.current = new Map()
            for (const [sentence, result] of morphMap) {
              for (const kw of result.keywords || []) {
                for (const word of sentence.split(/\s+/)) {
                  const clean = word.replace(/[^가-힣a-zA-Z]/g, '')
                  if (clean && !morphCacheRef.current.has(clean)) {
                    if (sentence.includes(clean)) {
                      morphCacheRef.current.set(clean, result.keywords)
                    }
                  }
                }
              }
            }
            const allForms = new Set<string>()
            for (const result of morphMap.values()) {
              for (const kw of result.keywords || []) allForms.add(kw.form)
            }
            await Promise.allSettled([...allForms].map(async form => {
              if (!dictCacheRef.current.has(form)) {
                const items = await lookupDict(form)
                dictCacheRef.current.set(form, items)
              }
            }))
          }).catch(() => {})
        }, 15000)
      }
    } catch {
      setCues([])
    } finally {
      setSubtitleLoading(false)
    }
  }, [nlcyThumb])

  useEffect(() => {
    if (mode === 'book') loadSubtitles(lang)
    return () => { if (batchTimerRef.current) clearTimeout(batchTimerRef.current) }
  }, [lang, mode, loadSubtitles])

  // ─── 자막 싱크 ──────────────────────────────────────────────
  function handleTimeUpdate() {
    const v = videoRef.current
    if (!v || !cues.length) return
    const t = v.currentTime
    const idx = cues.findIndex(c => t >= c.start && t <= c.end)
    setActiveCue(idx)
  }

  const subtitleListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeCue >= 0 && subtitleListRef.current) {
      const container = subtitleListRef.current
      const rowHeight = container.clientHeight / 4
      // 활성 자막이 4번째 줄(맨 아래)에 오도록 스크롤
      const targetScroll = Math.max(0, (activeCue - 3) * rowHeight)
      container.scrollTop = targetScroll
    }
  }, [activeCue])

  // ─── 언어 변경 ──────────────────────────────────────────────
  function changeLang(l: string) {
    setLang(l)
    setVideoError(false)
    // video src 교체
    const v = videoRef.current
    if (v) {
      const t = v.currentTime
      v.src = getVideoUrl(nlcyThumb, l)
      v.load()
      v.currentTime = t
      v.play().catch(() => {})
    }
  }

  // ─── 단어 클릭 ──────────────────────────────────────────────
  async function openWord(word: string, sentenceContext?: string) {
    setWordPanel({ word, baseForm: word, items: null, writeMode: 'none' })
    // 공책 넘기는 효과음 (Web Audio 합성)
    try {
      const ctx = new AudioContext()
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03))
      }
      const src = ctx.createBufferSource()
      src.buffer = buf
      const gain = ctx.createGain()
      gain.gain.value = 0.15
      src.connect(gain).connect(ctx.destination)
      src.start()
    } catch {}
    drawGuide(word)

    let searchWord = word

    // 1. 사전 캐시에서 먼저 확인 (프리캐시된 경우 즉시 반환)
    if (dictCacheRef.current.has(word)) {
      return setWordPanel({ word, baseForm: word, items: dictCacheRef.current.get(word)!, writeMode: 'none' })
    }

    try {
      // 2. 형태소 분석으로 기본형 추출 (문장 컨텍스트 우선)
      if (sentenceContext) {
        const result = await analyzeSentence(sentenceContext)
        // 클릭한 단어와 가장 잘 매칭되는 키워드 찾기
        // 우선순위: 완전일치 > 원문에서 클릭단어가 키워드 기본형으로 시작 > 앞 2글자 일치
        const match =
          result.keywords.find(k => k.form === word) ||
          result.keywords.find(k =>
            word.length >= 2 && k.form.length >= 2 &&
            sentenceContext.includes(word) &&
            // 클릭 단어가 기본형을 포함하거나 기본형이 클릭 단어의 어간
            (word.startsWith(k.form.replace(/다$/, '')) && k.form.endsWith('다'))
          )
        if (match && match.form !== word) searchWord = match.form
      }
      if (searchWord === word) {
        const tokens = await analyzeWord(word)
        if (tokens.length > 0 && tokens[0].form !== word) searchWord = tokens[0].form
      }
    } catch {}

    // 3. 캐시된 사전 결과 확인
    if (dictCacheRef.current.has(searchWord)) {
      return setWordPanel({ word, baseForm: searchWord, items: dictCacheRef.current.get(searchWord)!, writeMode: 'none' })
    }

    // 4. 사전 API 호출
    const items = await lookupDict(searchWord)
    dictCacheRef.current.set(searchWord, items)
    setWordPanel({ word, baseForm: searchWord, items, writeMode: 'none' })
  }

  // ─── 따라쓰기 캔버스 ────────────────────────────────────────
  function drawGuide(word: string) {
    const ctx = guideCanvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 360, 100)
    ctx.font = 'bold 56px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ccc'
    ctx.fillText(word.length > 5 ? word.slice(0, 5) + '…' : word, 180, 50)
    clearInput()
  }

  function clearInput() {
    inputCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 360, 100)
  }

  // 드로잉
  const drawing = useRef(false)
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true
    const ctx = inputCanvasRef.current?.getContext('2d')
    if (!ctx) return
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect()
    ctx.beginPath()
    ctx.moveTo(e.clientX - r.left, e.clientY - r.top)
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = inputCanvasRef.current?.getContext('2d')
    if (!ctx) return
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect()
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top)
    ctx.strokeStyle = '#FFB256'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke()
  }
  function onPointerUp() { drawing.current = false }

  // ─── 렌더 ───────────────────────────────────────────────────
  const videoSrc = getVideoUrl(nlcyThumb, lang)
  const thumbSrc = proxy(thumb)

  return (
    <div className="reader">
      {/* 상단 바 */}
      <div className="reader-topbar">
        <button className="reader-back" onClick={() => navigate(-1)}>← 목록</button>
        <span className="reader-title">{title}</span>
        <div className="reader-lang-bar">
          {LANGS.map(l => (
            <button
              key={l.code}
              className={`reader-lang-btn ${l.code === lang ? 'active' : ''}`}
              onClick={() => changeLang(l.code)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* 모드 탭 */}
      <div className="reader-mode-tabs">
        <button className={`mode-tab ${mode === 'book' ? 'active' : ''}`} onClick={() => setMode('book')}>
          책으로 읽기
        </button>
        <button className={`mode-tab ${mode === 'watch' ? 'active' : ''}`} onClick={() => setMode('watch')}>
          영상만 보기
        </button>
      </div>

      {/* 책 모드 */}
      {mode === 'book' && (
        <div className="reader-book-mode">
          {/* 왼쪽: 영상 */}
          <div className="reader-page reader-page-left">
            {videoError ? (
              <div className="reader-video-error">
                <img src={thumbSrc} alt={title} onError={e => (e.currentTarget.style.display = 'none')} />
                <p>이 동화의 영상은 원본 서버에서 제공되지 않아요.</p>
                {storyUrl && (
                  <a href={storyUrl} target="_blank" rel="noreferrer">🔗 원본 사이트에서 보기</a>
                )}
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  key={`${thumb}-${lang}`}
                  controls
                  preload="auto"
                  src={videoSrc}
                  poster={thumbSrc}
                  className="reader-video"
                  onTimeUpdate={handleTimeUpdate}
                  onError={() => setVideoError(true)}
                  onContextMenu={e => e.preventDefault()}
                />
                {activeCue >= 0 && cues[activeCue] && (
                  <div className="reader-video-caption">{cues[activeCue].text}</div>
                )}
              </>
            )}
          </div>

          {/* 오른쪽: 자막 */}
          <div className="reader-page reader-page-right">
            <div className="reader-springs">
              <img src="/svg/spring.png" alt="" className="reader-spring" />
              <img src="/svg/spring.png" alt="" className="reader-spring" />
            </div>
            <div className="reader-page-right-inner">
            <div className="reader-subtitle-list" ref={subtitleListRef}>
              {subtitleLoading && <p className="reader-loading">자막을 불러오는 중...</p>}
              {!subtitleLoading && cues.length === 0 && (
                <p className="reader-loading">이 언어의 자막이 없어요.</p>
              )}
              {cues.map((cue, idx) => (
                <div
                  key={idx}
                  className={`reader-cue ${idx === activeCue ? 'active' : ''} ${idx === 1 || idx === 2 ? 'cue-author' : ''}`}
                  ref={idx === activeCue ? activeCueRef : null}
                >
                  <span className="reader-cue-text">
                    {idx === 1 || idx === 2
                      ? <span className="reader-author">{cue.text}</span>
                      : cue.text.split(/(\s+)/).map((w, i) =>
                          w.trim()
                            ? <span key={i} className="reader-word" onClick={() => openWord(w.trim(), cue.text)}>{w}</span>
                            : w
                        )
                    }
                  </span>
                </div>
              ))}
            </div>
            </div>
          </div>
        </div>
      )}

      {/* 영상 모드 */}
      {mode === 'watch' && (
        <div className="reader-watch-mode">
          {videoError ? (
            <div className="reader-video-error">
              <p>영상을 불러올 수 없어요.</p>
              {storyUrl && <a href={storyUrl} target="_blank" rel="noreferrer">🔗 원본 사이트에서 보기</a>}
            </div>
          ) : (
            <video
              controls
              src={videoSrc}
              poster={thumbSrc}
              className="reader-video-full"
              onError={() => setVideoError(true)}
              onContextMenu={e => e.preventDefault()}
            />
          )}
        </div>
      )}

      {/* 단어 사이드 패널 */}
      {wordPanel && (
        <div className="reader-word-panel">
          <div className="word-panel-inner">
            <button className="word-panel-close" onClick={() => setWordPanel(null)}>✕</button>

            {wordPanel.items === null ? (
              <p className="word-panel-loading">검색 중...</p>
            ) : (() => {
              const items = wordPanel.items
              const exact = items.length > 0
                ? (items.find(i => i.word === wordPanel.baseForm) || items[0])
                : null
              const firstDef = exact?.definitions[0] || ''

              return (
                <>
                  {/* 단어 + 등급 */}
                  <div className="dict-word">
                    {wordPanel.baseForm || wordPanel.word}
                    {exact?.grade && <span className={`dict-grade grade-${exact.grade}`}>{exact.grade}</span>}
                  </div>
                  {exact?.pos && <div className="dict-meta">{exact.pos}</div>}

                  {/* 알아요 / 몰라요 버튼 */}
                  <div className="word-know-btns">
                    <button className="know-btn know-yes" onClick={e => {
                      saveWord({ word: wordPanel.word, base_form: wordPanel.baseForm, pos: exact?.pos, definition: firstDef, known: 1, from_book: title })
                      const btn = e.currentTarget; btn.classList.add('clicked'); setTimeout(() => btn.classList.remove('clicked'), 500)
                    }}>알아요</button>
                    <button className="know-btn know-no" onClick={e => {
                      saveWord({ word: wordPanel.word, base_form: wordPanel.baseForm, pos: exact?.pos, definition: firstDef, known: 0, from_book: title })
                      const btn = e.currentTarget; btn.classList.add('clicked'); setTimeout(() => btn.classList.remove('clicked'), 500)
                    }}>몰라요</button>
                  </div>

                  <hr className="dict-divider" />

                  {items.length === 0 ? (
                    <p className="dict-empty">사전에서 찾을 수 없어요.</p>
                  ) : (
                    exact?.definitions.map((d, i) => (
                      <div key={i} className="dict-def">
                        <span className={`dict-def-num level-${exact?.grade || '중급'}`}>{i + 1}</span>
                        <span className="dict-def-text">{d}</span>
                      </div>
                    ))
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
