import { CARD_REGISTRY } from '../cards/registry'
import { useBuilder } from '../state/store'
const GROUPS = [
  { key: 'frame', label: '틀 구조' },
  { key: 'extra', label: '경영 보고 보강' },
  { key: 'viz', label: '다이어그램·비주얼' },
]
export default function Palette() {
  const addCard = useBuilder((s) => s.addCard)
  return (<div>
    {GROUPS.map((g) => (<div key={g.key}>
      <div className="grp">{g.label}</div>
      {CARD_REGISTRY.filter((c) => c.group === g.key).map((c) => (
        <button key={c.key} className="chip" onClick={() => addCard(c.key)}>{c.label}<span className="plus">＋</span></button>
      ))}
    </div>))}
  </div>)
}
