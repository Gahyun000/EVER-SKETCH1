---
name: harness-engineering-standard
description: Apply the Uniever AI Team T1 harness engineering standard when a feature uses an AI model, OCR, external API, tool execution, document extraction, code generation, uncertain pipeline, or other operation that needs controlled inputs, permissions, deterministic validation, retries, audit evidence, and safe failure handling. Also use as the mandatory execution foundation for every T2 or T3 loop.
---

# Uniever Harness Engineering Standard

Implement a harness above the worker. The worker may be a function, service, model, agent, or external tool, but it must not own permissions, success criteria, retries, or final status.

## Select This Skill

Use this skill for T1, T2, and T3 features.

- Choose T1 when one controlled pass plus deterministic validation is sufficient.
- For T2 or T3, apply this skill first and then apply `harness-loop-engineering-standard`.
- Use T0 instead when deterministic application code and ordinary tests fully solve the requirement.

Record the selection in the development-method decision document. Stop if the requirement, acceptance criteria, data classification, or responsible owner is missing.

## Required Project Structure

Create or map these responsibilities:

```text
harness/
├── contracts/
├── policies/
├── tools/
├── workflows/
├── validators/
├── checkpoints/
├── telemetry/
└── fixtures/
tests/
├── harness/
└── scenarios/
```

Framework folders may differ, but every responsibility must have an explicit implementation location.

## Design Workflow

1. Identify the requirement, caller, tenant/project boundary, worker, inputs, outputs, side effects, and owner.
2. Define input and output contracts before connecting the worker.
3. Assign a unique execution ID and freeze the execution context.
4. Register allowed tools with least privilege.
5. Define an explicit state machine.
6. Implement deterministic validators separately from the worker.
7. Add bounded retry, timeout, cancellation, evidence, and recovery behavior.
8. Connect the worker only through the contracts and tool registry.
9. Test contracts, policies, validators, failures, isolation, and resource limits.

## Input And Output Contracts

For each input define:

- Schema, type, required fields, length, range, and encoding
- Source, trust level, version, hash, and duplicate identifier
- Personal, confidential, and retention classification
- Allowed content and rejection conditions
- Safe user-facing error code and message

For each output define:

- Schema and required fields
- Business and consistency rules
- Evidence or source requirements
- Empty and partial-result behavior
- Deterministic acceptance conditions

Never pass untrusted free-form content directly into system instructions, shell, SQL, deployment, file paths, or external transmission.

## Execution Context

Persist at least:

| Field | Requirement |
|---|---|
| run_id | Unique and immutable |
| requirement_id | Approved requirement |
| caller/tenant/project | Isolation boundary |
| input version/hash | Reproducibility |
| harness/worker/tool versions | Change traceability |
| authority level | A0-A3 |
| time/cost/token/resource budget | Hard upper bounds |
| data classification | Logging and retention policy |

## Tool Registry

Register every tool by allowlist. Define:

- Tool ID and version
- Structured input/output schema
- Read, write, network, and external-transmission scope
- Timeout and cancellability
- Retryable error codes and maximum retry count
- Idempotency key or duplicate check
- Side effects and compensation action
- Audit fields

Reject unregistered tools, paths, URLs, commands, and SQL. Require human approval before deployment, deletion, bulk modification, migration, payment, permission change, or sensitive external transmission.

## State Machine

Use structured states rather than log text:

`CREATED -> VALIDATED -> PLANNED -> RUNNING -> VERIFYING -> SUCCEEDED`

Support applicable terminal and control states:

`WAITING_APPROVAL`, `RETRYABLE_FAILED`, `FAILED`, `CANCELLED`, `LIMIT_EXCEEDED`, `ROLLING_BACK`, `ROLLED_BACK`

Define allowed event, guard, action, stored data, and next state for every transition. Reject illegal transitions.

## Validators

Run validators in this order:

1. Syntax and schema
2. Required fields, type, range, and format
3. Business rules
4. Cross-field and data consistency
5. Evidence and source location
6. Permission, security, and isolation
7. Acceptance criteria

Do not let the worker or an LLM self-declare success. When semantic model evaluation is needed, pair it with deterministic checks for schema, evidence, numeric values, forbidden conditions, and status.

## T1 Execution

Run one controlled pass:

1. Validate input.
2. Record plan and impact.
3. Check policy and tool permission.
4. Execute one worker action or bounded pipeline.
5. Normalize output.
6. Run validators.
7. Save result and evidence.
8. Finish with a machine-determined status.

Allow technical retry only for explicitly retryable transient errors. Default to three attempts or fewer with backoff and jitter. Do not use validation failure as permission for an open-ended loop.

## Failure, Cancellation, And Recovery

- Stop new tool calls after cancellation.
- Use timeouts or cancellation tokens for active calls.
- Preserve the original failure separately from rollback failure.
- Use transactions, compensation, or forward repair for side effects.
- Do not retry missing permission, invalid input, policy violation, or non-idempotent side effects automatically.
- Report `FAILED`, `CANCELLED`, or `LIMIT_EXCEEDED` instead of returning an empty success.

## Evidence And Observability

Record execution ID, state transitions, safe input/output identifiers, versions, tool calls, latency, error codes, validator results, resource usage, approvals, cancellation, and recovery.

Mask secrets and unnecessary personal data. Do not store raw prompts or source documents when a safe hash and evidence location are sufficient.

## Mandatory Tests

- [ ] Invalid type, length, required field, and content are rejected.
- [ ] Output schema and business-rule failures are rejected.
- [ ] Unregistered tools, paths, URLs, and permissions are rejected.
- [ ] Timeout, retryable failure, non-retryable failure, and cancellation reach the correct state.
- [ ] Duplicate execution does not repeat side effects.
- [ ] Validator failure cannot be overridden by worker text.
- [ ] Tenant, customer, insurer, and project data remain isolated.
- [ ] Secrets and personal data are masked in logs.
- [ ] Time, cost, token, CPU, memory, and storage limits are enforced.
- [ ] Evidence identifies source, code, harness, worker, and tool versions.

## Completion Gate

Do not report the harness complete until contracts, tool policies, state transitions, validators, limits, failure handling, isolation, and tests are implemented and linked to requirement/test IDs. For T2 or T3, continue with `harness-loop-engineering-standard`.
