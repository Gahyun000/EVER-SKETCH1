/**
 * **형제 앱으로 가는 칩 — 끊겼으면 끊겼다고 말한다.**
 *
 * 2026-09-17 · 시안 v1.0 의 ㉡「말리는 칩」으로 정했다.
 *
 * 고치는 것은 **침묵**이다. 예전에는 상대 앱이 안 떠 있어도, 포트가 어긋나 있어도,
 * 칩이 똑같이 **빈 탭**을 열었다. 눌러 본 사람은 「어, 안 뜨네」 하고 넘기고,
 * 포트가 어긋난 경우와 그냥 안 띄운 경우를 구분할 방법이 없었다.
 * 실제로 8820→8808 로 옮긴 날 이 칩이 조용히 죽을 뻔했다.
 *
 * **길은 막지 않는다.** 판정이 틀릴 수 있어서다(아래 참고). 그래서 「그래도 열기」가 있다.
 * 막는 가드가 아니라 **말해 주는 가드**다.
 *
 * ── 어떻게 「안 떠 있다」를 아나 ───────────────────────────────
 * `fetch(주소, { mode: 'no-cors' })`. 다른 오리진이라 **내용은 못 읽지만**,
 * 요청이 끝났는지(=무언가 대답했는지)는 알 수 있다. 끝나면 살아 있음, 거절이면 없음.
 * 1.5초를 넘기면 없음으로 본다 — 그보다 오래 걸리는 localhost 는 사실상 죽은 것이다.
 *
 * **틀릴 수 있는 자리**: 살아 있는데 브라우저 확장·프록시 때문에 거절이 날 수 있다.
 * 그래서 결과로 링크를 막지 않고 한 번 되물을 뿐이다.
 *
 * **콘솔에 빨간 줄이 남는다.** 닿지 못한 fetch 는 브라우저가 직접 찍는 것이라 우리가
 * 삼킬 수 없다. 이것 때문에 「오류가 났다」고 오해하지 않도록 여기 적어 둔다.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

/**
 * **띄우는 법은 운영체제마다 다르다**(2026-09-17 · 사용자 지적).
 * 「run.command 로 띄우세요」라고 적어 두었는데 그건 **맥 파일**이고, 쓰는 사람은
 * 윈도우가 더 많다. 윈도우 사용자에게 없는 파일을 실행하라고 시키는 안내는
 * 안 하느니만 못하다 — 시킨 대로 했는데 안 되니 화면을 믿지 않게 된다.
 *
 * 이름은 **표준 런처**를 쓴다(에이전트대장 §2 가 요구하는 네 이름 중 둘).
 * 모르는 운영체제면 맥 쪽을 쓴다 — 이 저장소가 맥에서 만들어졌고 그쪽이 더 흔하다.
 */
export function launcherName(): string {
  const p = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform
    || navigator.platform || ''
  return /win/i.test(p) ? 'start.bat' : 'start.command'
}

/** 아직 안 재 봤으면 null. 셋을 구분해야 「모름」에 겁주는 표시를 안 한다. */
export type Alive = boolean | null

/** 재는 데 이만큼 넘게 걸리면 없는 것으로 본다. localhost 는 원래 즉답이다. */
const PROBE_MS = 1500
/** 같은 주소를 이 시간 안에 또 묻지 않는다 — 화면이 여러 번 그려져도 한 번만 찌른다. */
const CACHE_MS = 10_000

const cache = new Map<string, { at: number; alive: Alive; inflight?: Promise<boolean> }>()

async function probe(url: string): Promise<boolean> {
  const hit = cache.get(url)
  const now = Date.now()
  if (hit?.inflight) return hit.inflight
  if (hit && hit.alive !== null && now - hit.at < CACHE_MS) return hit.alive
  const p = fetch(url, { mode: 'no-cors', signal: AbortSignal.timeout(PROBE_MS) })
    .then(() => true)
    .catch(() => false)
    .then((ok) => { cache.set(url, { at: Date.now(), alive: ok }); return ok })
  cache.set(url, { at: now, alive: hit?.alive ?? null, inflight: p })
  return p
}

/**
 * 살아 있나. 화면이 뜰 때 한 번 재고, `recheck()` 로 다시 잰다.
 * **다시 재는 게 중요하다** — 사람이 나중에 상대 앱을 띄우는 일이 흔하다.
 */
export function useSiblingAlive(url: string): { alive: Alive; recheck: () => void } {
  const [alive, setAlive] = useState<Alive>(() => cache.get(url)?.alive ?? null)
  // 화면이 사라진 뒤에 답이 와도 setState 하지 않는다(경고가 뜬다).
  const live = useRef(true)
  useEffect(() => () => { live.current = false }, [])
  const run = useCallback((force: boolean) => {
    if (force) cache.delete(url)
    void probe(url).then((ok) => { if (live.current) setAlive(ok) })
  }, [url])
  useEffect(() => { run(false) }, [run])
  return { alive, recheck: () => run(true) }
}

const popStyle: CSSProperties = {
  position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 60, width: 290,
  textAlign: 'left', whiteSpace: 'normal', background: '#fff3e2', border: '1px solid #f0d7b4',
  color: '#6b431a', borderRadius: 9, padding: '10px 12px', fontSize: 12.5, fontWeight: 600,
  lineHeight: 1.55, boxShadow: '0 6px 20px rgba(20,30,60,.12)',
}
const btn: CSSProperties = {
  border: '1px solid #f0d7b4', background: '#fff', color: '#6b431a', borderRadius: 7,
  padding: '5px 11px', font: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer',
}

export interface SiblingLinkProps {
  /** 갈 곳. 살아 있는지도 이 주소로 잰다. */
  url: string
  /** 찔러 볼 주소가 따로일 때(예: 책 한 권 주소 대신 앱 뿌리). 없으면 `url` 을 쓴다. */
  probeUrl?: string
  /** 「EVER-FOLIO」처럼 사람이 부르는 이름. */
  name: string
  /** 「127.0.0.1:8811」. 안 뜰 때 어디가 대답을 안 하는지 짚어 준다. */
  host: string
  /** **무엇을 하면 되는지**. 이유만 말하고 길을 안 알려주면 반쪽이다.
   *  안 주면 운영체제에 맞는 표준 런처 이름을 쓴다(`launcherName()`). */
  how?: string
  /**
   * **좁은 자리용.** 표 칸이나 상세 패널처럼 `overflow` 가 걸린 곳에서는 말풍선이
   * **잘린다** — 실제로 시안에서 표 아래 테두리에 잘리는 것을 찍어 확인했다
   * (`docs/화면시안_발행본보기_끊김표시_v1.0.html`). 그런 자리는 이걸 켠다.
   *
   * 켜면 말풍선 대신 **화면 아래 띠**(build-toast, `position:fixed`)로 한 줄만 말한다.
   * 잘릴 수가 없고, 이 앱이 이미 쓰는 자리라 새 모양을 만들지 않는다.
   * **막는 것은 똑같다** — 빈 탭은 열리지 않는다.
   */
  quiet?: boolean
  className?: string
  style?: CSSProperties
  children: React.ReactNode
}

/**
 * 형제 앱으로 가는 링크. 살아 있으면 평범한 `<a>` 그대로다.
 * 안 떠 있을 때만 흐려지고, **눌러도 빈 탭을 열지 않고** 까닭을 말한다.
 */
export default function SiblingLink(
  { url, probeUrl, name, host, how, quiet, className, style, children }: SiblingLinkProps,
) {
  const { alive, recheck } = useSiblingAlive(probeUrl || url)
  const runBy = how || launcherName()
  const [ask, setAsk] = useState(false)
  const down = alive === false

  // 닫는 길을 두 개 둔다 — Esc 와 바깥 누르기. 하나뿐이면 갇힌 느낌이 난다.
  // 띠는 **스스로 사라진다.** 화면 아래에 계속 남아 있으면 다음 일을 가린다.
  // 말풍선은 사람이 닫는다 — 그 자리에 붙어 있어서 가리는 것이 없다.
  useEffect(() => {
    if (!ask || !quiet) return
    const t = window.setTimeout(() => setAsk(false), 5000)
    return () => window.clearTimeout(t)
  }, [ask, quiet])

  useEffect(() => {
    if (!ask) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAsk(false) }
    const onDown = () => { if (!quiet) setAsk(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [ask, quiet])

  return (
    <a
      className={(className || '') + (down ? ' sib-down' : '')}
      style={{ position: 'relative', ...style }}
      href={url} target="_blank" rel="noreferrer"
      // **닿을 때마다 다시 잰다.** 마우스·키보드 둘 다 — 툴팁만 두면 키보드 쪽은 끝내 모른다.
      onMouseEnter={recheck} onFocus={recheck}
      title={down
        ? `${name} 가 연결 안돼있습니다 — ${host} 가 대답하지 않습니다 (${runBy} 로 띄우세요)`
        : `${name} 열기 — ${host}`}
      onClick={(e) => {
        if (!down) return                 // 살아 있으면 손대지 않는다
        e.preventDefault()
        e.stopPropagation()               // 줄 클릭 등 바깥 동작을 깨우지 않는다
        setAsk((v) => !v)
      }}
    >
      {children}
      {/* **좁은 자리는 띠로 말한다.** 말풍선은 표·패널의 overflow 에 잘린다.
          띠는 `position:fixed` 라 잘릴 수가 없고, 이 앱이 이미 쓰는 모양이다. */}
      {ask && quiet && createPortal(
        <div className="build-toast" role="status">
          <span className="bt-msg">{name} 가 연결 안돼있습니다 — {runBy} 로 띄운 뒤 다시 눌러 주세요.</span>
          {/* 길은 여기서도 막지 않는다. 판정이 틀릴 수 있다. */}
          <a className="bt-open" href={url} target="_blank" rel="noreferrer"
            onClick={() => setAsk(false)}>그래도 열기</a>
          <button className="bt-x" onClick={() => setAsk(false)}>✕</button>
        </div>,
        document.body,
      )}
      {ask && !quiet && (
        // 뜬창이 아니라 **그 자리에서** 말한다. 창을 띄우면 읽기도 전에 닫게 된다.
        <div style={popStyle} role="status"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
          <b>{name} 가 안 떠 있습니다.</b><br />
          {host} 가 대답하지 않습니다. <b>{runBy}</b> 로 띄운 뒤 다시 눌러 주세요.
          <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
            {/* **길은 열어 둔다.** 판정이 틀릴 수 있다(브라우저 확장·프록시). */}
            <button style={btn} onClick={() => { setAsk(false); window.open(url, '_blank', 'noreferrer') }}>
              그래도 열기
            </button>
            <button style={{ ...btn, background: 'transparent', borderColor: 'transparent', color: '#9a7b52' }}
              onClick={() => setAsk(false)}>닫기</button>
          </div>
        </div>
      )}
    </a>
  )
}
