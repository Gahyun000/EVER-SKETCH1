---
name: dev-standard-control-tower
description: Govern a software project as the Uniever development-standard control tower from intake through handover using the uniever-development-standard guideline, human-approved documents, mandatory planning and documentation stops, resource-safe verification, the standard UI SKILL contract, the complete docs tree and ledger rules, quality gates, routed use of the other standard skills, collision-safe ports, project scaffolding, and verified one-click startup. Use when starting or standardizing a project, auditing lifecycle/UI/docs/port compliance, generating required documents, coordinating skills, reserving ports, or preparing run, quality, deployment, and handover evidence.
---

# Dev Standard Control Tower

Treat approved human-owned documents as the source of truth. AI output remains a draft until the responsible human approves it. This skill coordinates the governed skills; it does not enlarge their authority or bypass system, user, security, privacy, or repository rules.

## Mandatory seven-skill baseline

Every user request starts with these seven skills as the mandatory baseline: `uniever-development-standard`, `dev-standard-control-tower`, `karpathy-guidelines`, `understand-codebase`, `superpowers-workflow`, `test-driven-development`, and `verification-before-completion`. The other skills remain in `skills/` and are loaded only when the request signal requires them. For non-code work, TDD is recorded as an applicability/acceptance check when no software test is applicable.

Use the repository-root `standard-skill-catalog.json` with `scripts/select_standard_skills.py` to make conditional selection reproducible. Use `scripts/port_standard_skills.py --selection <plan>` for approved copying and `scripts/verify_standard_skills.py` before the receiving agent begins work. A selection plan must preserve the exact mandatory seven, reasons, order, rejected candidates, catalog version, and source commit.

Act as the development-guideline control tower: own the lifecycle state, gate decisions, standard interpretation, routed-skill boundaries, evidence index, and stop/advance decision. Do not silently delegate this ownership to an implementation skill.

When a task asks to apply, interpret, audit, or update Uniever(주) development standards, use `uniever-development-standard` as the authoritative standard source, then use this control tower for project orchestration, document generation, port governance, launcher generation, and gate evidence.

## Scope boundary with insurance analysis

This skill governs software-development lifecycle, approvals, implementation, installation, testing, security, deployment, operations, and evidence. It does not define insurance coverage meaning, policy interpretation, detailed coverage classification, customer conclusions, or insurance-report delivery rules. Route those domain decisions to the insurance coverage-analysis skill and the project insurance `표준지침/`; if development rules and insurance-domain rules conflict, report the conflict and stop.

## Read First

Read only the references needed for the current gate:

- Governance, gates, precedence, and stop conditions: [governance.md](references/governance.md)
- Required project folders, documents, naming, and templates: [documentation-contract.md](references/documentation-contract.md)
- Skill routing and composition: [skill-routing.md](references/skill-routing.md)
- Markdown screen design and UI completion rules: [ui-contract.md](references/ui-contract.md)
- Testing, security, deployment, and evidence: [quality-and-operations.md](references/quality-and-operations.md)
- One-click startup and automatic dependency installation: [one-click-runtime.md](references/one-click-runtime.md)
- Existing-agent audit, shared port registry, and reservation rules: [port-governance.md](references/port-governance.md)
- Exact sketch-derived core philosophy, standard SKILL, and `docs` subtree requirements: [sketch-control-tower-contract.md](references/sketch-control-tower-contract.md)
- Full source standard index and preserved audit evidence: [source-index.md](references/source-index.md)

## Non-Negotiable Precedence

Apply this order: law/contract/security/privacy → approved requirements and designs → `uniever-development-standard` / company standard → project `AGENTS.md` → task instruction → model judgment. Report conflicts and do not execute the lower-priority instruction.

The approved standard resolves sketch conflicts. In particular:

- Do not deploy immediately after development. G4 quality approval precedes G5 deployment.
- Use date folders for activity records, not duplicated canonical documents.
- Create `end_docs` content only on explicit human instruction or when preparing G6 closure.
- Do not begin implementation while mandatory inputs are absent, contradictory, or untestable.

## Control Loop

1. **Classify.** Determine L1-L4 project level, A0-A3 AI authority, T0-T3 engineering level, scope, exclusions, owners, resources, measurable completion conditions, and whether the project exposes frontend/backend listeners.
2. **Plan before execution.** At project start and for important work, establish a reviewable plan containing scope, priorities, dependencies, risks, resource limits, gates, owners, and measurable completion conditions. Recommend plan approval to the user when it is absent.
3. **Build the trace.** Assign requirement and acceptance IDs. Link each requirement to approved process, screen/HTML, API, DB, security, code, and test evidence as applicable.
4. **Enforce the gate.** Evaluate G0-G6 from [governance.md](references/governance.md). If a required artifact or approval is missing, incomplete, contradictory, or untestable, stop implementation and create or repair the document first.
4a. **Enforce visual-first evidence.** When the request has a visual dimension, route `visualize` after the mandatory seven and before implementation or analysis execution. For screen composition, UI preflight, screen-flow, or screen-review requests, route `visualize` → conditional `screen-review` → `frontend-design` / project UI standard. Before HTML implementation, require one canonical Markdown review deck with source snapshot, requirement/design/API/DB/test evidence IDs, privacy status, validation, accessibility checks, page-state coverage, and `owner_approval: approved`. The raw Markdown deck is the fallback; Marp/presenterm remain optional and are never auto-installed or connected. Non-UI work still requires the appropriate architecture/process/ERD/lineage/graph/data visual with the same evidence fields.
5. **Route skills.** Select the minimum sufficient set from [skill-routing.md](references/skill-routing.md), announce the order, and read each selected skill completely. Before any work action, output the selected skill name, exact `SKILL.md` path, selection reason, scope, and rejected candidates. If no skill applies, explicitly output `적용 스킬 없음 — 일반 작업 절차로 진행`. A skill may be recorded as used only when it was announced, read completely, applied to the work, and supported by evidence; never infer skill usage retrospectively. For standard interpretation or conflict resolution, route through `uniever-development-standard` first. The control tower owns lifecycle state; a routed skill owns only its bounded task.
6. **Execute narrowly.** Preserve user changes, follow existing repository patterns, reserve ports from the shared registry before generating launchers, install only approved locked dependencies, and keep external effects behind explicit approval checkpoints.
7. **Verify safely and independently.** Before tests, inspect available memory/CPU/GPU and set concurrency, timeout, data-size, cleanup, and stop limits that avoid system instability. Use deterministic checks and fresh execution evidence. An LLM's confidence, prose claim, or self-authored test alone is not acceptance.
8. **Record.** Update the shared tabular development ledger for every work session, plus the document index, requirement trace, change history, test evidence, unresolved risks, and approval state. Write a technical document for core technology or engine work. Use KST 24-hour timestamps.
9. **Keep the standard portable.** The standard-pack repository provides instructions and contracts; a receiving agent performs the target project's domain work within approved scope.
10. **Enforce the free/open-source boundary.** Do not auto-install or connect commercial, paid, subscription, credential-gated, or separately authenticated tools. Record candidate tools and mark unapproved or unverifiable tools `미적용`.

## User-request work ledger gate

Before any work action for a user request, create a request-specific Markdown record under `docs/작업대장/` using `작업이력대장_<YYYY-MM-DD>_<작업명>.md`. The record must contain checkbox items for `년월일`, `요청내용`, `작업내용`, and `결과`, using KST dates and concrete changed paths or evidence.

During the work, keep the record current. At the completion gate, perform a line-by-line comparison against the actual diff, command output, and approval state:

1. Check each item whose work and evidence are complete.
2. Mark every incomplete, contradictory, or unsupported item as `누락`.
3. Do not advance or report completion while a `누락` item remains.
4. Resume the missing work, update the record, and repeat the comparison until all required items are checked or the work is explicitly blocked/cancelled.

The work ledger is required activity evidence; it does not replace canonical requirements, design, quality, security, or approval documents.
9. **Advance or stop.** Advance only when the current gate is evidenced. Otherwise finish as blocked, failed, cancelled, limit-exceeded, or waiting-approval—never as a false success.

## Gate Summary

| Gate | Required outcome | Hard stop |
|---|---|---|
| G0 Intake | Goal, scope, roles, level, risks, source inventory | Undefined owner/scope |
| G1 Requirements | IDs, measurable acceptance, glossary, trace, human approval | Missing or conflicting requirements |
| G2 Design | Process, approved UI preflight Markdown deck before HTML/screens for UI (or architecture/process/ERD/lineage/graph/data visual for non-UI), API, DB, security, T-level/harness design approved | Missing or unapproved UI review deck, missing visual baseline, UI without approved exceptional-state baseline, or untraceable visual evidence |
| G3 Development | Reviewed code, unit/static checks, technical docs, project-specific Windows/macOS launchers | Generic/unverified runner or undocumented core logic |
| G4 Quality | Integration, regression, security, performance, harness/resource tests and evidence | Blocker/Critical, untested approved requirement |
| G5 Deployment | Approved deployment, rollback, observation, smoke test, operational owner | No G4 approval or recovery path |
| G6 Closure | Acceptance, manuals, trace closure, residual-risk agreement | No explicit closure instruction/approval |

## Project Bootstrap

Use the bundled generator when the user asks for a new project or missing standard structure:

```bash
python3 scripts/bootstrap_project.py --project-root <path> --agent 코덱스
```

It creates the standard project and `docs/` trees, copies every start/QC template with Codex-named dated filenames, writes a project-specific runtime configuration, and installs portable `run.command`/`run.cmd` launchers. Detection is conservative; supply explicit service commands when it cannot prove them. Review the generated configuration before enabling automatic installation.

When ports are omitted, bootstrap atomically reserves a unique frontend/backend pair from `references/agent-port-registry.json`. Never restore framework defaults such as 3000, 5173, 8000, or 8765 without checking the registry. Re-audit configured projects before a large batch of new agents:

```bash
python3 scripts/audit_ports.py audit
```

Do not call a runner complete until macOS and Windows behavior is tested on their target platforms. Record an unavailable platform as `미검증`.

## Completion Report

Report:

- gate reached and approval state;
- selected skills and why;
- documents, code, configuration, and launchers changed;
- fresh validation commands and results;
- unperformed platform/environment checks;
- residual risks, exceptions, and next human decision.

Do not claim compliance merely because templates exist. Their required fields must contain project-specific, reviewable content.
