# Port governance

## Source of truth

`agent-port-registry.json` records the configured ports of the 24 audited projects, evidence excerpts, cross-project collisions, current listener snapshot, and future reservations. `agent-projects.json` is the audited path manifest and contains verified overrides where automatic classification would confuse proxy/downstream URLs with local listeners.

Configured and active are different states:

- **Configured** means a launcher, environment file, Vite/Next config, Docker mapping, or server entry point declares the port.
- **Active** means a process was listening at audit time.
- A configured but inactive port remains reserved because its project may start later.
- Downstream services and databases belong in `auxiliary_ports`, not frontend/backend.

## Mandatory new-agent flow

1. Refresh the registry after projects change:

   ```bash
   python3 scripts/audit_ports.py audit
   ```

2. Reserve before writing Vite, server, Docker, environment, CORS, proxy, health, launcher, or browser URLs:

   ```bash
   python3 scripts/audit_ports.py reserve \
     --name <agent-name> --project-root <absolute-project-path>
   ```

3. Persist the returned pair in the project configuration and use placeholders/environment variables consistently. Do not hardcode a different URL in docs or launchers.
4. At runtime, probe loopback again because unregistered processes may occupy a reserved port. Select the next free port only when every dependent URL receives the selected value.
5. Use readiness checks before opening the browser and terminate only child processes started by the launcher.

`bootstrap_project.py` performs reservation automatically when both explicit ports are omitted. Explicit ports are rejected when already configured or reserved unless the user deliberately supplies `--allow-port-conflict`.

## Allocation policy

- Frontend reservation pool: 5200-5499
- Backend reservation pool: 8800-9199
- Existing configured and auxiliary ports are skipped.
- Reservation updates use an exclusive lock and atomic replacement.
- Repeating the same name and project root returns the existing reservation.
- Framework defaults 3000, 5173, 8000, and 8765 are not safe organizational defaults.

If the registry is copied independently into multiple locations, it is no longer a central allocator. Use the repository-owned registry as the canonical copy and merge reservations before generating more agents.
