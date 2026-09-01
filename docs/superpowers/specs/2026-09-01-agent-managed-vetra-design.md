# Agent-Managed Vetra

Date: 2026-09-01
Status: Approved design, not yet implemented

Revision 2. Revision 1 assigned the agent a separate hash-derived port lane and
left the human lane pinned to 4001/3001. This revision drops the two-lane split:
ports are project-assigned in `powerhouse.config.json`, overridable by env, and
both human and agent use the same ones. See "Why not two lanes" below.

## Problem

The `AGENTS.md` scaffolded into every generated project forbids the agent from
starting the development environment:

> If the `reactor-mcp` server is unavailable, ask the user to run `ph vetra` on
> a separate terminal to start the server and try to reconnect to the MCP
> server, DO NOT run it yourself.

(`packages/codegen/src/templates/boilerplate/AGENTS.md.ts:27`)

An agent that can run background processes does not need a human for this. The
rule costs a round-trip in every session where the human forgot, which is most
of them.

Deleting the prohibition alone is unsafe, because of a second defect:

- `.mcp.json` and `.cursor/mcp.json` are generated with a hardcoded
  `http://localhost:4001/mcp`
  (`packages/codegen/src/file-builders/boilerplate/generated-project-files.ts:159,168`).
- `ph vetra` resolves its port through `resolveSwitchboardPort`
  (`clis/ph-cli/src/utils/resolve-switchboard-port.ts`), which walks forward to
  the next free port and — in a non-interactive context, which is exactly what
  an agent-spawned background process is — takes the fallback **silently**.
- Nothing records the port actually bound.

An agent in project B, started while project A holds 4001, therefore gets a
switchboard on 4002 while its MCP client still talks to 4001, and writes
document models into **project A's Vetra drive**. Silent cross-project
corruption, made likely rather than theoretical by letting agents self-start.

Three constraints shape any fix.

1. **Claude Code resolves `.mcp.json` at session start.** An agent that starts
   Vetra mid-session cannot make a newly chosen port take effect for its own MCP
   connection. Runtime discovery alone cannot work; the port must be settled
   before the session begins.
2. **Production does not solve this and offers no pattern to copy.** The
   Dockerfile pins a static internal port (`ENV PORT=3000`), the entrypoint
   forwards it into an explicit flag (`exec ph switchboard --port ${PORT:-3000}`,
   `packages/codegen/src/templates/boilerplate/docker/switchboard-entrypoint.sh.ts`),
   and collisions are handled by Docker host mapping (`127.0.0.1:4000:3000` in
   `docker-compose.yml`). Env vars there carry *config* — database URLs,
   `PH_CONNECT_CONFIG_JSON` — never allocation. Nothing in production has to
   decide a port, because each container owns its own namespace. `ph vetra` has
   no such isolation: N instances share one host OS.
3. **One project must never have two divergent reactors.** Switchboard state is
   at a fixed `.ph/read-model.db` and `.ph/reactor-storage` in cwd
   (`clis/ph-cli/src/services/switchboard.ts:11-12,34-35`), not port-derived, so
   two instances in one working tree also contend for the same files.

## Goals

1. The agent starts Vetra itself when it is not running, without asking a human.
2. Agents on different projects in parallel never collide and never reach
   another project's reactor.
3. Exactly one Vetra instance per project. Never two divergent reactors over one
   working tree.
4. The human is never asked to compute or memorise a port number.
5. Ports are overridable, so two worktrees of one project can run at once.

## Non-Goals

- Multi-agent coordination *within* one project (several agents sharing one
  reactor concurrently). The single-instance guard makes the situation
  detectable, not orchestrated.
- Changing production behaviour. `ph switchboard`, `ph connect build`, the
  Dockerfiles, and Compose port mapping keep their current semantics. One
  production-shared file does change — `apps/switchboard/src/config.ts` gains the
  `.env.local` cascade — but the change is additive and inert where no
  `.env.local` exists, which is the case in every container image.
- Migrating existing generated projects. They keep their committed 4001 and
  behave exactly as today.

## Why not two lanes

Revision 1 gave the agent its own hash-derived ports and left `ph vetra` on
4001/3001 for humans. That was rejected: whenever both ran, one project had two
reactors with diverging drives. Enforcing a single instance on top of two
different port assignments requires a guard that also reconciles which port
"won", and the loser's `.mcp.json` is then wrong.

A single project-assigned port removes the whole class of problem. Human and
agent read the same value from the same file, so they cannot disagree, and the
guard only has to answer "is one already running?" rather than also "on which
of two possible ports?".

## Design

### Ports are assigned per project in `powerhouse.config.json`

`ph init` writes hash-derived ports into the config file it already generates,
instead of the current hardcoded `studio: { port: 3000 }` /
`reactor: { port: 4001 }`
(`packages/codegen/src/templates/boilerplate/powerhouse.config.json.ts:31-32`).

`powerhouse.config.json` is the right home rather than a committed `.env`:

- It is already committed, and already holds `reactor.port` and `studio.port`.
- `vetraArgs.switchboardPort` **already** reads `getConfig().reactor?.port`
  (`packages/shared/clis/args/vetra.ts:15-23`), so the switchboard side needs no
  new plumbing — only a change to what `ph init` writes.
- It matches the repo's stated principle that configuration lives in
  `powerhouse.config.json` and is overridden by CLI flags, with env reserved for
  build metadata and infrastructure
  (`packages/shared/connect/env-config.ts:50-58`).
- A committed `.env` is unconventional and becomes a secrets hazard as soon as
  someone adds a real secret beside the ports.

Derivation, from the **project name in `package.json`** — committed and
reproducible across machines, unlike an absolute path:

`fnv1a32` is the standard 32-bit FNV-1a hash over the UTF-8 bytes of the name,
taken unsigned.

```
offset       = fnv1a32(utf8(projectName)) % 1000
reactor.port        = 41000 + offset   # switchboard / MCP
studio.port         = 31000 + offset   # `ph connect studio`
vetra.connectPort   = 32000 + offset   # `ph vetra`'s Connect
```

Three slots because `ph connect studio` (3000) and `ph vetra`'s Connect (3001)
are distinct servers today and must stay distinct. Bands sit clear of the
standard Powerhouse ports (3000, 3001, 4001, 4173) and of common dev-server
ports (5173, 8080, 9229).

Two distinct projects collide only on a 1-in-1000 hash collision, and that
surfaces as a loud `--strictPort` failure rather than as misrouting.

### Override precedence

One chain, matching both existing implementations — `loadConnectEnv`'s
`process.env > fileEnv > defaults` (`packages/shared/connect/env-config.ts`) and
switchboard's `env > config > 4001` (`apps/switchboard/src/config.ts:43-46`):

```
CLI flag  →  process.env  →  .env.local  →  .env  →  powerhouse.config.json  →  constant default
```

Env var names:

- `PH_SWITCHBOARD_PORT` — **already exists** and is already honoured by the
  standalone switchboard app. Currently dead on the `ph vetra` path, because
  ph-cli always passes an explicit `port` and `server.mts:935` only falls back to
  env when `options.port` is undefined. This design wires it into the vetra arg
  defaults so the documented precedence actually holds.
- `PH_VETRA_CONNECT_PORT` — new. Deliberately **not** named `PH_CONNECT_PORT`:
  the `PH_CONNECT_*` family is the validated SPA runtime-config schema, and a
  dev-server port is not runtime config. Keeping it outside that family avoids
  implying it is build-time SPA configuration.

`.env.local` is already in the boilerplate `.gitignore`, and vite's `loadEnv`
already cascades `.env.local` over `.env`
(`packages/builder-tools/connect-utils/vite-config.ts:193`). So goal 5 —
per-worktree override — costs nothing new: a second worktree drops two lines in
its own untracked `.env.local`. `dotenv.config()` in
`apps/switchboard/src/config.ts:2` reads only `.env` and must be extended to the
same cascade so both halves agree.

### Single-instance guard

`ph vetra` writes a runtime record once the switchboard has bound, and removes it
on clean exit:

```
.ph/vetra-runtime.json   (gitignored — .ph is already in the boilerplate .gitignore)
{
  "pid": 48812,
  "projectName": "my-package",
  "switchboardPort": 41837,
  "connectPort": 32837,
  "mcpUrl": "http://localhost:41837/mcp",
  "startedAt": "2026-09-01T10:22:03.000Z"
}
```

On startup `ph vetra` reads the record and probes liveness:

- **No record, dead pid, or `/ready` does not answer** — stale. Delete and start
  normally.
- **Record is live** — do not start a second instance. Print the live URLs and
  exit 0:

  ```
  Vetra is already running for this project.
      Connect:     http://localhost:32837
      Switchboard: http://localhost:41837/graphql
  Stop that instance (pid 48812) if you need to restart it.
  ```

  Exit 0, not failure: "Vetra is running" is the outcome the caller wanted. This
  is also what satisfies goal 4 — the human is handed a URL, never a number to
  compute.

Liveness is pid alive **and** `GET /ready` returning 200 on the recorded port
**and** the record's `projectName` matching this project. Pid alone is
insufficient (a reused pid); `/ready` alone is insufficient (a foreign
project's switchboard would answer). `/health` (200) and `/ready` (200 ready /
503 starting) already exist unauthenticated at
`packages/reactor-api/src/server.ts:638-645`.

### `--strictPort` on the agent's invocation

The agent always passes `--strictPort`. This is the actual bug fix: today's
silent walk-forward is the mechanism by which an agent could reach another
project's drive. With `--strictPort`, a genuine clash is a loud startup failure
the agent reports rather than a silent misroute. `ph vetra` already honours it
(`clis/ph-cli/src/services/vetra.ts:133`), bypassing `resolveSwitchboardPort`.

Interactive human invocation keeps the existing `resolveSwitchboardPort`
confirmation prompt, unchanged.

### Keeping `.mcp.json` in step

`.mcp.json` and `.cursor/mcp.json` are generated with the **literal** assigned
switchboard port. No mechanism lets Claude Code read `.env` or
`powerhouse.config.json` when resolving `.mcp.json`, so a literal is required;
because it is written at `ph init`, it is already correct at session start and
no reconnect is needed in the normal case.

Drift is possible only when someone edits the config or an override file. On
startup, `ph vetra` compares its resolved port against the URL in `.mcp.json`;
on mismatch it rewrites `.mcp.json` and prints that the MCP client must
reconnect (`/mcp`) or restart to pick it up. Rare and self-healing.

`${VAR:-default}` expansion in `.mcp.json` is deliberately **not** used. It was
attractive in revision 1 for the worktree case, but that case is now handled by
`.env.local`, and relying on unverified expansion semantics in two different
MCP clients (Claude Code and Cursor, whose rules differ) buys nothing here.

### Rejected: stdio MCP

`packages/reactor-mcp` already ships a stdio server (`src/cli.ts`,
`src/stdio/index.ts`, bin `reactor-mcp`). A `command`-style `.mcp.json` would
have no port at all — identical for every project, no sync, worktrees free.

Rejected because `initStdioMcpServer` builds its **own in-process reactor** from
local `document-models/` (`stdio/index.ts:66-68`) rather than attaching to a
running switchboard. The agent would work in a private in-memory reactor,
invisible to the human's Connect, with no vetra codegen processor and no sync
(`stdio/index.ts:104`: "syncManager is not available in stdio mode"). That
breaks watching an editor render, which is most of Vetra's value. Worth
revisiting as a headless, agent-only mode; not the answer here.

## AGENTS.md rewrite

Replace the prohibition at `AGENTS.md.ts:27` with a procedure. Content, not
final wording:

1. Before the first `reactor-mcp` call, check the tool is reachable.
2. If it is not, read `.ph/vetra-runtime.json` if present.
3. If the record shows a live instance, say so and stop — do not start a second.
4. Otherwise start Vetra **in the background**: `ph vetra --strictPort --watch`.
   Do not pass explicit ports; the project's config supplies them. Passing
   ports is what lets an agent drift from `.mcp.json`.
5. Poll `GET /ready` until 200, bounded at 60s, with a clear message on expiry.
   Poll the port named in `.mcp.json`, not the one Vetra reports: that is the
   only port the agent's MCP client will ever use, so polling it doubles as a
   check that the two agree. If Vetra came up elsewhere, the agent's MCP is
   broken and the timeout is the correct signal.
6. Print the Connect URL for the human.
7. Escalate to the human only on failure: `--strictPort` rejection (something
   else holds the port), `/ready` never reaching 200, or a crash. Include the
   actual error.
8. Never edit `.mcp.json` to chase a port. A mismatch is a bug to report, not to
   route around; `ph vetra` owns that reconciliation.

Also update the Vetra definition at `AGENTS.md.ts:22`, which says "Start it with
`ph vetra`" without indicating the agent may do so. `CLAUDE.md.ts` re-exports
`agentsTemplate`, so it inherits the change with no separate edit.

## Files

**Changed**

- `packages/codegen/src/templates/boilerplate/AGENTS.md.ts` — replace the
  prohibition; update the Vetra concept line.
- `packages/codegen/src/templates/boilerplate/powerhouse.config.json.ts` — write
  hash-derived `reactor.port`, `studio.port`, `vetra.connectPort` instead of
  hardcoded 3000/4001. Needs the project name, which
  `buildPowerhouseConfigTemplate` does not currently receive.
- `packages/codegen/src/templates/boilerplate/mcp.json.ts` and
  `cursor/mcp.json.ts` — take the port as a parameter instead of hardcoding 4001.
- `packages/codegen/src/file-builders/boilerplate/generated-project-files.ts:159,168`
  — pass the derived port to both templates.
- `packages/shared/clis/args/vetra.ts` — insert env into the precedence chain for
  `switchboardPort`; source `connectPort` from `vetra.connectPort` with a
  `PH_VETRA_CONNECT_PORT` override instead of the bare
  `DEFAULT_VETRA_CONNECT_PORT` constant.
- `packages/shared/clis/types.ts:318-321` and
  `packages/shared/clis/source-config.schema.json:216-229` — add optional
  `vetra.connectPort`, and drop `driveId`/`driveUrl` from that block's
  `required` so a project with no remote drive can carry a port. Loosening
  `required` is backward-compatible: existing configs stay valid.
- `apps/switchboard/src/config.ts:2` — extend `dotenv.config()` to the
  `.env.local`-over-`.env` cascade so both halves resolve identically.
- `clis/ph-cli/src/services/vetra.ts` — single-instance guard before
  `startLocalVetraSwitchboard`; write the runtime record after bind and remove on
  exit; `.mcp.json` drift check.
- `packages/shared/clis/constants.ts` — port band constants.

**New**

- `packages/shared/clis/project-ports.ts` — `deriveProjectPorts(projectName)`;
  pure, shared by codegen and ph-cli so both derive identically.
- `clis/ph-cli/src/utils/vetra-runtime.ts` — read / write / probe the runtime
  record.

**Unchanged**

- `clis/ph-cli/src/utils/resolve-switchboard-port.ts` — interactive human
  fallback stays.
- Production path: `ph switchboard`, `ph connect build`, both Dockerfiles, all
  Compose files.

## Testing

Unit:

- `deriveProjectPorts` — deterministic per name; each value lands in its band;
  distinct names give distinct triples across a corpus of realistic project
  names; the three slots never coincide.
- Precedence — CLI flag beats `process.env`, which beats `.env.local`, which
  beats `.env`, which beats `powerhouse.config.json`, which beats the constant.
  One test per adjacent pair.
- Runtime record — round-trips; stale detection for dead pid, missing file, live
  pid whose `/ready` does not answer, and a `/ready` that answers but reports a
  different `projectName`.
- mcp.json templates — render the derived port for a given project name.
- Config schema — a `vetra` block with only `connectPort` validates; an existing
  block with `driveId` + `driveUrl` still validates.

Integration:

- `ph vetra` twice in one project: the second prints live URLs, exits 0, and
  binds no port.
- Occupied assigned port with `--strictPort`: fails with a clear message, no
  fallback.
- Two scaffolded projects with different names: assigned ports differ, both run
  concurrently.
- `.env.local` override: two worktrees of one project run at once.
- Drift: edit the config port, start `ph vetra`, confirm `.mcp.json` is rewritten
  and the reconnect notice printed.
- Crash-then-restart: `kill -9` the first instance, confirm the stale record is
  cleaned and the next start succeeds.

Manual:

- Scaffold a project, open Claude Code with no Vetra running, confirm the agent
  starts it and `reactor-mcp` tools work in the same session with no reconnect.

## Risks

- **Hash collision between two projects (1-in-1000).** Surfaces as a
  `--strictPort` failure, so it is visible rather than silent. Remedy is a
  `.env.local` override.
- **Runtime record left by a hard kill.** Handled by pid + `/ready` +
  `projectName` probing; a stale record is deleted, not honoured.
- **Unfamiliar port numbers.** A developer used to 4001 now sees a
  project-specific number. Mitigated by the numbers living in
  `powerhouse.config.json` where they already look, and by `ph vetra` printing
  its URLs on every start.
- **Schema `required` loosening.** Backward-compatible in the permissive
  direction, but any code assuming `config.vetra.driveUrl` is present whenever
  `config.vetra` exists must be checked. `packages/shared/clis/args/vetra.ts:38`
  already reads it optionally.
- **A port override dirties a tracked file.** `.mcp.json` is committed, so when
  a worktree overrides its port via `.env.local`, `ph vetra`'s drift rewrite
  leaves a local modification to a tracked file. There is no way around this:
  the MCP client cannot read the override, so the literal must change for the
  worktree to work at all. `ph vetra` prints that the edit is local-only and
  should not be committed. The primary (non-overridden) case never drifts and
  never churns.
- **Existing projects keep 4001 in their committed `.mcp.json`.** This changes
  generation only. A migration command is deliberately out of scope.
