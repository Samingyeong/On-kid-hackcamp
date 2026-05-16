/**
 * BrailleDisplay.tsx
 * 가상 6점 점자 도트 + 고대비 텍스트 출력 컴포넌트
 */

import type { Dots } from '../utils/brailleConverter'

interface BrailleDisplayProps {
  dots: Dots
  text: string
  preview: string
}

// 점 번호 레이블 (왼쪽 열: 1,2,3 / 오른쪽 열: 4,5,6)
const DOT_LABELS = ['1', '4', '2', '5', '3', '6']
// dots 배열 인덱스 순서 (그리드 배치: 좌1→우4→좌2→우5→좌3→우6)
const DOT_ORDER = [0, 3, 1, 4, 2, 5]

export default function BrailleDisplay({ dots, text, preview }: BrailleDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-8 w-full">

      {/* ── 6점 도트 패널 ── */}
      <div
        role="img"
        aria-label={`현재 점자 입력 상태: ${dots.map((d, i) => d ? `${i + 1}번 점 활성` : '').filter(Boolean).join(', ') || '없음'}`}
        className="flex flex-col items-center gap-3"
      >
        <p className="text-yellow-300 text-lg font-bold tracking-widest uppercase">
          현재 입력 중인 점자
        </p>

        {/* 2열 3행 그리드 */}
        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr 1fr' }}
        >
          {DOT_ORDER.map((dotIdx, gridPos) => {
            const isActive = dots[dotIdx]
            const label = DOT_LABELS[gridPos]!
            return (
              <div
                key={dotIdx}
                aria-label={`${dotIdx + 1}번 점 ${isActive ? '활성' : '비활성'}`}
                className={`
                  w-24 h-24 rounded-full border-4 flex items-center justify-center
                  text-3xl font-black transition-all duration-75 select-none
                  ${isActive
                    ? 'bg-yellow-400 border-yellow-200 text-black shadow-[0_0_30px_#FFFF00]'
                    : 'bg-black border-yellow-400 text-yellow-400'
                  }
                `}
              >
                {label}
              </div>
            )
          })}
        </div>

        {/* 조합 중인 글자 미리보기 */}
        {preview && (
          <div
            aria-live="polite"
            aria-label={`조합 중: ${preview}`}
            className="mt-2 text-6xl font-black text-yellow-300 tracking-widest"
          >
            {preview}
          </div>
        )}
      </div>

      {/* ── 누적 텍스트 출력 ── */}
      <div
        role="region"
        aria-label="입력된 문장"
        aria-live="polite"
        className="
          w-full max-w-4xl min-h-[120px] rounded-2xl
          border-4 border-yellow-400 bg-black
          px-8 py-6 flex items-center justify-center
        "
      >
        {text ? (
          <p
            className="text-yellow-400 font-black leading-tight break-all text-center"
            style={{ fontSize: 'clamp(3rem, 8vw, 5rem)' }}
          >
            {text}
            <span
              className="inline-block w-1 bg-yellow-400 ml-1 animate-pulse"
              style={{ height: '1em', verticalAlign: 'text-bottom' }}
              aria-hidden="true"
            />
          </p>
        ) : (
          <p className="text-yellow-700 text-2xl text-center">
            숫자패드 7·8·4·5·1·2 키를 동시에 눌러 점자를 입력하세요
          </p>
        )}
      </div>

      {/* ── 키 매핑 안내 ── */}
      <div
        role="complementary"
        aria-label="키 매핑 안내"
        className="grid grid-cols-3 gap-3 w-full max-w-sm"
      >
        {[
          { key: '7', dot: '점1', col: 'left' },
          { key: '8', dot: '점4', col: 'right' },
          { key: '4', dot: '점2', col: 'left' },
          { key: '5', dot: '점5', col: 'right' },
          { key: '1', dot: '점3', col: 'left' },
          { key: '2', dot: '점6', col: 'right' },
        ].map(({ key, dot }) => (
          <div
            key={key}
            className="border-2 border-yellow-600 rounded-xl p-3 text-center bg-black"
          >
            <span className="block text-yellow-400 text-2xl font-black">{key}</span>
            <span className="block text-yellow-600 text-sm mt-1">{dot}</span>
          </div>
        ))}
        <div className="col-span-2 border-2 border-yellow-600 rounded-xl p-3 text-center bg-black">
          <span className="block text-yellow-400 text-xl font-black">0</span>
          <span className="block text-yellow-600 text-sm mt-1">띄어쓰기</span>
        </div>
        <div className="border-2 border-yellow-600 rounded-xl p-3 text-center bg-black">
          <span className="block text-yellow-400 text-xl font-black">.</span>
          <span className="block text-yellow-600 text-sm mt-1">지우기</span>
        </div>
        <div className="col-span-3 border-2 border-yellow-600 rounded-xl p-3 text-center bg-black">
          <span className="block text-yellow-400 text-xl font-black">Enter</span>
          <span className="block text-yellow-600 text-sm mt-1">전체 문장 읽기</span>
        </div>
      </div>
    </div>
  )
}
