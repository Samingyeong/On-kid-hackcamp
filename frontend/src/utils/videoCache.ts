/**
 * videoCache.ts
 *
 * 하이브리드 캐싱 테이블 — GPU 비용 절감 & 즉시 재생 최적화
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  계층 1 (STATIC_CACHE)  : 빌드 타임에 번들된 로컬 에셋      │
 * │  계층 2 (runtimeCache)  : 런타임에 FLOWAI가 반환한 URL 저장 │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 키 규칙: "[animal]_[action]"  (소문자, 공백→언더스코어)
 * 예)  rabbit_brick  →  /assets/videos/rabbit_brick.mp4
 *
 * fetchFlowAIVideo() 호출 전에 반드시 getCachedVideo()를 먼저 확인합니다.
 * 캐시 히트 시 FLOWAI API를 전혀 호출하지 않으므로 호출 비용이 0입니다.
 */

// ─── 타입 ─────────────────────────────────────────────────────

export interface CacheEntry {
  url: string
  /** 'static': 로컬 번들 에셋 | 'runtime': FLOWAI 응답 캐시 */
  source: 'static' | 'runtime'
  /** 캐시 저장 시각 (ms) — TTL 계산용 */
  cachedAt: number
}

// ─── 계층 1: 정적 캐시 (빌드 타임 에셋) ──────────────────────
//
// public/assets/videos/ 폴더에 미리 렌더링된 영상을 넣어두면
// 해당 키 조합은 FLOWAI를 전혀 호출하지 않고 즉시 재생됩니다.
//
// 새 에셋이 추가될 때마다 이 테이블에 항목을 추가하세요.
// ──────────────────────────────────────────────────────────────
const STATIC_CACHE: Record<string, string> = {
  // ── 학교 시나리오 ─────────────────────────────────────────
  'rabbit_helping':        '/assets/videos/rabbit_helping.mp4',
  'rabbit_passing':        '/assets/videos/rabbit_passing.mp4',
  'rabbit_telling_teacher':'/assets/videos/rabbit_telling_teacher.mp4',
  'bear_cutting_line':     '/assets/videos/bear_cutting_line.mp4',
  'bear_waiting_line':     '/assets/videos/bear_waiting_line.mp4',
  'bear_skipping_lunch':   '/assets/videos/bear_skipping_lunch.mp4',
  'fox_raising_hand':      '/assets/videos/fox_raising_hand.mp4',
  'fox_sleeping_class':    '/assets/videos/fox_sleeping_class.mp4',
  'fox_whispering':        '/assets/videos/fox_whispering.mp4',

  // ── 마트 시나리오 ─────────────────────────────────────────
  'squirrel_hiding_snack': '/assets/videos/squirrel_hiding_snack.mp4',
  'squirrel_asking_parent':'/assets/videos/squirrel_asking_parent.mp4',
  'squirrel_crying':       '/assets/videos/squirrel_crying.mp4',
  'deer_standing_lost':    '/assets/videos/deer_standing_lost.mp4',
  'deer_asking_employee':  '/assets/videos/deer_asking_employee.mp4',
  'deer_wandering':        '/assets/videos/deer_wandering.mp4',
  'hedgehog_pocketing':    '/assets/videos/hedgehog_pocketing.mp4',
  'hedgehog_returning':    '/assets/videos/hedgehog_returning.mp4',
  'hedgehog_ignoring':     '/assets/videos/hedgehog_ignoring.mp4',

  // ── 데모용 플레이스홀더 (실제 파일 없어도 UI 테스트 가능) ──
  'demo_default':          '/assets/videos/demo_default.mp4',
}

// ─── 계층 2: 런타임 캐시 (메모리 내 Map) ─────────────────────
//
// FLOWAI가 영상 URL을 반환하면 setCachedVideo()로 여기에 저장합니다.
// 같은 조합을 다시 요청하면 API 호출 없이 즉시 반환됩니다.
// 페이지 새로고침 시 초기화됩니다 (세션 범위 캐시).
// ──────────────────────────────────────────────────────────────
const runtimeCache = new Map<string, CacheEntry>()

/** 런타임 캐시 TTL: 30분 (ms) */
const RUNTIME_TTL_MS = 30 * 60 * 1000

// ─── 공개 API ─────────────────────────────────────────────────

/**
 * 캐시 키를 정규화합니다.
 * "Rabbit" / "rabbit" / "RABBIT" 모두 동일하게 처리됩니다.
 *
 * @example
 * buildCacheKey('rabbit', 'helping a friend')
 * // → "rabbit_helping_a_friend"
 */
export function buildCacheKey(animal: string, action: string): string {
  const normalize = (s: string) =>
    s.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  return `${normalize(animal)}_${normalize(action)}`
}

/**
 * 캐시에서 영상 URL을 조회합니다.
 *
 * 조회 순서:
 *   1. 런타임 캐시 (TTL 유효한 경우)
 *   2. 정적 캐시 (로컬 에셋)
 *
 * @returns CacheEntry (히트) | null (미스 → FLOWAI 호출 필요)
 */
export function getCachedVideo(animal: string, action: string): CacheEntry | null {
  const key = buildCacheKey(animal, action)

  // ── 계층 2: 런타임 캐시 확인 ──────────────────────────────
  const runtime = runtimeCache.get(key)
  if (runtime) {
    const age = Date.now() - runtime.cachedAt
    if (age < RUNTIME_TTL_MS) {
      console.debug(`[videoCache] 런타임 캐시 히트 (${key}, ${Math.round(age / 1000)}s 전 저장)`)
      return runtime
    }
    // TTL 만료 → 제거 후 계층 1로 폴스루
    runtimeCache.delete(key)
    console.debug(`[videoCache] 런타임 캐시 TTL 만료 (${key})`)
  }

  // ── 계층 1: 정적 캐시 확인 ────────────────────────────────
  const staticUrl = STATIC_CACHE[key]
  if (staticUrl) {
    console.debug(`[videoCache] 정적 캐시 히트 (${key})`)
    return { url: staticUrl, source: 'static', cachedAt: Date.now() }
  }

  console.debug(`[videoCache] 캐시 미스 (${key}) → FLOWAI 호출 필요`)
  return null
}

/**
 * FLOWAI 응답 URL을 런타임 캐시에 저장합니다.
 * fetchFlowAIVideo() 성공 직후 호출하세요.
 */
export function setCachedVideo(animal: string, action: string, url: string): void {
  const key = buildCacheKey(animal, action)
  runtimeCache.set(key, { url, source: 'runtime', cachedAt: Date.now() })
  console.debug(`[videoCache] 런타임 캐시 저장 (${key})`)
}

/**
 * 런타임 캐시 전체를 비웁니다.
 * 로그아웃 또는 세션 초기화 시 호출하세요.
 */
export function clearVideoCache(): void {
  runtimeCache.clear()
  console.debug('[videoCache] 런타임 캐시 전체 초기화')
}

/**
 * 현재 런타임 캐시 항목 수를 반환합니다 (디버깅용).
 */
export function getVideoCacheSize(): number {
  return runtimeCache.size
}
