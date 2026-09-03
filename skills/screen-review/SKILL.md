---
name: screen-review
description: Create one portable Markdown screen-review page-deck before UI implementation, covering layout, navigation, states, traceability, privacy, validation, and owner approval. Use when a request asks to design, review, mock up, or validate application screens or screen flows before implementation.
---

# Screen Review

Create a receiving project's screen-review document before implementing UI. `screen-review` is conditional; the mandatory baseline remains exactly seven skills. This skill owns the review contract, not the target project's screens, APIs, databases, ERP/MES analysis, or business decisions.

## Workflow

1. Classify the preflight input as a UI screen or screen-flow request. Read the supplied requirements/design and identify the receiving-project boundary. Do not begin UI implementation from an unreviewed request.
2. Capture `source_snapshot` (commit or document revision plus KST time), `source_refs`, owner, approval state, and `privacy: synthetic-or-masked-data-only`. Never copy secrets, personal data, production values, or unapproved screenshots.
3. Assign a stable `SCR-REV-<serial>` ID. Create exactly one Markdown source in the receiving project, normally `docs/화면검수/SCR-REV-<serial>.md`.
4. Build the page-deck using the contract in [references/markdown-page-contract.md](references/markdown-page-contract.md). Keep the Markdown readable without a renderer; Marp or presenterm are optional and must already be permitted and available.
5. Validate front matter, page count, `page-N` anchors, `페이지 N / 전체` labels, previous/next link targets, unique screen IDs, state coverage, traceability, privacy, and fallback readability. Record commands and results in `validation`.
6. Record issues, unknown/inferred decisions, unresolved questions, and owner approval. Keep `owner_approval` as `draft` or `review` until the responsible owner explicitly approves.

## Implementation gate

Block UI implementation or a target-project result until `owner_approval: approved` and all of these checks are satisfied:

- Every screen is linked to requirement IDs; each major screen has purpose, permission, entry, exit, and exception paths.
- Layout, components, button/input behavior, navigation targets, API/DB/test links, and confirmed/inferred/unknown status are shown.
- Normal, loading, empty, validation-error, server-error, permission-denied, and long-text states are covered or explicitly marked not applicable.
- Keyboard access, focus, contrast, responsive/small-screen behavior, and sensitive-data handling are checked.
- Issues and decisions have owners/status, and the document records the approval state.

If approval is rejected, revise the same deck and revalidate. Route approved UI work directly to `frontend-design` or the receiving project's UI standard as appropriate. Do not route approved work back to `visualize`, and do not implement receiving-project screens from this standard-pack skill.

## Boundaries and tools

Keep the canonical source in the receiving project. Use only synthetic or masked data. Do not auto-install or connect paid, subscription, credential-gated, separately authenticated, or unapproved tools. If an optional renderer is unavailable or requires unapproved access, record `unavailable` or `blocked` and use the raw Markdown fallback.
