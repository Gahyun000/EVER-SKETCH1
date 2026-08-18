---
name: harness-loop-engineering-standard
description: Apply the Uniever AI Team T2 and T3 harness-based loop engineering standard when deterministic validation feedback must drive bounded correction, search, extraction completion, multi-step planning, long-running analysis, event processing, recovery, or multi-agent coordination. Use only after applying harness-engineering-standard and defining machine-verifiable success, failure, limits, checkpoints, cancellation, approval, and operational controls.
---

# Uniever Harness-Based Loop Engineering Standard

Apply `harness-engineering-standard` first. The harness must own the loop; the worker, model, or agent must never change its permissions, tools, budget, acceptance criteria, or termination conditions.

## Select T2 Or T3

Choose the simplest sufficient level:

| Condition | Selection |
|---|---|
| One validated pass is sufficient | T1; do not use this skill |
| Validator feedback can repair a bounded result | T2 |
| Long-running, restart-resilient, event-driven, or multi-worker operation | T3 |

Do not select T2 or T3 without a deterministic validator. Record why T1 is insufficient and obtain technical approval.

## Loop Contract

Define before implementation:

- Immutable objective and requirement IDs
- Input/output schemas and data boundary
- Allowed action types and tools
- Validator failure codes that are repairable
- Success, failure, approval, cancellation, and limit conditions
- Maximum steps, retries, duration, cost, tokens, and resources
- Side effects, idempotency, compensation, and safe interruption points
- State and checkpoint persistence requirements

## Standard Loop

Execute one action per controlled iteration:

```text
validate input
-> load state and budget
-> select one allowed next action
-> check policy and approval
-> execute tool/worker
-> normalize output
-> run validators
-> update evidence, state, and budget
-> success / repair / approval / failure / limit / cancellation
```

Do not execute an unvalidated full plan in one burst. Persist state before starting the next iteration.

## Invariants

At every iteration ensure:

- Objective, requirement, tenant, customer, insurer, and project boundaries are unchanged.
- Allowed tools and permissions never expand automatically.
- Budgets only decrease and counters only increase.
- Completed evidence and side-effect records are preserved.
- Input/output contracts and validator versions remain compatible.
- Approval-required actions remain blocked.
- One worker cannot overwrite another worker's state without version or lock checks.

Treat an invariant violation as a terminal failure or approval-required condition.

## Termination

Implement machine-readable termination:

| Type | Required condition |
|---|---|
| Success | Every mandatory validator passes |
| Failure | Non-repairable error or forbidden condition |
| Step limit | Maximum iteration count reached |
| Time limit | Run or stage deadline reached |
| Budget limit | Cost, token, CPU, memory, GPU, storage, or API budget reached |
| Stagnation | No approved quality improvement for three consecutive repairs |
| Approval | A side effect or policy exception requires a human |
| Cancellation | User request, operator command, or kill switch |

Never accept a natural-language completion claim, empty task list, or worker confidence score as success.

## Repair And Retry

Separate technical retry from quality repair:

- Retry transient network or service errors with bounded exponential backoff and jitter.
- Repair only validator-identified failures.
- Pass structured failure codes and evidence, not an unrestricted instruction to "try again."
- Stop repeated identical input, prompt, tool, and action combinations.
- Do not retry missing input, permission denial, policy violation, or unsafe side effects.
- Require idempotency or duplicate checks before every side-effecting action.

## Checkpoint And Resume

For multi-minute T2 and every T3 run:

- Persist state, counters, budgets, versions, pending approvals, completed side effects, and evidence.
- Commit state and output consistently.
- Verify input, code, prompt, model, tool, validator, and schema compatibility before resume.
- Skip already completed side effects using idempotency records.
- Stop for migration or human decision when versions are incompatible.

Do not use model memory, process memory, or framework conversation history as the canonical state.

## Approval And Cancellation

Pause in `WAITING_APPROVAL` before deployment, deletion, bulk change, migration, external transmission, payment, permission change, security bypass, or acceptance-criteria change.

An approval request must include target, action, expected impact, evidence, rollback, and expiry. Execute only the approved action and scope.

After cancellation:

1. Prevent new actions.
2. Stop or time out the active action.
3. Save a consistent checkpoint.
4. Compensate completed side effects where required.
5. Finish as `CANCELLED` or report rollback failure separately.

## T2 Requirements

Implement:

- Bounded correction loop
- Structured state and validator feedback
- Maximum step/time/cost/resource limits
- Stagnation and duplicate-action detection
- Checkpoint for long steps
- User cancellation and approval pause
- Success, failure, limit, and cancellation tests

## T3 Additional Requirements

Add:

- Durable state and restart recovery
- Event deduplication and concurrency control
- Operational dashboard and alerts
- New-run block and active-run kill switch
- Dry-run or observation mode
- Manual takeover and degraded mode
- Versioned rollout and rollback
- Permission expansion and reduction records
- Disaster recovery and checkpoint restore exercise

Start at A1 or A2. Expand authority only after measured evidence and approval; reduce it when failures, cost, latency, or safety indicators worsen.

## Multi-Worker Coordination

When multiple workers or agents participate:

- Assign one orchestrator as state owner.
- Give each worker a narrow input/output contract and tool scope.
- Use correlation IDs, version checks, locks, or compare-and-swap.
- Validate every handoff.
- Prevent workers from messaging each other outside the harness.
- Detect cycles, duplicate tasks, conflicting writes, and orphaned work.

## Mandatory Tests

- [ ] Success terminates only after all mandatory validators pass.
- [ ] Identical error or no improvement stops within the configured limit.
- [ ] Step, time, cost, token, and resource limits stop execution.
- [ ] Approval pauses and resumes without scope expansion.
- [ ] Cancellation stops new actions and preserves consistent state.
- [ ] Checkpoint resume avoids duplicate side effects.
- [ ] Process restart and incompatible-version resume are handled.
- [ ] Tool failure, state-store failure, malformed output, and rollback failure are injected.
- [ ] Prompt injection and unauthorized tool access are rejected.
- [ ] Cross-tenant/project data and multi-worker state remain isolated.
- [ ] T3 dry-run, alerts, kill switch, manual takeover, and recovery are verified.

## Completion Gate

Do not report a loop as autonomous, unattended, or production-ready without real execution evidence. Completion requires approved T level, harness foundation, deterministic validators, bounded termination, checkpoints, cancellation, recovery, security tests, and the applicable T2/T3 operational controls.
