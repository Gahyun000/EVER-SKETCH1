# Sketch-derived control-tower contract

Use this contract when governing project intake, UI work, documentation, or a compliance audit. It preserves every item under the source checklist's **핵심 철학**, **표준 SKILL**, and **docs 폴더를 생성하여 문서를 만들 것** branches. Apply the approved-standard resolutions below where the sketch conflicts with canonical-document governance.

## Core philosophy

1. Do not entrust or defer the result to AI. Treat AI output as a draft; human-approved documents and verified evidence are authoritative.
2. Prepare human-verified documents first and make AI develop from those documents.
3. Before self-testing completed code, assess memory and other system-failure risks. Bound CPU/GPU, concurrency, data size, timeout, disk use, cleanup, and stop conditions.
4. Write a technical document for core technology or engine work. Include design, interfaces, dependencies, decisions, limits, failure modes, verification, operation, and linked requirement/code/test IDs.
5. Record every work session in the shared development ledger.
6. If required intake documents are absent or insufficient, stop implementation, recommend their creation, and prioritize completing and approving them.
7. At project start and before important work, establish a plan first and recommend planning to the user. Record scope, priority, dependencies, risks, resources, gates, owners, and measurable completion conditions.

## Standard SKILL contract

Apply [ui-contract.md](ui-contract.md) to every applicable menu and screen. Do not mark G2/G3/G4 complete until the following full subtree is implemented and verified:

- **Common / overall screen concept and structure**
  - Display dates and times in Korean Standard Time using the 24-hour clock unless an approved requirement says otherwise.
  - Use project-owned alert and confirmation components; do not use browser-native workflow dialogs.
  - Isolate every modal from its parent: lock background scroll, contain modal scroll, trap and restore focus, and support keyboard operation.
  - Prevent accidental two-line cells and one-character vertical wrapping with intentional width, wrapping, ellipsis, tooltip, and responsive rules.
  - For analysis, show sanitized real-time execution logs in a modal, including execution ID, stage, progress, state, KST timestamps, cancellation where supported, bounded retention, and final state.
- **Search/list screen**
  - Provide start date, end date, search term, and search action.
  - Provide pagination.
  - Open details by row/list selection and do not add a redundant detail button; preserve keyboard access.
- **New registration screen**
  - Define fields, labels, types, required/default values, client/server validation, duplicate checks, pending and double-submit handling, unsaved-change handling, success navigation, failure preservation, permission errors, and concurrency conflicts.
- **Buttons**
  - Require the project-owned confirmation component for execute, save, delete, and modify actions.
- **Per-menu details**
  - Maintain a menu matrix with menu, screen ID/type, purpose, role, entry path, fields, actions, API, loading/empty/error/permission states, requirement IDs, and test IDs.

## `docs` creation and records contract

Create `docs` and all nine required categories:

```text
docs/
├── 공통/
├── 기획/
├── 개발일지/
├── 계획/
├── 분석/
├── 검토/
├── 협업/
├── 기술문서/
└── 아이디어/
```

Apply these rules:

1. Use date directories for activity records under `개발일지`, `계획`, `분석`, `검토`, `협업`, and `아이디어`. Keep canonical documents and indexes at stable paths so links and version control remain reliable. This is the approved resolution of the sketch statement that every folder must be created under today's date.
2. Put agent name and date in generated activity-record filenames. Keep stable canonical filenames or a stable `docs/index.md` pointer where universal renaming would break the canonical path. This is the approved resolution of the sketch statement that every document filename must contain agent and date.
3. Put requests and replies in the dated `협업` folder. Include the session ID in each filename and use the request's same session ID for its reply.
4. Maintain one shared tabular development ledger. At minimum record KST date/time, session ID, agent name, category (`일반`, `요청`, `회신`, `검토`, `계획`, `분석`, `결과`), work name, and completion state. Also record linked requirement/defect IDs, changed paths, verification result, and approval when available.
5. Create and update category-specific content:
   - `공통`: glossary, roles, shared rules, canonical document pointer.
   - `기획`: goal, scope, priorities, requirements, decisions.
   - `개발일지`: the shared ledger and implementation history.
   - `계획`: task/project plans, dependencies, risks, resource limits, completion conditions.
   - `분석`: sources, facts, assumptions, gaps, contradictions, impact.
   - `검토`: reviews, gate evidence, exceptions, unresolved findings.
   - `협업`: session-linked requests, replies, and handoffs.
   - `기술문서`: core technology/engine design, operation, constraints, and evidence.
   - `아이디어`: unapproved proposals clearly separated from requirements.

Creating directories or blank templates is not compliance. Populate project-specific content, link it from the document index and requirements trace, and record review/approval state.
