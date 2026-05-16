/**
 * sync.js — 외부 API에서 책 데이터를 가져와 SQLite에 저장
 * node sync.js 로 직접 실행하거나 server.js에서 cron으로 호출
 */
const https = require('https')
const { stmts } = require('./db')

const KEY1 = process.env.CULTURE_API_KEY
const KEY2 = process.env.CULTURE_API_KEY2

// ─── 한국전래동화 제목 Set ────────────────────────────────────
const KOREAN_TITLES = new Set([
  '개가 된 범','거울 소동','견우와 직녀','구렁덩덩 새 선비','금도끼와 은도끼',
  '금을 버린 형과 아우','까치의 재판','깨진 도자기','꽃나라 임금님','꾀 많은 토끼',
  '나무가 자라는 물고기','냄새 맡은 값','네 장사의 모험','늴리리 쿵더쿵!','다자구 할머니',
  '단군 이야기','단물 고개','달콤한 방귀사려','도깨비 대장이 된 훈장님','도깨비 씨름 잔치',
  '도깨비를 만났어도','도깨비와 개암','도깨비와 범벅 장수','돌부처에게 비단을 판 바보',
  '동물들의 나이 자랑','두고도 거지','딸랑새','떡시루잡기','똥벼락',
  '마음씨 좋은 할머니와 도깨비','말하는 꾀꼬리와 춤추는 소나무','말하는 남생이',
  '망주석 재판','머리 아홉 달린 괴물','먹으면 죽는 약','메추라기의 꽁지','멸치의 꿈',
  '박석고개','반쪽이','밥장군','방귀 시합','방귀쟁이 며느리','방아 찧는 호랑이',
  '백일홍 이야기','볍씨 한 톨','복 타러 가는 사람','북두칠성이 된 일곱 형제',
  '불씨 지킨 새색시','빨간부채 파란부채','삼 년 고개','생각 나름','생쥐 신랑',
  '선녀와 나무꾼','선문대 할망','세상을 구한 활','소가 된 게으름뱅이','소금 장수와 기름 장수',
  '소나무 위 까치, 소나무 아래 호랑이','쇠를 먹는 불가사리','수달은 누구 것','슬기로운 효자',
  '시르릉 삐죽 할라뿡','신기한 그림족자','신선바위 똥바위','아기장수 우투리',
  '아씨방 일곱 동무','암탉과 누렁이','야광귀신','얄미운 고양이와 푸른 구슬','양초 도깨비',
  '어처구니 이야기','여우수건','연오와 세오',
  '열두 띠 이야기 1 - 검은 소 누런 소','열두 띠 이야기 1 - 돌쇠와 생쥐',
  '열두 띠 이야기 1 - 며느리를 도운 호랑이','열두 띠 이야기 1 - 약초를 물어다 준 뱀',
  '열두 띠 이야기 1 - 청룡과 흑룡','열두 띠 이야기 1 - 토끼의 판결',
  '열두 띠 이야기 2 - 돼지가 된 부자','열두 띠 이야기 2 - 불개',
  '열두 띠 이야기 2 - 아이의 탄생을 알려 준 닭','열두 띠 이야기 2 - 원숭이 궁둥이',
  '열두 띠 이야기 2 - 임금이 되는 양 꿈','열두 띠 이야기 2 - 화살을 이긴 말',
  '엽전 한 닢','예쁜이와 버들이','오세암','옹고집','요술 항아리','우렁이 각시',
  '원숭이의 재판','은혜 갚은 꿩','인삼 오 형제','임금님 귀는 당나귀 귀',
  '재미네골 : 중국 조선족 설화','저승사자에게 잡혀간 호랑이','저승에 있는 곳간',
  '젊어지는 샘물','정신없는 도깨비','좁쌀 반 됫박','좁쌀 한 톨로 장가든 총각',
  '종이에 싼 당나귀','주먹이','집안이 화목한 비결','짧아진 바지','참외와 황소',
  '청개구리','초승달 호수','코없는 신랑과 입큰 각시','토끼와 별주부','팥죽 할머니와 호랑이',
  '할미꽃 이야기','해님달님','해치','호랑감투','호랑이 등에 탄 효자',
  '호랑이가 준 보자기','혹부리 할아버지','효녀 심청','효성 깊은 호랑이',
  '흉내쟁이 도깨비','흰 쥐 이야기',
])

const FOREIGN_TITLES = new Set([
  '코끼리 목욕통','게으름뱅이 후안','욕심쟁이 원숭이와 꾀 많은 거북이',
  '닭은 왜 울까','피나 이야기','별이 된 보석','등불축제','용선 축제',
  '중양절','춘절','청명','주인을 만난 얼룩망아지','사자를 물리친 소년',
  '서로 도우면 할 수 있어요','남질과 왕비님의 반지','사향고양이를 속인 수탉',
  '내가 사랑하는 친절한 도시','용감한 정글 통치자','파우새다우와 사마',
  '자로지타우','카이누이와 새끼 염소의 하리라요 데이',
  '영웅 용','베트남을 세운 락 룽 권','부지런한 쯔 동 뜨 이야기',
  '마귀가 오는 날','리에우 왕자','수정이 된 심장','오늘은 뭐 하고 놀지?',
  '애기사슴과 호랑이','욕심 꾸러기 왕과 생쥐 가족',
  '호랑이에게 왜 줄무늬가 생겼을까?','나무껍질의 소원',
  '꼬부랑할아버지와 요술동전','친구가 없어졌다','눈에 보이지 않는 보석',
  '꾀보 살람','멋쟁이 원숭이의 목걸이','두 시간의 일',
  '착한 아들과 슬기로운 아버지',
])

function classify(title) {
  const t = title.trim()
  if (FOREIGN_TITLES.has(t)) return 'foreign'
  if (KOREAN_TITLES.has(t))  return 'korean'
  return 'creative'
}

// ─── HTTPS fetch ──────────────────────────────────────────────
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
    req.on('error', reject)
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

// ─── XML 파싱 ─────────────────────────────────────────────────
function parseLib048(xml) {
  const items = []
  const matches = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
  for (const m of matches) {
    const get = tag => {
      const r = m.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`))
      return r ? r[1].trim() : ''
    }
    const title = get('title')
    if (!title) continue
    items.push({
      title,
      description: get('description'),
      thumbnail:   get('image_object'),
      url:         get('url').replace(/&amp;/g, '&'),
      creator:     get('author').replace(/\|\|/g, ', '),
      reg_date:    get('issued_date').slice(0, 10),
      story_type:  classify(title),
      source:      'multilang',
      collection:  classify(title) === 'foreign' ? '외국전래동화'
                 : classify(title) === 'korean'  ? '한국전래동화'
                 : '창작동화',
    })
  }
  return items
}

// ─── 동기화 실행 ──────────────────────────────────────────────
async function syncBooks() {
  console.log('[sync] 시작...')
  try {
    const xml = await fetchText(
      `https://api.kcisa.kr/openapi/API_LIB_048/request?serviceKey=${KEY2}&numOfRows=400&pageNo=1`
    )
    const items = parseLib048(xml)

    // 중복 제거 (제목 기준)
    const seen = new Set()
    const unique = items.filter(i => {
      if (seen.has(i.title)) return false
      seen.add(i.title)
      return true
    })

    // 트랜잭션으로 일괄 upsert
    const upsertMany = stmts.upsert
    const tx = require('./db').db.transaction(rows => {
      for (const row of rows) upsertMany.run(row)
    })
    tx(unique)

    stmts.logSync.run(unique.length, 'ok')
    console.log(`[sync] 완료 — ${unique.length}개 저장`)
    return unique.length
  } catch (e) {
    stmts.logSync.run(0, 'error: ' + e.message)
    console.error('[sync] 실패:', e.message)
    throw e
  }
}

module.exports = { syncBooks }

// 직접 실행 시
if (require.main === module) {
  syncBooks().then(() => process.exit(0)).catch(() => process.exit(1))
}
