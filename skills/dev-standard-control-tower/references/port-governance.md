# Port governance

## Source of truth

`agent-port-registry.json` records the configured ports of the 24 audited projects, evidence excerpts, cross-project collisions, current listener snapshot, and future reservations. `agent-projects.json` is the audited path manifest and contains verified overrides where automatic classification would confuse proxy/downstream URLs with local listeners.

`docs/공통/유니에버_에이전트대장_20260825.md` is the required human-readable intake ledger for standard-skill porting. It identifies projects, absolute roots, configured ports, execution URLs, and standard launcher filenames. It is an inventory and evidence index, not a replacement allocator: the repository-owned `agent-port-registry.json` remains the reservation authority.

Configured and active are different states:

- **Configured** means a launcher, environment file, Vite/Next config, Docker mapping, or server entry point declares the port.
- **Active** means a process was listening at audit time.
- A configured but inactive port remains reserved because its project may start later.
- Downstream services and databases belong in `auxiliary_ports`, not frontend/backend.

## Mandatory new-agent flow

1. Read `docs/공통/유니에버_에이전트대장_20260825.md` before copying standard skills or generating any launcher. Match the receiving project by absolute path, collect every configured and auxiliary port, and preserve its existing `start.bat`, `start.command`, `stop.bat`, and `stop.command` contract. If the ledger is missing, stale for the receiving root, or cannot be read, stop and create/update the ledger before choosing a port.

2. Refresh the registry after projects change:

   ```bash
   python3 scripts/audit_ports.py audit
   ```

3. Compare the proposed project and all ports in the agent ledger with the refreshed registry and current loopback listeners. A configured-but-inactive port remains occupied for allocation purposes.

4. Reserve before writing Vite, server, Docker, environment, CORS, proxy, health, launcher, or browser URLs:

   ```bash
   python3 scripts/audit_ports.py reserve \
     --name <agent-name> --project-root <absolute-project-path>
   ```

5. Persist the returned pair in the project configuration and in the agent ledger. Use the same values in environment, CORS/proxy, health, browser URLs, and launchers.
6. At runtime, probe loopback again. If a collision appears, stop startup, record the conflict, reserve the next free pair, and update every dependent URL together. Never silently fall back to 3000, 5173, 8000, or 8765.
7. Use readiness checks before opening the browser and terminate only child processes started by the launcher. Record the reservation, audit output, listener check, and verification result in the project work ledger.

`bootstrap_project.py` performs reservation automatically when both explicit ports are omitted. Explicit ports are rejected when already configured or reserved unless the user deliberately supplies `--allow-port-conflict`.

## Allocation policy

- Frontend reservation pool: 5200-5499
- Backend reservation pool: 8800-9199
- Existing configured and auxiliary ports are skipped.
- Reservation updates use an exclusive lock and atomic replacement.
- Repeating the same name and project root returns the existing reservation.
- Framework defaults 3000, 5173, 8000, and 8765 are not safe organizational defaults.

If the registry is copied independently into multiple locations, it is no longer a central allocator. Use the repository-owned registry as the canonical copy and merge reservations before generating more agents.

## Porting stop gate

Standard-skill porting is blocked when the incoming project cannot be mapped to an agent-ledger row, when a requested port appears in the ledger/registry/listener snapshot, when the shared registry cannot be locked, or when an existing launcher would be overwritten without an explicit migration decision. Skill installation never grants permission to claim a port.
