import { useEffect, useMemo, useState } from 'react'
import { fetchParentSummary, type ParentSummary } from '../api/library'
import './ParentDashboard.css'

function percent(value = 0) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`
}

function formatDate(value: string) {
  if (!value) return '기록 없음'
  return value.slice(0, 10)
}

export default function ParentDashboard() {
  const [summary, setSummary] = useState<ParentSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchParentSummary()
      .then(data => {
        if (!cancelled) setSummary(data)
      })
      .catch(() => {
        if (!cancelled) setSummary(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const summaryText = useMemo(() => {
    if (!summary) return ''
    return summary.summary.message_to_parent
      || summary.summary.message_to_child
      || summary.summary.system_analysis
      || '학습 기록을 불러오면 요약이 표시됩니다.'
  }, [summary])

  if (loading) {
    return <div className="parent-dashboard"><main className="pd-shell">학습 기록을 불러오는 중입니다.</main></div>
  }

  if (!summary) {
    return <div className="parent-dashboard"><main className="pd-shell">학습 기록을 불러오지 못했습니다.</main></div>
  }

  const observations = summary.summary.observations || []
  const nextActions = summary.summary.next_actions || []
  const recentSessions = summary.voice.recentSessions || []
  const recommendations = summary.recommendations || []

  return (
    <div className="parent-dashboard">
      <main className="pd-shell">
        <header className="pd-header">
          <div>
            <span className="pd-kicker">학부모케어</span>
            <h1>학습 리포트</h1>
          </div>
          <div className="pd-source">{summary.summarySource === 'midm' ? 'Midm 요약' : '규칙 기반 요약'}</div>
        </header>

        <section className="pd-summary">
          <h2>이번 학습 요약</h2>
          <p>{summaryText}</p>
        </section>

        <section className="pd-metrics" aria-label="핵심 지표">
          <div className="pd-metric">
            <span>읽은 동화</span>
            <strong>{summary.reading.totalBooks}</strong>
          </div>
          <div className="pd-metric">
            <span>단어 이해</span>
            <strong>{summary.words.known} / {summary.words.total}</strong>
          </div>
          <div className="pd-metric">
            <span>음성 퀴즈</span>
            <strong>{summary.voice.correctQuiz} / {summary.voice.totalQuiz}</strong>
          </div>
          <div className="pd-metric">
            <span>듣기 이해도</span>
            <strong>{percent(summary.voice.quizAccuracy)}</strong>
          </div>
        </section>

        <section className="pd-grid">
          <div className="pd-panel">
            <h2>접근성 프로필 기반 지표</h2>
            <div className="pd-bars">
              <label>
                <span>듣기 이해</span>
                <i><b style={{ width: percent(summary.voice.skillVector.listeningComprehension) }} /></i>
                <em>{percent(summary.voice.skillVector.listeningComprehension)}</em>
              </label>
              <label>
                <span>어휘 이해</span>
                <i><b style={{ width: percent(summary.voice.skillVector.vocabulary) }} /></i>
                <em>{percent(summary.voice.skillVector.vocabulary)}</em>
              </label>
              <label>
                <span>짧은 기억</span>
                <i><b style={{ width: percent(summary.voice.skillVector.shortTermRecall) }} /></i>
                <em>{percent(summary.voice.skillVector.shortTermRecall)}</em>
              </label>
              <label>
                <span>명령 수행</span>
                <i><b style={{ width: percent(summary.voice.skillVector.commandFollowing) }} /></i>
                <em>{percent(summary.voice.skillVector.commandFollowing)}</em>
              </label>
            </div>
          </div>

          <div className="pd-panel">
            <h2>관찰 내용</h2>
            <ul className="pd-list">
              {observations.length ? observations.map(item => <li key={item}>{item}</li>) : <li>아직 관찰 기록이 충분하지 않습니다.</li>}
            </ul>
          </div>

          <div className="pd-panel">
            <h2>다음 학습 제안</h2>
            <ul className="pd-list">
              {nextActions.length ? nextActions.map(item => <li key={item}>{item}</li>) : <li>음성 퀴즈를 진행하면 추천이 표시됩니다.</li>}
            </ul>
          </div>

          <div className="pd-panel">
            <h2>추천 동화</h2>
            <div className="pd-recommendations">
              {recommendations.length ? recommendations.map(item => (
                <div key={`${item.rank}-${item.title}`} className="pd-recommendation">
                  <span>{item.rank}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.reason}</p>
                  </div>
                </div>
              )) : <p className="pd-empty">추천 기록이 아직 없습니다.</p>}
            </div>
          </div>

          <div className="pd-panel">
            <h2>최근 음성 세션</h2>
            <div className="pd-sessions">
              {recentSessions.length ? recentSessions.map(session => (
                <div key={session.id} className="pd-session">
                  <strong>{session.bookTitle || '동화 학습'}</strong>
                  <span>{formatDate(session.startedAt)}</span>
                </div>
              )) : <p className="pd-empty">음성 학습 세션 기록이 없습니다.</p>}
            </div>
          </div>

          <div className="pd-panel">
            <h2>최근 읽은 동화</h2>
            <div className="pd-sessions">
              {summary.reading.recentBooks.length ? summary.reading.recentBooks.map(book => (
                <div key={book.title} className="pd-session">
                  <strong>{book.title}</strong>
                  <span>{formatDate(book.lastReadAt)} · {book.readCount}회</span>
                </div>
              )) : <p className="pd-empty">읽은 동화 기록이 없습니다.</p>}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
