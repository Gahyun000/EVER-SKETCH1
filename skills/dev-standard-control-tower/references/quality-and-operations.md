# Quality, security, deployment, and evidence

## Quality gate

Test static/type/style, unit, integration, harness/loop, system, acceptance, and operations at the level applicable to the change. Every test record includes test and requirement IDs, purpose, preconditions, data, steps, expected/actual result, evidence, status, runner, date, command, environment, and source version.

Default release criteria: all approved requirement tests executed; zero Blocker/Critical; Major normally zero or explicitly approved; core regression passes; no release-blocking security issue; performance target or approved exception; deployment/rollback/monitoring verified; applicable T1-T3 controls tested.

Use minimum synthetic data. Run heavy model/tests sequentially, set timeouts and cancellation, estimate CPU/memory/disk/GPU, and stop on OOM or host-instability signs. Record unperformed checks as unverified, not passed.

## Security

Use least privilege and default deny. Never commit secrets, expose them in logs, or send internal/confidential/personal data to an unapproved service. Validate input at boundaries; use safe SQL/command/HTML/URL APIs; test injection, SSRF, path traversal, authorization, tenant/project isolation, upload constraints, and supply-chain risk. Free-form model output must never directly become shell, SQL, deletion, deployment, or external transmission.

## Deployment and operation

G4 approval is mandatory before G5 production deployment. Document target/version, linked requirements/defects, owners, backups, order, timing, DB compatibility, downtime, smoke tests, success/rollback conditions, observation and alerts. Rollback covers schema/data/queue/cache/integration/file compatibility, not only code.

Provide structured logs and trace IDs, error/latency/throughput/resource/business metrics, health endpoints, alert recipients and response procedures, RPO/RTO, restore evidence, operating contacts, environment variables, start/stop/restart, known constraints, and licenses. T3 also requires durable state, dashboards, new-run block, active-run kill switch, dry-run, manual takeover, versioned rollout, and recovery exercise.
