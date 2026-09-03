---
name: visualize
description: Create evidence-backed visual artifacts for UI screens, architecture, process flows, ERDs, data charts, knowledge graphs, and ERP/MES relationships. Use when a request asks to visualize, diagram, mock up, chart, map dependencies, show lineage, or validate a visual design; route existing specialist skills and keep a portable source plus a documented fallback.
---

# Visualize

Create a reviewable visualization bundle before implementation or analysis execution when the request has a visual dimension. Keep the canonical source in the receiving project and connect every important visual element to evidence.

## Workflow

1. Classify the request as UI, architecture/process, database/ERD, ERP/MES graph, knowledge graph, or numeric data.
2. Check scope, source files, snapshot/commit, privacy risk, owner, and approval state. Do not read or expose unapproved operational data.
3. Assign a stable `VIS-<TYPE>-<SERIAL>` ID and choose the canonical source format.
4. Route the minimum specialist skills needed. Do not duplicate their analysis:
   - UI preflight: `screen-review` first, then `frontend-design` and the project UI standard after the review deck is owner-approved.
   - Code structure: `understand-codebase` or `understand-domain`.
   - Database: `understand-database` and `understand-erd`.
   - Lineage: `understand-data-lineage`.
   - Knowledge graph: `understand-knowledge` and, when available, `understand-dashboard`.
   - C# ERP/MES: `erp-mes-reverse-analysis` followed by `erp-mes-graph-engineering`.
5. Create the canonical source before rendered outputs. Use the routing matrix in [references/tool-matrix.md](references/tool-matrix.md).
6. Render the requested output when a permitted local renderer is already available. If it is absent, keep the source and produce the documented Markdown/table/static fallback; do not auto-install a tool merely to render.
7. Attach requirements, design, code, database, graph, or test evidence IDs to the visualization and label relationships `confirmed`, `inferred`, or `unknown`.
8. Validate syntax/structure, links, snapshot consistency, readability, accessibility, privacy, fallback readability, and approval state.
9. Record the bundle path, command, result, unresolved risk, and owner approval in the receiving project's ledger.

## Visual-first rule

- UI changes follow `visualize` → `screen-review` → `frontend-design` / project UI standard. Before HTML implementation, the receiving agent creates one canonical Markdown screen-review deck under the `screen-review` page contract and records `source_snapshot`, evidence IDs, privacy status, validation, accessibility checks, and `owner_approval: approved`.
- The approved screen-review deck precedes, but does not replace, the HTML screen baseline. The HTML baseline includes normal, empty, loading, validation-error, server-error, permission-denied, and interaction-pending states as applicable.
- Non-UI changes require the most relevant architecture, process, ERD, lineage, graph, or data visualization before implementation or analysis execution.
- A visualization is a review criterion, not a substitute for approved requirements, API/DB design, security review, tests, or human acceptance.
- Interactive UI must provide keyboard access, text alternatives, visible focus, adequate contrast, and a `prefers-reduced-motion` path.

## Portable boundaries

- Keep canonical sources in Markdown, HTML, Mermaid, JSONL/JSON, CSV, or Excalidraw JSON.
- Treat Excalidraw, Plotly, Matplotlib, D3, Recharts, and Chart.js as optional renderers, never as mandatory dependencies.
- Do not install or connect commercial, paid, subscription, credential-gated, or separately authenticated tools.
- Do not claim that this standard-pack skill performed target ERP/MES business analysis; the receiving agent performs that work.
- This standard pack does not create target-project screens or ERP/MES business results; it supplies the route and review contract for the receiving agent.
- Never place secrets, personal data, customer identifiers, production values, or unapproved screenshots in a visualization.

## Required bundle fields

Every bundle must record:

```yaml
visualization_id: VIS-<TYPE>-<SERIAL>
purpose: <review question>
source_snapshot: <commit/schema/file snapshot and KST timestamp>
source_refs: [<requirement/design/code/db/graph IDs>]
canonical_source: <relative path>
rendered_outputs: [<relative paths>]
confidence: confirmed | inferred | unknown
privacy: <masking or synthetic-data statement>
validation: <commands and results>
owner_approval: draft | review | approved | blocked
```

## Completion gate

Do not report the visualization complete until the canonical source exists, the output or fallback is readable, evidence and snapshot are attached, sensitive data is excluded, accessibility is checked for UI, and the validation result is recorded.
