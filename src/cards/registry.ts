export type CardGroup = 'frame' | 'model' | 'extra' | 'viz'
export interface CardField { key: string; label: string; example?: string; textarea?: boolean }
export interface CardDef {
  key: string; group: CardGroup; label: string; title: string
  kind?: 'cover' | 'back' | 'toc'
  viz?: 'flow' | 'mindmap' | 'sticky' | 'board' | 'note'
  kpi?: boolean
  /**
   * **목록에서만 감춘다. 등록은 남긴다.**
   *
   * 2026-09-17 · 사용자 결정. 「빈 화면이나 다름없다」는 카드 여섯을 치우기로 했는데,
   * 줄을 지우면 없어지는 것이 목록만이 아니다 — `PageView` 가 이 등록을 보고 본문을 그린다.
   * 지우면 그 카드로 만들어 둔 쪽이 **제목만 남고 조용히 빈다**(PageView.tsx 맨 끝 갈래).
   * 터지지도 않고 글이 사라지지도 않는데(값은 `page.fields` 에 그대로 있다) 화면에서만
   * 비어서, 보는 사람은 「지워졌다」고 생각한다. 그게 제일 나쁜 모양이다.
   *
   * 그래서 **새로 만드는 길만 막고 그리는 길은 남긴다.** 되돌리는 것도 이 한 줄이다.
   * 이 표시를 보는 곳: 카드 고르기(CardPicker) · Palette · 서버 사본(card_catalog.py) —
   * 서버 쪽은 이 표시가 붙은 카드를 **AI 에게 권하지 않는다**. 사람이 못 고르는 것을
   * 기계가 권하면 「이건 왜 목록에 없지」가 된다.
   */
  hidden?: boolean
  fields: CardField[]
}
const f = (key: string, label: string, example = ''): CardField => ({ key, label, example })
export const CARD_REGISTRY: CardDef[] = [
  { key: 'cover', group: 'frame', label: '표지', title: '유니에버 AX 사업모델', kind: 'cover',
    fields: [f('title', '제목', '유니에버 AX 사업모델'), f('sub', '부제', '2026 경영보고')] },
  { key: 'toc', group: 'frame', label: '목차(자동)', title: '목차', kind: 'toc', fields: [] },
  { key: 'note', group: 'frame', label: '빈 페이지(블록·토글)', title: '새 페이지', viz: 'note', fields: [] },
  { key: 'closing', group: 'frame', label: '마무리', title: '함께 시작합시다', kind: 'back',
    fields: [f('title', '한 줄 메시지', '지금이 가장 잘 시작할 수 있는 때입니다'), f('sub', '연락/링크(선택)')] },
  { key: 'summary', group: 'extra', hidden: true, label: '한 줄 요약', title: '핵심 요약',
    fields: [f('title', '제목', '핵심 요약'), { key: 'body', label: '한 문장', example: '현장 데이터로 품질을 바꾸는 AX 사업', textarea: true }] },
  { key: 'kpi', group: 'extra', hidden: true, label: '성과·KPI', title: '기대 성과', kpi: true,
    fields: [f('title', '제목', '기대 성과'), f('k1', '지표 1 (이름:값)', '불량률:-30%'), f('k2', '지표 2', '검사시간:-40%'), f('k3', '지표 3', 'ROI:14개월')] },
  { key: 'roadmap', group: 'extra', hidden: true, label: '로드맵', title: '로드맵',
    fields: [f('title', '제목', '로드맵'), f('p1', '단계 (이름:시기)', 'PoC : 1분기'), f('p2', '단계', '확산 : 3분기')] },
  { key: 'market', group: 'extra', hidden: true, label: '시장·경쟁', title: '시장과 경쟁',
    fields: [f('title', '제목', '시장과 경쟁'), f('p1', '시장 한 줄', '국내 품질SW 3천억'), f('p2', '우위', '현장 특화 데이터')] },
  { key: 'flow', group: 'viz', hidden: true, label: '프로세스(플로우)', title: '도입 프로세스', viz: 'flow',
    fields: [f('title', '제목', '도입 프로세스'), f('s1', '단계 1', '데이터 연결'), f('s2', '단계 2', 'AI 학습'), f('s3', '단계 3', '현장 적용'), f('s4', '단계 4 (선택)', '성과 검증')] },
  // 머메이드는 **카드가 아니라 펼침**이다(store.addCard 가 가로챈다). 목록에 보이려고 여기 둔다 —
  // 마인드맵과 같은 자리다. `fields` 는 안 쓴다: 내용은 머메이드 원문에서 온다.
  //
  // **카드는 하나인데 고르는 문은 둘이다**(2026-09-17 · 「머메이드 TB」·「머메이드 LR」).
  // 방향은 카드가 아니라 **글 첫 줄**이 정한다 — `parseMermaid` 가 `graph TB|TD|LR` 를 읽는다.
  // 그러니 둘로 가른다 해도 달라지는 것은 **채워 주는 표본 글 한 줄**뿐이고, 그 한 줄을 위해
  // 카드 종류를 둘로 쪼개면 등록·서버 사본·저장된 `cardKey` 가 전부 두 벌이 된다.
  // 그래서 **쪼개지 않았다.** 두 문은 CardPicker 에만 있다(MM_DOORS).
  //
  // 키는 `tree` 로 둔다. 이미 저장된 자료와 store.addCard 의 가로채기가 이 이름을 쓰고 있어서,
  // 이름을 바꾸면 얻는 것 없이 그 둘을 같이 고쳐야 한다.
  { key: 'tree', group: 'viz', label: '머메이드', title: '흐름도', viz: 'flow', fields: [] },
  { key: 'mindmap', group: 'viz', label: '마인드맵', title: 'AX 추진 영역', viz: 'mindmap',
    fields: [f('title', '제목', 'AX 추진 영역'), f('center', '중심 주제', '유니에버 AX'), f('b1', '가지 1', '품질'), f('b2', '가지 2', '생산'), f('b3', '가지 3', '물류'), f('b4', '가지 4 (선택)', '경영정보'), f('b5', '가지 5 (선택)'), f('b6', '가지 6 (선택)'), f('b7', '가지 7 (선택)'), f('b8', '가지 8 (선택)')] },
  { key: 'sticky', group: 'viz', label: '스티키 메모', title: '아이디어 메모', viz: 'sticky',
    fields: [f('title', '제목', '아이디어 메모'), f('n1', '메모 1', '현장 니즈 인터뷰'), f('n2', '메모 2', 'PoC 대상 라인'), f('n3', '메모 3', 'ROI 계산'), f('n4', '메모 4 (선택)')] },
  { key: 'board', group: 'viz', label: '자유 메모 보드', title: '자유 보드', viz: 'board',
    fields: [f('title', '제목', '자유 보드'), f('n1', '메모 1', '핵심 가설'), f('n2', '메모 2', '리스크'), f('n3', '메모 3', '다음 액션'), f('n4', '메모 4', '질문'), f('n5', '메모 5 (선택)'), f('n6', '메모 6 (선택)')] },
  { key: 'dsection', group: 'extra', hidden: true, label: '덱 섹션', title: '섹션',
    fields: [f('markN', '번호', '01'), f('title', '제목', '제조 현장의 활용 분야'),
      { key: 'sub', label: '부제', example: '현장 데이터를 하나의 흐름으로 모읍니다.', textarea: true },
      f('cols', '열 수 (2/3)', '3'),
      f('c1', '카드 1 (제목|설명)', '품질|찾고·보고·판정합니다'),
      f('c2', '카드 2 (제목|설명)', '지식|흩어진 문서를 답으로'),
      f('c3', '카드 3 (제목|설명)', '설비|예측하고 지시서까지'),
      f('c4', '카드 4 (제목|설명)', '경영|숫자를 판단 가능한 요약으로'),
      f('c5', '카드 5 (선택)', ''),
      f('c6', '카드 6 (선택)', '')] },
]
export const cardByKey = (key: string) => CARD_REGISTRY.find((c) => c.key === key)
