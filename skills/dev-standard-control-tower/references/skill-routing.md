# Routing the governed skills

The control tower keeps gate state. Every user request starts with the mandatory seven below; the remaining skills stay available and are selected only when the request signal requires them. Read each selected SKILL completely before using it.

## Mandatory seven

1. `uniever-development-standard` — authoritative standard and conflict decision
2. `dev-standard-control-tower` — lifecycle, gate, document, and evidence orchestration
3. `karpathy-guidelines` — minimal and safe change constraints
4. `understand-codebase` — repository context before change
5. `superpowers-workflow` — reviewable plan and execution flow for multi-step work
6. `test-driven-development` — acceptance-first implementation discipline
7. `verification-before-completion` — fresh evidence before completion

These seven are the baseline routing set, even when a non-code task records TDD as an acceptance/test applicability check rather than writing software tests.

| Signal | Route | Relationship |
|---|---|---|
| lifecycle intake, full project standard, compliance audit, docs or one-click launch | `dev-standard-control-tower` | owner/orchestrator |
| unclear creative feature or multi-step implementation | `superpowers-workflow` | planning/execution route inside the current gate |
| any scoped code change | `karpathy-guidelines` | minimal, safe implementation constraints |
| unfamiliar repository | `understand-codebase` | read-only map before design/change |
| new behavior or defect implementation | `test-driven-development` | RED-GREEN-REFACTOR inside G3 |
| bug, failure, flaky or unexpected output | `systematic-debugging` | root cause before fix |
| received review feedback | `receiving-code-review` | verify technical validity before applying |
| any completion claim | `verification-before-completion` | fresh evidence at every gate exit |
| UI design or implementation | `frontend-design` | use with approved HTML/UI contract; aesthetics cannot override it |
| screen composition check, UI preflight, screen flow, or screen review | `visualize` → `screen-review` → `frontend-design` / UI standard | after the mandatory seven and before implementation; require one owner-approved Markdown review deck with state coverage, evidence IDs, snapshot, privacy, validation, accessibility checks, and raw Markdown fallback before HTML implementation |
| architecture/process diagram, ERD, data chart, knowledge graph, dashboard, Mermaid, Excalidraw, or non-UI visual validation | `visualize` | retain the existing specialist route, portable canonical source, and documented fallback |
| bounded agent/tool loop | `harness-loop-engineer` | T2/T3 design under approved harness controls |
| data understanding and modeling | `modeling-harness-loop` | T-level/resource gates still apply |
| explicit classification metric target | `ml-performance-harness` | after baseline modeling, one-change experiment loop |
| multi-agent roles/handoffs | `agent-handovers` | one orchestrator owns state and every handoff is validated |
| independent quality iteration | `evaluator-optimizer` | evaluator cannot alter acceptance criteria |
| persistent decision/preferences | `agent-memory` | memory is not canonical project state or approval evidence |
| Korean prose revision | `humanizer` | preserve technical meaning, IDs, status, and citations |
| video evidence | `watch-video` | privacy, copyright, tool, and resource constraints apply |
| uncertain skill choice | `find-skills` | prefer installed skills; audit before external install |

Typical order: mandatory seven → signal-specific conditional skill(s) → independent verification → gate evidence. Use the repository `standard-skill-catalog.json` and `scripts/select_standard_skills.py` to record the request/profile, reasons, rejected candidates, and dependency order. `screen-review` is conditional, never an eighth mandatory skill. Its raw Markdown deck is canonical; Marp/presenterm may be used only when already available and approved, and are never auto-installed or connected. Conditional skills may run only within the authority and current gate assigned by the control tower.
