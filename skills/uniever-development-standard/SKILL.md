---
name: uniever-development-standard
description: Apply Uniever Co., Ltd. AI team development standards as the authoritative company guideline for software work, including lifecycle gates, document approval, requirements/design traceability, AI authority limits, coding, testing, security, deployment, operations, project folder structure, harness and loop engineering, and mandatory stop conditions. Use when interpreting or enforcing the Uniever standard, standardizing a project, creating or auditing required artifacts, selecting T0-T3 engineering methods, or resolving conflicts between implementation requests and the company development guideline.
---

# Uniever Development Standard

Use this skill as the authoritative Uniever(주) AI team development-standard reference. AI output is a draft until a responsible human approves it. Do not decide business rules, data meaning, security level, or final acceptance without approved human-owned evidence.

The preserved source standard is in [references/source-standard](references/source-standard). Load only the files needed for the current decision.

## Mandatory seven-skill baseline

Every user request starts with these seven skills as the mandatory baseline: `uniever-development-standard`, `dev-standard-control-tower`, `karpathy-guidelines`, `understand-codebase`, `superpowers-workflow`, `test-driven-development`, and `verification-before-completion`. All other skills remain available in `skills/` and are selected only when the request signal requires them. For non-code work, TDD is recorded as an applicability/acceptance check when no software test is applicable.

Use `standard-skill-catalog.json` as the machine-readable selection contract. A receiving agent should generate a request/profile selection plan, review the conditional reasons and rejected candidates, dry-run the selected port, and verify the resulting manifest before project work. The catalog does not replace any selected `SKILL.md`; it prevents arbitrary or untraceable loading.

## Conditional visual-first routing

Select the conditional `visualize` skill when a request asks for a screen mockup, screen composition check, UI preflight, screen flow, visual design, architecture diagram, process flow, ERD, chart, data graph, knowledge graph, dashboard, Mermaid, Excalidraw, or visualization validation. For UI preflight, route `visualize` → `screen-review` → `frontend-design` / the UI standard after the mandatory seven and before implementation. `screen-review` is conditional and does not change the exactly-seven baseline. It produces one receiving-project Markdown review deck with source snapshot, evidence IDs, privacy, validation, accessibility checks, state coverage, raw Markdown fallback, and `owner_approval: approved` before HTML implementation. Marp/presenterm are optional renderers only and must not be auto-installed or connected. `visualize` routes existing specialist skills and does not replace the UI, database, lineage, dashboard, or ERP/MES graph contracts.

## Scope boundary for insurance work

This skill governs software-development governance, approvals, requirements, design, implementation, installation, testing, security, deployment, operations, and AI authority. It does not define insurance coverage meaning, policy interpretation, detailed coverage classification, customer conclusions, or insurance-report delivery rules. Use the insurance coverage-analysis skill and the project insurance `표준지침/` for those domain decisions; if the development standard and insurance-domain rules conflict, report the conflict and stop.

## Read First

- Overview, version, document map, levels, and immediate stop conditions: [README.md](references/source-standard/README.md)
- Agent execution priority, autonomous-work boundaries, approval-required work, and completion report: [AGENTS.md](references/source-standard/AGENTS.md)
- Governance, roles, gates, approval, exceptions: [01_개발거버넌스.md](references/source-standard/01_개발거버넌스.md)
- Lifecycle procedure from intake to closure: [02_프로젝트수행절차.md](references/source-standard/02_프로젝트수행절차.md)
- Requirements, process, UI, DB, traceability: [03_요구사항및설계.md](references/source-standard/03_요구사항및설계.md)
- AI authority, automation, stop rules, execution records: [04_AI개발표준.md](references/source-standard/04_AI개발표준.md)
- Coding, repository, review, configuration management: [05_코딩및형상관리.md](references/source-standard/05_코딩및형상관리.md)
- Quality gates, tests, HTML screen-baseline handling: [06_테스트및품질.md](references/source-standard/06_테스트및품질.md)
- Security, privacy, secrets, supply chain, AI input handling: [07_보안및개인정보.md](references/source-standard/07_보안및개인정보.md)
- Deployment, rollback, logs, incident response: [08_배포및운영.md](references/source-standard/08_배포및운영.md)
- Document IDs, versions, date folders, development ledger: [09_문서및기록관리.md](references/source-standard/09_문서및기록관리.md)
- Project directory contract: [10_프로젝트폴더표준.md](references/source-standard/10_프로젝트폴더표준.md)
- T0-T3 engineering, harnesses, bounded loops, operational control: [11_하네스및루프엔지니어링.md](references/source-standard/11_하네스및루프엔지니어링.md)

## Precedence

Apply this order:

1. Law, contract, security, and privacy obligations
2. Approved requirements and design documents
3. This Uniever development standard
4. Project `AGENTS.md`
5. Individual task instruction
6. AI judgment

If a lower-priority instruction conflicts with a higher-priority rule, do not execute it. Report the conflict, the affected artifact or request, and the required human decision.

## Operating Loop

1. Classify the request by project level L1-L4, AI authority A0-A3, engineering method T0-T3, operational impact, data/security risk, owners, scope, exclusions, and measurable completion conditions.
2. Confirm that approved requirements, related design, impacted artifacts, test method, and resource limits exist for implementation work. If missing or contradictory, stop code changes and request or draft the required document update.
3. Link every nontrivial result to requirement IDs, design items, code changes, tests, evidence, and approval state.
4. Enforce gate order: requirements and design before development; quality approval before deployment; closure documents only on explicit closure preparation or human instruction.
4a. Apply the visual-first rule: screen composition, UI preflight, screen-flow, and screen-review work routes `visualize` → conditional `screen-review` → HTML/UI implementation. Before HTML implementation, the receiving agent must create one canonical Markdown review deck and record the source snapshot, requirement/design/API/DB/test evidence IDs, privacy status, validation, accessibility checks, normal/loading/empty/validation-error/server-error/permission-denied/long-text state coverage, raw Markdown fallback, and `owner_approval: approved`. Missing or unapproved review is a G2 stop. UI work then requires the approved HTML screen baseline; non-UI work still requires an appropriate architecture, process, ERD, lineage, graph, or data visualization before implementation or analysis execution.
5. For UI work, apply the UI standard skill in [skills/UI_개발표준_SKILL.md](references/source-standard/skills/UI_개발표준_SKILL.md).
6. For T1 or higher work, apply [하네스_엔지니어링_SKILL.md](references/source-standard/skills/하네스_엔지니어링_SKILL.md). For T2-T3, also apply [하네스_루프_엔지니어링_SKILL.md](references/source-standard/skills/하네스_루프_엔지니어링_SKILL.md).
7. Before tests or automation, set explicit iteration, timeout, cost, concurrency, data-size, cleanup, and cancellation limits that avoid system instability.
8. Record changes, tests, unresolved risks, approval state, and decisions in the project ledger or designated activity record using KST 24-hour timestamps.
9. Treat the standard pack as portable instructions for a receiving agent; it does not perform a target project's domain work by itself.
10. Default third-party tooling to free, open-source, publicly inspectable sources. Do not auto-install or connect commercial, paid, subscription, credential-gated, or separately authenticated tools.

## Mandatory user-request work ledger

For every user work request, create or open one request-specific record under `docs/작업대장/` before execution. Use `작업이력대장_<YYYY-MM-DD>_<작업명>.md` and record every item as a checkbox containing:

- `년월일`: the KST calendar date in `YYYY-MM-DD` format;
- `요청내용`: the user's request, preserved without changing its intent;
- `작업내용`: the concrete work performed and changed paths;
- `결과`: the verification result, remaining risk, or approval state.

At completion, compare the record with the actual work and fresh verification evidence. Check an item only when its work and evidence are complete. Mark any incomplete or unsupported item `누락`, do not report completion, and resume the missing work before performing the comparison again. The ledger is an activity record and does not replace canonical requirements, design, approval, or test documents.

## Immediate Stop Conditions

Stop implementation or automated execution when any of these are true:

- Approved requirements conflict with the current instruction.
- Business rules, data definitions, or acceptance conditions have multiple plausible meanings.
- Personal information, secrets, credentials, or operational data may be exposed.
- Deletion, mass change, migration, deployment, force push, or other hard-to-recover work lacks approval.
- Tests or automation may destabilize the system.
- AI or tool execution exceeds defined count, time, cost, or resource limits.
- T1 or higher work lacks a harness contract; T2-T3 work lacks loop limits, checkpoints, or cancellation control.

## Completion Report

Include changed artifacts, applied standard sections, gate reached, approval state, verification commands and results, unverified checks, residual risks, and the next required human decision. Never claim compliance only because templates exist; required fields must contain project-specific, reviewable content.
