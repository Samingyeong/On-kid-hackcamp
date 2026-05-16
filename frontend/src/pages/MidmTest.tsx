import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { fetchLearningFeedback, fetchQuiz, fetchWordExplanation, fetchWeeklyReport, fetchTutorialStep, type MidmResponse, type ChildProfile } from '../api/midm'

const STEPS = ['INTRO', 'ASK_GENRE', 'WORD_TEST', 'QUIZ_TEST', 'LEVEL_ANALYSIS', 'RECOMMEND_BOOK', 'DAILY_FEEDBACK']

export default function MidmTest() {
  const { childName, childCharacter, childBirthDate } = useAuth()
  const [responses, setResponses] = useState<{ label: string; data: MidmResponse | object }[]>([])
  const [loading, setLoading] = useState('')
  const [selectedStep, setSelectedStep] = useState('INTRO')
  const [word, setWord] = useState('고물고물')
  const [definition, setDefinition] = useState('느리게 움직이는 모양')

  const profile: ChildProfile = {
    name: childName || '테스트',
    birth_date: childBirthDate || '2019-03-15',
    disability: childCharacter || 'slow',
  }

  function addResponse(label: string, data: MidmResponse | object) {
    setResponses(prev => [{ label, data }, ...prev])
  }

  async function callFeedback() {
    setLoading('feedback')
    try {
      const res = await fetchLearningFeedback(profile, 65)
      addResponse('DAILY_FEEDBACK', res)
    } catch (e: any) { addResponse('ERROR', { error: e.message }) }
    setLoading('')
  }

  async function callQuiz() {
    setLoading('quiz')
    try {
      const res = await fetchQuiz(profile, '암탉과 누렁이', '옛날 어느 마을에 암탉 한 마리와 누렁이가 살았어요. 암탉은 매일 알을 낳았고 누렁이는 마당을 지켰어요.')
      addResponse('BOOK_QUIZ', res)
    } catch (e: any) { addResponse('ERROR', { error: e.message }) }
    setLoading('')
  }

  async function callExplain() {
    setLoading('explain')
    try {
      const res = await fetchWordExplanation(profile, word, definition)
      addResponse(`EXPLAIN_WORD: ${word}`, res)
    } catch (e: any) { addResponse('ERROR', { error: e.message }) }
    setLoading('')
  }

  async function callReport() {
    setLoading('report')
    try {
      const res = await fetchWeeklyReport(profile, 72)
      addResponse('WEEKLY_REPORT', res)
    } catch (e: any) { addResponse('ERROR', { error: e.message }) }
    setLoading('')
  }

  async function callTutorial() {
    setLoading('tutorial')
    try {
      const res = await fetchTutorialStep(profile, selectedStep)
      addResponse(`TUTORIAL: ${selectedStep}`, res)
    } catch (e: any) { addResponse('ERROR', { error: e.message }) }
    setLoading('')
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 8 }}>🧪 Mi:dm API 테스트</h2>
      <p style={{ color: '#666', marginBottom: 20, fontSize: 14 }}>
        프로필: {profile.name} / {profile.birth_date} / {profile.disability}
      </p>

      {/* 튜토리얼 Step */}
      <section style={{ marginBottom: 20, padding: 16, background: '#f8f9fa', borderRadius: 12 }}>
        <h3 style={{ margin: '0 0 10px' }}>📋 튜토리얼 Step 호출</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {STEPS.map(s => (
            <button
              key={s}
              onClick={() => setSelectedStep(s)}
              style={{
                padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: selectedStep === s ? '#2980B9' : '#ddd',
                color: selectedStep === s ? '#fff' : '#333', fontSize: 12,
              }}
            >{s}</button>
          ))}
        </div>
        <button onClick={callTutorial} disabled={!!loading} style={btnStyle}>
          {loading === 'tutorial' ? '호출 중...' : `${selectedStep} 호출`}
        </button>
      </section>

      {/* 기능별 호출 */}
      <section style={{ marginBottom: 20, padding: 16, background: '#f0f8ff', borderRadius: 12 }}>
        <h3 style={{ margin: '0 0 10px' }}>⚡ 기능별 호출</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button onClick={callFeedback} disabled={!!loading} style={btnStyle}>
            {loading === 'feedback' ? '...' : '📊 학습 피드백'}
          </button>
          <button onClick={callQuiz} disabled={!!loading} style={btnStyle}>
            {loading === 'quiz' ? '...' : '📝 퀴즈 생성'}
          </button>
          <button onClick={callReport} disabled={!!loading} style={btnStyle}>
            {loading === 'report' ? '...' : '📈 주간 리포트'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <input value={word} onChange={e => setWord(e.target.value)} placeholder="단어" style={inputStyle} />
          <input value={definition} onChange={e => setDefinition(e.target.value)} placeholder="사전 뜻" style={{ ...inputStyle, flex: 2 }} />
          <button onClick={callExplain} disabled={!!loading} style={btnStyle}>
            {loading === 'explain' ? '...' : '💬 단어 설명'}
          </button>
        </div>
      </section>

      {/* 응답 로그 */}
      <section>
        <h3>📨 응답 로그 ({responses.length})</h3>
        {responses.map((r, i) => (
          <div key={i} style={{ marginBottom: 12, padding: 12, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#2980B9', marginBottom: 6 }}>{r.label}</div>
            {'message_to_child' in r.data && (
              <div style={{ padding: 8, background: '#e8f8e8', borderRadius: 8, marginBottom: 6, fontSize: 14 }}>
                🗣️ {(r.data as MidmResponse).message_to_child}
              </div>
            )}
            <pre style={{ fontSize: 11, overflow: 'auto', maxHeight: 200, margin: 0, color: '#555' }}>
              {JSON.stringify(r.data, null, 2)}
            </pre>
          </div>
        ))}
      </section>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: '#2980B9', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
}
const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, flex: 1,
}
