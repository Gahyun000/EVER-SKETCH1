import type { ApprovalStatus } from './approvalApi'

/**
 * 결재 의견을 **언제 주고받을 수 있는가** (2026-09-15, 사용자 결정 ㄴ).
 *
 * 전에는 「수정 요청이 아니면 무조건」 입력칸이 떴다. 상태마다 **그 글을 읽을
 * 사람이 있는지**를 따져 보면 둘이 갈린다.
 *
 *   · 대기 — 결재자가 지적하고 낸 사람이 답한다. 이 자리의 본래 일이다.
 *   · 반려 — 낸 사람이 **고치려고 읽는다.** 되물을 자리도 필요하다. 살아 있는 대화다.
 *   · 승인 — 결정이 끝났다. 자료는 얼었고 팀에 나갔는데 팀은 결재 의견을 못 본다.
 *            낸 사람도 잠긴 자료에 손댈 수 없고, 고치려면 수정 요청이며 거기엔
 *            제 메시지 칸이 따로 있다. **읽을 사람도 할 일도 없다.**
 *   · 회수 — 낸 사람이 스스로 뺐고 결재자는 보지도 않았다. 빈 방에 대고 쓰는 글이다.
 *
 * **닫는 것은 쓰기·지우기고, 읽기는 그대로 둔다.** 반려 뒤에 승인된 건을 열면 대기
 * 때 오간 지적이 「무엇을 왜 고쳤는가」가 남은 유일한 기록이다 — 블록째 감추면
 * 그게 같이 사라진다.
 *
 * **여기는 서버가 정한 것을 그대로 그리는 자리다.** 같은 목록이
 * `server/approvals.py` 의 `COMMENT_OPEN` 에 있고, 서버가 먼저 막는다.
 * 둘이 어긋나지 않는지는 `comment_gate.test.mjs` 가 지킨다.
 */
export const COMMENT_OPEN: readonly ApprovalStatus[] = ['pending', 'rejected']

/**
 * 이 건에 의견을 쓰거나 지울 수 있는가.
 *
 * **수정 요청에는 슬라이드가 없다**(P7 · D8) — 붙일 자리 자체가 없어서 대기 중이어도
 * 닫힌다. 허락·거절에 붙일 말은 결정 메시지 칸에 쓴다.
 */
export function canWriteComment(status: ApprovalStatus, kind?: string): boolean {
  if (kind === 'revision') return false
  return COMMENT_OPEN.includes(status)
}

/**
 * 닫혔을 때 적을 한 줄. **이유와 다음 길을 함께 말한다** — 편집기 앵커 메모가
 * 같은 일을 하며 적어 둔 대로, 「입력칸만 잠그고 이유를 말하지 않으면
 * '왜 안 써지지' 로 끝난다」.
 *
 * 열려 있는 상태에서는 빈 글자다 — 부르는 쪽이 이 값으로 「닫혔나」를 판단하지
 * 않게, 판단은 `canWriteComment` 하나만 한다.
 */
export function commentLockReason(status: ApprovalStatus): string {
  if (status === 'approved') {
    return '승인된 회차입니다. 여기 적은 말은 결정을 바꾸지 못하고, 팀도 보지 못합니다. 고칠 것이 있으면 수정 요청을 내 주세요.'
  }
  if (status === 'withdrawn') {
    return '회수한 회차입니다. 결재자에게 가지 않았습니다. 다시 내면 새 회차에서 이어집니다.'
  }
  return ''
}
