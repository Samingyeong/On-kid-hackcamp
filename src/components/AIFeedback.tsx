/**
 * AIFeedback.tsx
 * AI 교정/피드백 표시 컴포넌트
 */

import type { FeedbackResult } from '../utils/midmClient'

interface AIFeedbackProps {
  status: 'idle' | 'loading' | 'done' | 'error'
  result: FeedbackResult | null
  errorMsg: string
}

export default function AIFeedback({ status, result, errorMsg }: AIFeedbackProps) {
  if (status === 'idle') return null

  if (status === 'loading') {
    return (
      <div className="w-full max-w-2xl rounded-2xl border-4 border-yellow-600 bg-black p-5 text-center"
        aria-live="polite" aria-label="AI 피드백 로딩 중">
        <p className="text-yellow-400 text-xl font-bold animate-pulse">
          🤖 선생님이 확인하고 있어요...
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="w-full max-w-2xl rounded-2xl border-4 border-red-600 bg-black p-5 text-center"
        aria-live="assertive">
        <p className="text-red-400 text-lg font-bold">⚠️ {errorMsg}</p>
      </div>
    )
  }

  if (status === 'done' && result) {
    return (
      <div
        className="w-full max-w-2xl rounded-2xl border-4 border-yellow-400 bg-black p-5 flex flex-col gap-3"
        aria-live="polite"
        aria-label="AI 선생님 피드백"
      >
        <p className="text-yellow-600 text-base font-bold">🤖 AI 선생님 피드백</p>
        <p
          className="text-yellow-400 font-bold leading-relaxed"
          style={{ fontSize: 'clamp(1.1rem, 3vw, 1.5rem)' }}
        >
          {result.message}
        </p>
      </div>
    )
  }

  return null
}
