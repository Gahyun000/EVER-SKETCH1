#!/usr/bin/env python3
"""Render the audited agent port registry as a standalone accessible HTML table."""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REGISTRY = SKILL_ROOT / "references" / "agent-port-registry.json"
DEFAULT_OUTPUT = SKILL_ROOT.parents[1] / "html" / "코덱스_에이전트_포트_감사_20260629.html"


def ports(values: list[int]) -> str:
    return ", ".join(str(value) for value in values) if values else "—"


def main() -> int:
    parser = argparse.ArgumentParser(description="포트 감사 HTML 생성")
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    data = json.loads(args.registry.read_text(encoding="utf-8"))
    collisions = data.get("collisions", {})
    conflict_ports = {int(port) for port in collisions}
    active = {int(port) for port, value in data.get("active_at_audit", {}).items() if value}
    rows: list[str] = []
    for index, project in enumerate(data["projects"], 1):
        project_ports = set(project["frontend_ports"] + project["backend_ports"])
        conflicts = sorted(project_ports & conflict_ports)
        actives = sorted(set(project["frontend_ports"] + project["backend_ports"] + project["auxiliary_ports"]) & active)
        state = "충돌" if conflicts else "확정" if project["frontend_ports"] or project["backend_ports"] else "비해당"
        evidence = project.get("evidence", [])[:4]
        evidence_html = "".join(
            f"<li><code>{html.escape(item['file'])}:{item['line']}</code> — {html.escape(item['excerpt'])}</li>" for item in evidence
        ) or "<li>리스닝 서비스 설정 없음</li>"
        rows.append(
            f"""<tr data-state="{state}" data-search="{html.escape((project['name'] + ' ' + project['path'] + ' ' + project.get('note', '')).lower())}">
              <td class="num">{index}</td>
              <th scope="row"><strong>{html.escape(project['name'])}</strong><small>{html.escape(project['path'])}</small></th>
              <td class="ports front">{ports(project['frontend_ports'])}</td>
              <td class="ports back">{ports(project['backend_ports'])}</td>
              <td class="ports aux">{ports(project['auxiliary_ports'])}</td>
              <td><span class="state {'bad' if conflicts else 'ok' if state == '확정' else 'na'}">{state}</span>{f'<small>중복 {ports(conflicts)}</small>' if conflicts else ''}{f'<small>실행 중 {ports(actives)}</small>' if actives else ''}</td>
              <td>{html.escape(project.get('note', ''))}<details><summary>근거</summary><ul>{evidence_html}</ul></details></td>
            </tr>"""
        )
    collision_rows = "".join(
        f"<tr><th scope='row'>{html.escape(port)}</th><td>{html.escape(', '.join(owners))}</td></tr>" for port, owners in collisions.items()
    )
    unique_ports = {port for project in data["projects"] for key in ("frontend_ports", "backend_ports", "auxiliary_ports") for port in project[key]}
    reserved_ports = {int(port) for item in data.get("reservations", []) for port in (item["frontend_port"], item["backend_port"])}
    used_ports = unique_ports | reserved_ports
    front_start, front_end = data["policy"]["frontend_range"]
    back_start, back_end = data["policy"]["backend_range"]
    next_front = next(port for port in range(int(front_start), int(front_end) + 1) if port not in used_ports)
    next_back = next(port for port in range(int(back_start), int(back_end) + 1) if port not in used_ports)
    document = f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>코덱스 에이전트 포트 감사 — 2026-06-29</title>
<meta name="description" content="24개 AI 에이전트 프로젝트의 프론트엔드·백엔드·보조 포트와 충돌 감사표">
<style>
:root{{--bg:#f5f7fb;--panel:#fff;--ink:#172033;--muted:#667085;--line:#d8deea;--front:#075985;--back:#7c2d12;--aux:#4c1d95;--bad:#b42318;--good:#067647;--shadow:0 16px 40px rgba(20,32,60,.08)}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;line-height:1.55}}main{{max-width:1500px;margin:auto;padding:48px 24px 72px}}a{{color:#175cd3}}h1{{font-size:clamp(2rem,5vw,4rem);line-height:1.05;margin:.3rem 0 1rem;letter-spacing:-.04em}}.eyebrow{{font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;color:#175cd3;font-weight:800}}.lede{{max-width:78ch;color:var(--muted);font-size:1.08rem}}.cards{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:32px 0}}.card{{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:var(--shadow)}}.card b{{display:block;font-size:1.8rem}}.toolbar{{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:28px 0 14px}}input,select{{font:inherit;border:1px solid var(--line);border-radius:10px;background:#fff;padding:11px 13px}}input{{min-width:min(420px,100%);flex:1}}.table-wrap{{overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow)}}table{{border-collapse:collapse;width:100%;min-width:1180px}}caption{{text-align:left;padding:18px;font-weight:700}}th,td{{border-bottom:1px solid var(--line);padding:13px 12px;text-align:left;vertical-align:top}}thead th{{position:sticky;top:0;background:#eef2f8;z-index:1;font-size:.82rem}}tbody tr:hover{{background:#f8faff}}th small,td small{{display:block;color:var(--muted);font-weight:400;margin-top:4px;max-width:42ch;overflow-wrap:anywhere}}.num{{color:var(--muted);width:44px}}.ports{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:800;white-space:nowrap}}.front{{color:var(--front)}}.back{{color:var(--back)}}.aux{{color:var(--aux)}}.state{{display:inline-block;padding:3px 9px;border-radius:999px;font-size:.78rem;font-weight:800}}.state.bad{{background:#fee4e2;color:var(--bad)}}.state.ok{{background:#d1fadf;color:var(--good)}}.state.na{{background:#eaecf0;color:#475467}}details{{margin-top:7px}}summary{{cursor:pointer;color:#175cd3;font-size:.86rem}}details ul{{padding-left:18px;max-width:54ch}}code{{font-size:.78rem;overflow-wrap:anywhere}}.collisions{{margin-top:36px}}.collisions table{{min-width:0}}.policy{{margin-top:24px;background:#101828;color:#f2f4f7;border-radius:18px;padding:22px}}.policy code{{color:#84caff}}@media(max-width:900px){{.cards{{grid-template-columns:repeat(2,1fr)}}main{{padding:30px 14px}}}}@media(max-width:520px){{.cards{{grid-template-columns:1fr}}}}@media(prefers-reduced-motion:reduce){{*{{scroll-behavior:auto!important}}}}
</style></head><body><main>
<a href="index.html">← 표준 스킬 가이드</a><p class="eyebrow">Codex · Port Governance Audit</p>
<h1>에이전트 포트 감사표</h1>
<p class="lede">설정 파일과 실행 스크립트를 기준으로 24개 프로젝트의 프론트엔드·백엔드·보조 포트를 구분했습니다. 감사 시점에 실행 중인 대상 포트는 {len(active)}개였지만, 비활성 포트도 향후 실행 충돌을 막기 위해 예약 대상으로 취급합니다.</p>
<div class="cards"><div class="card"><span>감사 프로젝트</span><b>{len(data['projects'])}</b></div><div class="card"><span>고유 설정 포트</span><b>{len(unique_ports)}</b></div><div class="card"><span>충돌 포트군</span><b>{len(collisions)}</b></div><div class="card"><span>다음 예약 후보</span><b>{next_front} / {next_back}</b></div></div>
<div class="toolbar"><label for="search">검색</label><input id="search" type="search" placeholder="에이전트명·경로·비고 검색"><label for="filter">상태</label><select id="filter"><option value="">전체</option><option>충돌</option><option>확정</option><option>비해당</option></select><span id="count" aria-live="polite"></span></div>
<div class="table-wrap"><table><caption>기준 시각: {html.escape(data['audited_at'])}</caption><thead><tr><th>#</th><th>에이전트 / 경로</th><th>프론트</th><th>백엔드</th><th>보조·연계</th><th>상태</th><th>판정 및 근거</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div>
<section class="collisions"><h2>중복 포트</h2><div class="table-wrap"><table><thead><tr><th>포트</th><th>공유 프로젝트·역할</th></tr></thead><tbody>{collision_rows}</tbody></table></div></section>
<section class="policy"><h2>신규 에이전트 규칙</h2><p>프레임워크 기본값을 직접 쓰지 않습니다. <code>audit_ports.py reserve --name &lt;이름&gt; --project-root &lt;경로&gt;</code>로 프론트 5200–5499, 백엔드 8800–9199 범위에서 원자적으로 예약하고, 실행 직전 다시 점유를 검사합니다.</p></section>
</main><script>
const q=document.getElementById('search'),f=document.getElementById('filter'),rows=[...document.querySelectorAll('tbody tr[data-state]')],count=document.getElementById('count');
function apply(){{const needle=q.value.trim().toLowerCase(),state=f.value;let shown=0;for(const row of rows){{const yes=(!needle||row.dataset.search.includes(needle))&&(!state||row.dataset.state===state);row.hidden=!yes;if(yes)shown++}}count.textContent=`${{shown}}개 표시`;}}
q.addEventListener('input',apply);f.addEventListener('change',apply);apply();
</script></body></html>"""
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(document, encoding="utf-8")
    print(f"Rendered {len(data['projects'])} projects to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
