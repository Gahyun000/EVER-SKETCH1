# One-click runtime contract

The generated runtime is project-specific and cross-platform. It must:

1. resolve the project root independent of the caller's current directory;
2. validate runtimes, environment files, service directories, and commands;
3. install only declared dependencies from lock files and only under the configured approval policy;
4. allocate distinct free loopback ports near preferred values and expose them through placeholders/environment variables;
5. start backend and frontend concurrently without `shell=True`;
6. probe configured readiness URLs until ready or timeout;
7. open the actual frontend URL after readiness, unless disabled;
8. print log paths, URLs, ports, process IDs, and shutdown instructions;
9. terminate only its own child process groups on exit or interruption;
10. record the runtime state and dependency-lock fingerprints.

`scripts/bootstrap_project.py` installs `tools/dev_standard/devctl.py`, `.dev-standard.json`, `run.command`, and `run.cmd`. Use explicit `--frontend-command` and `--backend-command` when conservative discovery cannot identify a service. Commands are tokenized arrays; `{port}`, `{host}`, and `{python}` are substituted without shell evaluation.

Before generating the configuration, bootstrap reserves a unique pair from `references/agent-port-registry.json` unless both ports are explicitly supplied. Explicit collisions fail closed. The runtime still probes the selected ports and may move within its bounded range because the registry cannot prevent unrelated processes from binding after reservation.

Installation policies:

- `prompt` (default): ask on a TTY before the first locked install.
- `auto`: suitable only when invoking bootstrap explicitly approves the reviewed locked commands.
- `never`: report missing dependencies and stop.

Never install an unpinned package merely because an import failed. Do not install system runtimes or package managers. Review license, maintenance, vulnerabilities, bundle/memory impact, and removal path for new libraries.

Verification:

```bash
python3 tools/dev_standard/devctl.py --check
./run.command --no-browser
run.cmd --no-browser
```

Test each launcher on its target OS. A syntax-only or foreign-OS check is partial evidence and must be recorded as such.
