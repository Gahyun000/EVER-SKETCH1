# Governance and gate contract

## Core philosophy

1. AI is an executor and analyst, not the final authority, product owner, or approver.
2. Human-approved requirements, designs, HTML baselines, policies, and acceptance criteria are the source of truth.
3. Missing, contradictory, ambiguous, or untestable mandatory documents stop implementation.
4. Every outcome must trace through requirement → design → code/change → test → evidence → approval.
5. Tests must respect CPU, memory, storage, GPU, time, cost, token, and external-service limits.
6. Core engines, complex algorithms, external integrations, migrations, and autonomous loops require technical documentation.
7. All agents share a development ledger with KST time, session ID, agent, type, requirement/defect ID, work, paths, validation, status, and approver.

## Classification before work

- L1 minor: purpose, impact, review, and basic tests cannot be omitted.
- L2 normal: requirements, design, trace, review, tests, and deployment plan.
- L3 important: full gates, independent quality/security review, performance and rollback evidence.
- L4 emergency: preserve approval and evidence, back up first, validate, and complete omitted documents within one business day.
- A0-A3 defines AI authority; default new-project authority is A1.
- T0 is deterministic implementation, T1 is one controlled harness pass, T2 is a bounded validator-driven loop, and T3 is durable operational automation.

## Gate evidence

| Gate | Evidence | Approver |
|---|---|---|
| G0 | overview, stakeholder/source inventory, scope/exclusions, roles, level, initial risk | business owner |
| G1 | meeting record, requirements and acceptance IDs, glossary, trace matrix | PM/PO and customer |
| G2 | process, screen/HTML, API, DB, security/operations, T selection; T1+ harness; T2+ loop controls | technical owner and customer |
| G3 | implementation, review, unit/static evidence, technical docs, real Windows/macOS one-click launchers | technical owner |
| G4 | integration/regression/permissions/security/performance/harness/resource tests, defects, acceptance review | QA and security owner |
| G5 | deployment/rollback/observation, backups, smoke test; T3 dry-run/alerts/kill switch | operations owner |
| G6 | final manuals, trace closure, residual issues, customer acceptance and retrospective | business owner and customer |

## Stop and approval rules

Stop immediately for requirement conflict, ambiguous business/data meaning, secret or personal-data exposure, unauthorized destructive/operational work, unsafe resource use, isolation failure, or limit exhaustion. Deployment, deletion, bulk change, migration, external transmission, payment, permission change, acceptance change, new dependency/supply-chain change, and authority/limit expansion require the responsible approval.

Technical retry and quality repair are distinct. Retry only classified transient errors, at most three times by default. Stop after three identical failures or three non-improving repairs. Preserve checkpoints and original failure evidence.
