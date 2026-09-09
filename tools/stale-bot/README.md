# stale-bot

A standalone daily stale-issue sweeper for a GitHub repo. Not an OMP plugin —
a plain Node folder that shells out to `gh` (GitHub) and `omp -p` (a headless
drafter agent).

## What it does

Once per day (or on demand) it sweeps a repo's open issues:

- **Stale** — an open, non-exempt issue quiet for ≥ `daysBeforeStale` days gets
  a summary comment plus the `Stale` label.
- **Close** — an already-stale issue quiet for a further ≥ `daysBeforeClose`
  days gets a final comment and is closed as `not_planned`.
- **Re-activate** — a staled issue with new non-bot activity since the label
  gets the label removed (nothing posted).

The *decision* is mechanical: an engagement score
(`3×distinct users + 2×(comments + reactions) + weeks since update`), quiet
windows, per-sweep caps, exempt labels, and idempotent paired writes
(comment→label, final-message→close). The *words* are written by a headless
drafter agent (`agents/stale-bot.md`), which may veto a posting if it is
factually wrong. Nothing is posted twice: every write re-checks live GitHub
state first, and a mid-sweep kill simply resumes on the next run.

## Run it

```sh
cd tools/stale-bot
node run.mjs --once                 # one sweep, LIVE (posts)
node run.mjs --once --dry-run       # one sweep, drafts only (nothing posted)
node run.mjs --once --max-tasks 3   # bound a sweep to N issues
node run.mjs --loop                 # resident: sweep, sleep pollSeconds, repeat
node run.mjs --status               # print config + state
```

A sweep runs at most once per `stale.sweepEveryHours` (state-guarded), so a
daily cron and manual runs cannot double-post.

### Cron (daily)

```
0 9 * * * cd /home/froid/powerhouse/tools/stale-bot && /usr/bin/node run.mjs --once >> /home/froid/powerhouse/tools/stale-bot/logs/cron.log 2>&1
```

## Config

`config.json` in this folder. The `stale` block holds the policy; `stateDir` /
`pollSeconds` are plumbing. Key fields:

| Field | Default | Meaning |
|---|---|---|
| `stale.repo` | — (required) | `owner/name` of the repo to sweep |
| `stale.staleLabel` | `Stale` | label applied to staled issues (created on first live run) |
| `stale.exemptLabels` | `[]` | issues carrying any of these are never staled/closed |
| `stale.daysBeforeStale` | 60 | quiet days before an open issue is staled |
| `stale.daysBeforeClose` | 7 | quiet days after staling before it is closed |
| `stale.max{Stale,Close,Unstale}PerSweep` | 30 | per-sweep action caps |
| `stale.sweepEveryHours` | 24 | minimum interval between sweeps (state-guarded) |
| `stale.coolDays` | 30 | cooldown after a drafter veto |
| `stale.dryRun` | `false` | `true` → log drafts, post nothing (`--dry-run` forces it per run) |
| `stale.repoPath` | — | cwd for the drafter's `omp -p` child (defaults to this repo) |
| `stale.roundTimeoutMin` | 10 | max time for one drafter round |
| `pollSeconds` | 3600 | sleep between sweeps in `--loop` mode |
| `maxTasksPerRun` | `null` | default per-run cap for `--once` (`null` = unbounded) |
| `stateDir` | `state` | where `state.json` / `stale-state.json` / logs live |

The drafter's model comes from the agent's frontmatter (`model: "@worker"`),
resolved through `~/.omp/agent/config.yml` `modelRoles`.

## Layout

- `run.mjs` — the CLI driver (the only original code).
- `agents/stale-bot.md` — the drafter/veto agent (the "brain").
- `harness/lib/sources/stale.mjs` — the sweep + per-issue logic (the "hands").
- `harness/lib/{gh,agentdef,runner-process,state,paths}.mjs` — ported helpers.
- `state/` — runtime state + run logs (git-ignored).

## Provenance

Ported from the `stale` profile of the private `omp-vault-harness` OMP plugin
(`/home/froid/omp-vault-harness-stale`), which stays untouched. The sweep,
scoring, caps, idempotency, and dry-run semantics are unchanged.
