import type { CSSProperties } from 'react'
import { useBuilder } from '../../state/store'
import { useProjects } from '../../persistence/projects'
// EVER-FOLIO(형제 앱) 주소. **숫자는 ports.json 에서만 온다** — 예전엔 여기 박혀 있었다.
import { FOLIO_URL, FOLIO_HOST } from '../../ports'
// 안 떠 있으면 빈 탭을 여는 대신 까닭을 말한다(시안 v1.0 ㉡).
import SiblingLink from '../../siblingLink'

const folioChip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flex: '0 0 auto',
  border: '1.4px solid rgba(36,98,235,.45)', background: 'rgba(36,98,235,.10)', color: '#2462EB',
  borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 800, textDecoration: 'none',
}

export default function TitleBar({ onPresent }: { onPresent: () => void }) {
  const title = useBuilder((s) => s.title)
  const setTitle = useBuilder((s) => s.setTitle)
  const newProject = useProjects((s) => s.newProject)
  // 한글은 폭이 약 1em, 라틴/숫자는 약 0.58em — 내용에 맞춰 입력 폭 산정(잘림 방지)
  const units = [...(title || '')].reduce((n, c) => n + (/[ -ÿ]/.test(c) ? 0.58 : 1.02), 0)
  const w = Math.min(Math.max(units + 1.4, 6), 40)
  return (
    <div className="ax-title">
      {/* 로고도 셸 머리줄에 있다 — 여기서 뺀다. 남는 것은 **이 문서**의 제목이다. */}
      <input className="ttl" style={{ width: w + 'em' }} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="문서 제목" />
      <span className="sp" />
      {/* 다른 앱(EVER-FOLIO 이북 라이브러리)으로 가는 이동 버튼 */}
      <SiblingLink className="folio-chip" style={folioChip} url={FOLIO_URL}
        name="EVER-FOLIO" host={FOLIO_HOST} how="run.command">↗ EVER-FOLIO</SiblingLink>
      <button className="rbtn" onClick={onPresent} title="구글 슬라이드식 슬라이드쇼">▷ 슬라이드쇼</button>
      <button className="rbtn pri" onClick={() => void newProject()} title="새 이북 시작">＋ 새 이북</button>
      {/* **신원 표시는 셸 머리줄로 올라갔다**(2026-09-10).
          여기 두면 셸의 것과 나란히 두 번 나온다 — 같은 이름표가 위아래로 겹친다. */}
    </div>
  )
}
