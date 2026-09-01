# Agent-Managed Vetra

Date: 2026-09-01
Status: Approved design, not yet implemented

## Problem

The `AGENTS.md` scaffolded into every generated project tells the coding agent
it may not start the development environment:

> If the `reactor-mcp` server is unavailable, ask the user to run `ph vetra` on
> a separate terminal to start the server and try to reconnect to the MCP
> server, DO NOT run it yourself.

(`packages/codegen/src/templates/boilerplate/AGENTS.md.ts:27`)

An agent that can run background processes does not need a human for this. The
instruction costs a round-trip on every session where the human forgot to start
Vetra, which is most of them.

Simply deleting the prohibition is not safe, because of a second defect:

- `.mcp.json` and `.cursor/mcp.json` are generated with a hardcoded
  `http://localhost:4001/mcp`
  (`packages/codegen/src/file-builders/boilerplate/generated-project-files.ts:159,168`).
- `ph vetra` resolves its switchboard port through `resolveSwitchboardPort`
  (`clis/ph-cli/src/utils/resolve-switchboard-port.ts`), which walks forward to
  the next free port. In a non-interactive context — exactly what an
  agent-spawned background process is — it takes the fallback **silently**.
- Nothing records the port that was actually bound.

So an agent working in project B, started while project A holds 4001, gets a
switchboard on 4002 while its MCP client still talks to 4001. It then writes
document models into **project A's Vetra drive**. Silent cross-project
corruption, and telling agents to self-start makes it likely rather than
theoretical.

A third constraint shapes any fix: Claude Code resolves `.mcp.json` at session
start. An agent that starts Vetra mid-session cannot make a newly chosen port
take effect for its own MCP connection. The port must therefore be settled
before the session begins — runtime discovery alone cannot work.

## Goals

1. The agent starts Vetra itself when it is not running, without asking a human.
2. Agents working on different projects in parallel never collide on ports and
   never reach another project's reactor.
3. A human running `ph vetra` keeps today's behavior and today's port numbers.
4. Exactly one Vetra instance per project. Never two divergent reactors over
   one working tree.
5. The human is never asked to reason about hash-derived port numbers.

## Non-Goals

- Multi-agent coordination *within* one project (several agents sharing one
  reactor concurrently). Out of scope; the single-instance guard makes the
  situation detectable, not orchestrated.
- Changing how Connect, Switchboard, or the reactor themselves bind ports
  outside the Vetra flow (`ph connect`, `ph switchboard`, `ph service`).
- Container/Compose port mapping.

## Design

### Two lanes, one instance

| | Human lane | Agent lane |
|---|---|---|
| Invocation | `ph vetra` | `ph vetra --switchboard-port <hashed> --connect-port <hashed> --strictPort` |
| Switchboard port | 4001 (from `powerhouse.config.json` `reactor.port`) | hash-derived, `41000–41999` |
| Connect port | 3001 (`DEFAULT_VETRA_CONNECT_PORT`) | hash-derived, `31000–31999` |
| MCP URL | not used by a human | matches `.mcp.json` |

`powerhouse.config.json` keeps `reactor.port: 4001` and `studio.port: 3000`
exactly as today, so goal 3 holds with no change to the human path.

`.mcp.json` and `.cursor/mcp.json` are generated pointing at the project's
**hash-derived** switchboard port, not 4001. Because the value is baked in at
`ph init`, it is already correct when Claude Code reads the file at session
start — no reconnect step, ever.

Goal 4 is enforced by a single-instance guard rather than by keeping the lanes
apart: whichever lane starts first owns the project's one Vetra, and the second
attempt refuses to start.

### Port derivation

Input is the **project name from `package.json`**, not the absolute path. The
name is committed and reproducible across machines, so the generated
`.mcp.json` stays valid for anyone who clones the repo. A path-derived value
would be machine-specific in a committed file.

`fnv1a32` is the standard 32-bit FNV-1a hash over the UTF-8 bytes of the
name, taken unsigned:

```
offset       = fnv1a32(utf8(projectName)) % 1000
switchboard  = 41000 + offset
connect      = 31000 + offset
```

Bands are chosen to sit clear of the standard Powerhouse ports (3000, 3001,
4001, 4173) and of common dev-server ports (5173, 8080, 9229).

Two distinct projects collide only on a 1-in-1000 hash collision, and that
collision surfaces as a loud `--strictPort` failure rather than as misrouting.

Two git worktrees of the *same* project share a name and therefore a port. The
escape hatch is env-var expansion in the generated URL:

```json
{ "mcpServers": { "reactor-mcp": {
  "type": "http",
  "url": "http://localhost:${PH_MCP_PORT:-41837}/mcp"
} } }
```

Exporting `PH_MCP_PORT` separates two worktrees with no git churn.
**Verify before relying on this:** Claude Code's `${VAR:-default}` expansion in
`.mcp.json`. If it does not hold, the literal port is written instead and
worktrees are separated with an explicit `--switchboard-port`. Cursor's
expansion rules differ from Claude Code's, so `.cursor/mcp.json` gets the
literal value regardless.

### Single-instance guard

`ph vetra` writes a runtime record once the switchboard has bound, and removes
it on clean exit:

```
.ph/vetra-runtime.json   (gitignored — .ph is already in the boilerplate .gitignore)
{
  "pid": 48812,
  "projectName": "my-package",
  "lane": "agent" | "human",
  "switchboardPort": 41837,
  "connectPort": 31837,
  "mcpUrl": "http://localhost:41837/mcp",
  "startedAt": "2026-09-01T10:22:03.000Z"
}
```

`lane` needs no new flag: it is recorded as `"agent"` when the resolved
switchboard port equals `deriveAgentPorts(projectName).switchboard`, and
`"human"` otherwise. The field is diagnostic only — the guard's behavior does
not branch on it, so a misclassification cannot cause a second instance.

On startup `ph vetra` reads the record and probes liveness:

- **No record, or record's pid is dead, or `/ready` does not answer** — stale.
  Delete it and start normally.
- **Record is live** — do not start a second instance. Print the live URLs and
  exit 0:

  ```
  Vetra is already running for this project (started by an agent).
      Connect:     http://localhost:31837
      Switchboard: http://localhost:41837/graphql
  Stop that instance (pid 48812) if you need to restart it.
  ```

  Exit 0, not a failure: from the human's point of view "Vetra is running" is
  the outcome they wanted. This is also what satisfies goal 5 — the human never
  types a hashed number, they are handed a URL.

Liveness is `pid` alive **and** `GET /ready` returning 200 on the recorded
switchboard port. Pid alone is insufficient (a crashed process can leave a
reused pid); `/ready` alone is insufficient (a foreign project's switchboard
would answer). Both together confirm the record describes a live instance, and
`projectName` in the record confirms it is *this* project's.

`/health` (200 OK) and `/ready` (200 ready / 503 starting) already exist,
unauthenticated, at `packages/reactor-api/src/server.ts:638-645`.

### `--strictPort` in the agent lane

The agent always passes `--strictPort`. This is the actual bug fix: today's
silent walk-forward is the mechanism by which an agent could reach another
project's drive. With `--strictPort`, a genuine clash is a loud startup failure
the agent reports, not a silent misroute.

The human lane keeps the existing interactive `resolveSwitchboardPort` fallback,
unchanged.

### Shared state, one reactor

Because only one instance runs per project, agent and human share
`.ph/read-model.db` and `.ph/reactor-storage`
(`clis/ph-cli/src/services/switchboard.ts:11-12,34-35`). No separate agent
state directory, and no divergent drives — the explicitly rejected outcome.

### Agent lane starts Connect

The agent starts a full Vetra including Connect on the hashed connect port and
prints the URL. Watching an editor render is most of the value of Vetra; a
headless `--disable-connect` lane would save a port and some vite startup at
the cost of the human's main feedback channel.

## AGENTS.md rewrite

Replace the prohibition at `AGENTS.md.ts:27` with a procedure. Content, not
final wording:

1. Before the first `reactor-mcp` call, check the tool is reachable.
2. If it is not, resolve the project's switchboard port from `.mcp.json` —
   honoring `PH_MCP_PORT` when that variable is set, since the generated URL
   defaults to it — and read `.ph/vetra-runtime.json` if present.
3. If the record shows a live instance, say so and stop — do not start a second.
4. Otherwise start Vetra **in the background**:
   `ph vetra --switchboard-port <port> --connect-port <port> --strictPort --watch`
5. Poll `GET http://localhost:<port>/ready` until 200, with a bounded timeout
   (60s) and a clear message on expiry.
6. Print the Connect URL for the human.
7. Escalate to the human only when startup fails: `--strictPort` rejection
   (something else holds the port), `/ready` never reaching 200, or a crash.
   Include the actual error.
8. Never edit `.mcp.json` to chase a port. A port mismatch is a bug to report,
   not to route around.

Also update the Vetra definition at `AGENTS.md.ts:22`, which currently says
"Start it with `ph vetra`" with no mention that the agent may do so.

`CLAUDE.md.ts` re-exports `agentsTemplate`, so it inherits the change with no
separate edit.

## Files

**Changed**

- `packages/codegen/src/templates/boilerplate/AGENTS.md.ts` — replace the
  prohibition; update the Vetra concept line.
- `packages/codegen/src/templates/boilerplate/mcp.json.ts` — take the port as a
  parameter instead of hardcoding 4001; env-expansion form.
- `packages/codegen/src/templates/boilerplate/cursor/mcp.json.ts` — same, literal port.
- `packages/codegen/src/file-builders/boilerplate/generated-project-files.ts:159,168`
  — pass the derived port to both templates.
- `clis/ph-cli/src/services/vetra.ts` — single-instance guard before
  `startLocalVetraSwitchboard`; write the runtime record after bind; remove on exit.
- `packages/shared/clis/constants.ts` — port band constants.

**New**

- `packages/shared/clis/agent-ports.ts` — `deriveAgentPorts(projectName)`; pure,
  shared by codegen and ph-cli so both derive identically.
- `clis/ph-cli/src/utils/vetra-runtime.ts` — read/write/probe the runtime record.

**Unchanged**

- `packages/codegen/src/templates/boilerplate/powerhouse.config.json.ts` —
  standard ports stay.
- `clis/ph-cli/src/utils/resolve-switchboard-port.ts` — human lane keeps
  interactive fallback.

## Testing

Unit:

- `deriveAgentPorts` — deterministic for a given name; lands in band; distinct
  names give distinct ports across a corpus of realistic project names.
- Runtime record — round-trips; stale detection for dead pid, for missing file,
  for a live pid whose `/ready` does not answer, and for a `/ready` that answers
  but reports a different `projectName`.
- mcp.json templates — render the derived port for a given project name.

Integration:

- `ph vetra` twice in one project: second prints live URLs and exits 0, and does
  not bind a port.
- Agent-lane invocation against an occupied hashed port: fails with a clear
  message, does not fall back.
- Two scaffolded projects with different names: hashed ports differ; both can run.
- Crash-then-restart: kill -9 the first instance, confirm the stale record is
  cleaned and the second starts.

Manual:

- Scaffold a project, open Claude Code with no Vetra running, confirm the agent
  starts it and `reactor-mcp` tools work in the same session with no reconnect.

## Risks

- **`${VAR:-default}` expansion in `.mcp.json` may not be supported.** Verify
  first; fall back to a literal port. Does not affect the rest of the design.
- **Hash collision between two projects (1-in-1000).** Surfaces as a
  `--strictPort` failure, so it is visible, not silent. Remedy is an explicit
  `--switchboard-port`.
- **Runtime record left behind by a hard kill.** Handled by pid + `/ready`
  liveness probing; a stale record is deleted, not honored.
- **Existing projects keep 4001 in their committed `.mcp.json`.** This design
  changes generation only, not existing trees. Those projects behave exactly as
  today. A migration (`ph init --migrate` or similar) is deliberately out of
  scope for this spec.
