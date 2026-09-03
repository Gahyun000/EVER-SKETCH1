# Visualize Tool Matrix

## Contents

- [Selection matrix](#selection-matrix)
- [Artifact contract](#artifact-contract)
- [Validation checklist](#validation-checklist)
- [Fallback policy](#fallback-policy)

## Selection matrix

| Request signal | Canonical source | Preferred result | Required specialist route | Fallback when renderer is unavailable |
|---|---|---|---|---|
| Screen composition check, UI preflight, screen flow | One `screen-review` Markdown page deck | Owner-approved review deck, then HTML baseline with state variants | `visualize` → `screen-review` → `frontend-design` + UI standard | Raw Markdown deck with page anchors, separators, and text wireframes; optional Marp/presenterm only when already approved and available |
| Architecture, module, API, process, sequence | Mermaid in Markdown or `.mmd` | Mermaid diagram linked to evidence | `understand-codebase`, `understand-domain`, or `understand-api-integration` | Text flow with the same node/edge IDs |
| Database relationship, ERD | Mermaid `erDiagram` | Domain ERD and relationship evidence table | `understand-database` + `understand-erd` | Table list with PK/FK/cardinality and evidence |
| ERP/MES business relationship | JSONL/JSON graph | Mermaid context/impact views and graph index | `erp-mes-reverse-analysis` → `erp-mes-graph-engineering` | Evidence cards and Markdown relationship tables |
| Data profile, KPI, time series | CSV/JSON plus chart specification | SVG/HTML chart and summary table | `modeling-harness-loop` only when modeling is requested | Mermaid xychart or Markdown table |
| Knowledge graph | JSON graph plus Markdown | Static dashboard or graph views | `understand-knowledge` + optional `understand-dashboard` | Markdown entity/relationship index |
| Editable architecture diagram | Excalidraw JSON | `.excalidraw` plus optional SVG/PNG | Existing domain/code/graph route as appropriate | Mermaid source |

The matrix selects a source format before selecting a renderer. The source must remain usable in a plain Git checkout.

## Artifact contract

Store the bundle under `docs/시각화/` or an approved equivalent in the receiving project. The standard pack defines the contract but does not create target-project domain output by itself.

Required fields:

| Field | Rule |
|---|---|
| `visualization_id` | Stable `VIS-<TYPE>-<SERIAL>`; do not reuse after meaning changes. |
| `purpose` | State the decision or review question the visual answers. |
| `source_snapshot` | Include source paths, commit/schema revision, tool versions when used, and KST execution time. |
| `source_refs` | Link requirements, design items, source symbols, tables, graph nodes, or tests. |
| `canonical_source` | Point to the version-controlled HTML, Mermaid, JSONL/JSON, CSV, or Excalidraw file. |
| `rendered_outputs` | List actual HTML/SVG/PNG/Markdown outputs; do not list planned files. |
| `confidence` | Separate confirmed facts, evidence-based inferences, and unknowns. |
| `privacy` | State masking, synthetic data, aggregation, or why no sensitive data is present. |
| `validation` | Record commands, checks, result, and unresolved issue IDs. |
| `owner_approval` | Use `draft`, `review`, `approved`, or `blocked`; AI output remains a draft until human approval. |

For UI preflight, the receiving project keeps exactly one canonical Markdown review deck following `screen-review`'s page contract. It must cover the screen list, transitions, component layout, normal/loading/empty/validation-error/server-error/permission-denied/long-text states, requirements/API/DB/test evidence IDs, privacy status, validation, accessibility checks, source snapshot, and `owner_approval: approved` before HTML implementation. The raw Markdown deck is the portable fallback; Marp or presenterm is optional and must not be installed or connected automatically.

For graphs, also preserve node IDs, edge IDs, relationship type, evidence path, scope/site, observed-at time, and source confidence. For data charts, preserve metric definition, aggregation, unit, period, missing-value handling, sampling, and denominator.

## Validation checklist

- [ ] Canonical source exists and is parseable by its declared format.
- [ ] Mermaid blocks render or have a readable text/table fallback.
- [ ] HTML has a title, landmark structure, keyboard focus, visible state messaging, and reduced-motion behavior where applicable.
- [ ] ERD relationships distinguish declared keys from inferred joins.
- [ ] Graph nodes and edges have stable IDs and source evidence.
- [ ] Chart axes, units, time zone, aggregation, and denominator are explicit.
- [ ] Input snapshot and output timestamp are recorded in KST.
- [ ] Secrets, personal data, customer identifiers, production values, and unsafe screenshots are absent or masked.
- [ ] Local links resolve and output paths match the ledger.
- [ ] Owner approval is not inferred from generation or validation success.

## Fallback policy

Use the first available fallback in this order:

1. Source plus native Markdown rendering.
2. Source plus a plain Markdown table or text flow with identical IDs.
3. Static SVG/HTML generated without adding a dependency.
4. Stop and record `blocked` when the requested visual meaning cannot be preserved safely.

Never replace a missing renderer by installing a paid service, requesting an unapproved credential, connecting to a live database, or embedding sensitive data.
