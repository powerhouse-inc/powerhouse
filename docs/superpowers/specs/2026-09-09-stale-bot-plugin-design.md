# Stale-Bot Plugin Design

- Status: **Proposed — awaiting review**
- Date: 2026-09-09
- Owner: froid
- Supersedes: the `stale` profile inside the `omp-vault-harness` OMP plugin
- Canonical home: this document describes the new `omp-stale-bot` repo; it is staged here (powerhouse) for review because that repo does not exist yet.

## Background

A stale-issue bot already runs daily against `powerhouse-inc/powerhouse` (~400 open issues) as the `stale` profile of the private `omp-vault-harness` OMP plugin (`/home/froid/omp-vault-harness-stale`), driven by a cron on the operator's machine:

```
HARNESS_DIR=~/.omp/stale-bot-conf node .../omp-vault-harness-stale/harness/run.mjs --once
```

It is currently in `dryRun: true` (drafts and logs, posts nothing).

What it does today:

- **Mechanics** (`harness/lib/sources/stale.mjs`): each sweep enumerates open issues, computes an engagement score `3×distinct users + 2×(comments+reactions) + weeks since last update`, buckets them (B = new-stale candidates, A = already-staled candidates for close/re-activate), then applies exempt labels, per-sweep caps, cooldowns, and idempotent paired writes (comment before label; final message before close). The decision itself is mechanical.
- **Drafter/veto** (`agents/stale-bot.md`): for each candidate, one OMP task-agent round drafts the exact comment and may **veto** the mechanical decision when it can prove it wrong (e.g. the issue is in fact resolved). A veto cools the issue for `coolDays`. This is the part that makes it better than a stock stale-bot.
- **Distribution**: bundled in the `vault-harness` plugin (`plugin.json` name `vault-harness`) — two unrelated tools sharing one plugin identity, version, and install. Driven by a local config dir and a local cron; not installable or reusable by anyone else.

Problems with the current shape:

1. **Coupled** to the `vault-harness` plugin — the stale bot and the knowledge-vault harness are unrelated but share one plugin identity/version/install.
2. **Personal** — a machine-local cron + config; not reusable, not distributed, dies with the box.
3. **Policy not in the repo** — the tuning (windows, labels, caps) lives in a machine-local config file rather than in the repo the bot acts on, so it is not versioned or PR-reviewable where it belongs.

## Goals

- Extract the stale bot into a **standalone, installable OMP plugin** (`omp-stale-bot`), generic over any GitHub repo.
- **Keep the LLM drafter/veto** — the differentiator.
- Move the **per-repo policy** into a versioned file in the target monorepo (`.github/stale-bot.json`) that the plugin fetches at sweep time.
- **Preserve** existing sweep behavior, idempotency, caps, and dry-run semantics exactly.

## Non-goals

- A mechanical-only GitHub Action (that would drop the LLM layer).
- Running two writers (a mechanical action **and** this bot) against the same repo/labels — they would race on the `Stale` label.
- Re-working the sweep's decision math.
- Marketplace publication in this pass — git-installable is enough; the marketplace is a follow-on.

## Decisions (agreed)

- **D1 — Home:** a **new repo `omp-stale-bot`** (sibling of `omp-vault-harness`), with its own `plugin.json`, version, and install — not a second plugin inside `omp-vault-harness`.
- **D2 — Policy in the repo, plumbing local:** the repo owns the *policy* (what / when / caps); the operator's machine owns the *plumbing* (models, state dir, timeouts).
- **D3 — `dryRun` stays local:** it is the operator's live/dry switch, not repo policy. Flipping it is a local config edit, not a PR.
- **D4 — Policy fetched from GitHub:** at sweep start the plugin reads `.github/stale-bot.json` from the repo's **default branch** via `gh` (authoritative, merged, no dependence on a fresh local clone). An optional local `repoPath` checkout remains available for the drafter to inspect code when vetting a veto.
- **D5 — Behavior preserved:** the sweep math, buckets, scoring, caps, idempotency, cooldowns, and dry-run are unchanged. This is a packaging + config-sourcing change, not a re-implementation.

## Architecture

### Components and ownership

| Component | Home | Role |
|---|---|---|
| `omp-stale-bot` (OMP plugin) | new repo | All bot logic: sweep, drafter/veto agent, `gh` client, runner, state, OMP commands, skill. Generic over any repo. |
| `.github/stale-bot.json` | powerhouse monorepo (and any target repo) | Declarative per-repo policy the plugin fetches. |
| `~/.omp/stale-bot-conf/` | operator machine | OMP plumbing + `dryRun`. |

### Plugin repo layout

```
omp-stale-bot/
  .omp-plugin/plugin.json        name "stale-bot"
  package.json                   omp.extensions: [extension/index.ts]
  extension/index.ts             stale_* OMP commands/tools (start/stop/status/inspect)
  harness/
    run.mjs                      CLI entry: --once, --max-tasks, --config <dir>
    lib/config.mjs               NEW: load local config + fetch + merge repo policy
    lib/sources/stale.mjs        the sweep (ported from omp-vault-harness)
    lib/sources/github.mjs       gh API client (issues, timeline, labels, comments)
    lib/runner-process.mjs       CLI runner (omp -p --mode json)
    stale-config.example.json    local config template (plumbing + dryRun only)
  agents/stale-bot.md            the drafter/veto task agent
  skills/stale-bot/SKILL.md      operating skill
  schema/stale-bot.schema.json   JSON Schema for the repo policy file
  docs/superpowers/specs/        (this spec, canonical home)
```

The vault/issue-flow machinery (`vault.mjs`, `wbs.mjs`, `pipeline.mjs`, `triage.mjs`, …) **stays** in `omp-vault-harness`; only the `stale` source, its config, agent, and skill move out. The runner seam (`runAgent` injection) and its two implementations carry over unchanged. Small shared helpers the stale source needs (`github.mjs`, `runner-process.mjs`, `text.mjs`, `state.mjs`) are **copied** into the new repo, not imported across — D1 keeps the two plugins independent.

### Config layering (D2/D3)

Two sources, merged at sweep start with field-level precedence:

1. **Local machine config** (`<configDir>/config.json`, default `~/.omp/stale-bot-conf/`) — OMP plumbing: `workerModel`, `reviewModel`, `model`, `stateDir`, `pollSeconds`, `taskTimeoutMin`, `reviewTimeoutMin`, `roundTimeoutMin`, `maxWorkerRounds`, `maxReviewRounds`, `delivery`, and **`stale.dryRun`**.
2. **Repo policy** (fetched) — the rest of the `stale` block (schema below).

Precedence: for any `stale.*` **policy** field, the **repo policy wins** when present, else the local config, else a built-in default. **Plumbing** fields are always local. **`dryRun` is always local** and is not part of the repo policy.

### Policy fetch (D4)

- Resolve the target repo **only from local config** `stale.repo` (e.g. `powerhouse-inc/powerhouse`) — it is the sole source of the fetch target (chicken-and-egg: you need the repo name to know where to fetch the policy file from).
- Fetch `repos/{repo}/contents/.github/stale-bot.json` at the default branch via `gh api -X GET` (the bot already authenticates via `gh`). Parse JSON.
- **File absent** → fall back to the local config's `stale` block (today's fully-local behavior) and log a warning. This keeps the plugin usable against repos that have not adopted the policy file.
- **Malformed JSON / network error** → same fallback + warning; a bad policy file never aborts a run.
- The policy file is read-only; the bot never writes it.

### Repo policy file schema

`.github/stale-bot.json` — every field optional; built-in defaults shown.

```json
{
  "repo": "powerhouse-inc/powerhouse",
  "staleLabel": "Stale",
  "exemptLabels": ["help wanted", "good first issue", "dependencies"],
  "daysBeforeStale": 60,
  "daysBeforeClose": 7,
  "botLogins": [],
  "maxStalePerSweep": 30,
  "maxClosePerSweep": 30,
  "maxUnstalePerSweep": 30,
  "sweepEveryHours": 24,
  "coolDays": 30
}
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `repo` | string | (informational) | `owner/name`. **Informational only** — the fetch target always comes from local `stale.repo`; this field documents which repo the file belongs to. |
| `staleLabel` | string | `"Stale"` | Label applied to staled issues. |
| `exemptLabels` | string[] | `[]` | Issues carrying any of these are never staled/closed. |
| `daysBeforeStale` | number | 60 | Quiet days before an open issue becomes stale (bucket B). |
| `daysBeforeClose` | number | 7 | Quiet days after staling before closing as `not_planned` (bucket A). |
| `botLogins` | string[] | `[]` | Extra login names to treat as the bot; the posting identity (`selfLogin`) is always treated as self, so the bot's own activity never re-activates an issue. |
| `maxStalePerSweep` / `maxClosePerSweep` / `maxUnstalePerSweep` | number | 30 | Per-sweep action caps. |
| `sweepEveryHours` | number | 24 | Minimum interval between sweeps (enforced from sweep state). |
| `coolDays` | number | 30 | Cooldown after a drafter veto. |

### Sweep flow (data flow)

```
cron / `run.mjs --once`
  → load local config (<configDir>)
  → fetch repo policy (gh, default branch)                    [D4]
  → merge (precedence above) → effective policy
  → load sweep state (<stateDir>/stale-state.json)
  → enforce sweepEveryHours (skip if too soon)
  → enumerate open issues (gh)
  → score + bucket (B new-stale, A close/re-activate); apply exemptLabels
  → for each candidate (up to caps):
        spawn stale-bot agent round (runner seam) → draft comment + optional veto
        veto  → cool for coolDays, no write
        else  → idempotent paired write: [comment] then [label] / [final msg] then [close]
  → update sweep state (last sweep, vetoes/cooldowns)
  → log summary line
```

`dryRun: true`: identical through the write step; drafts are logged, nothing is posted.

### OMP integration

- `extension/index.ts` registers the `stale_*` commands/tools (start-once, status, inspect a sweep, read a draft); the `stale-bot` agent stays discoverable for a one-off second opinion, as today.
- `skills/stale-bot/SKILL.md` updated to the new config model (local plumbing + fetched repo policy).

## State and idempotency (unchanged)

- `<stateDir>/stale-state.json`: last-sweep timestamp, per-issue vetoes + cooldowns.
- Every write re-checks live GitHub state first; comment-before-label and final-message-before-close pairing; per-sweep caps. A mid-sweep kill resumes on the next run; nothing is posted twice.

## Error handling

- **Policy fetch failure** (network / 404 / malformed JSON) → warn + fall back to the local `stale` block (today's behavior); the sweep proceeds.
- **Agent round with no parseable verdict** (as seen on #1789 / #2522 today) → no writes, issue not advanced, retried next sweep (existing behavior).
- **`gh` auth failure** → fail fast with an actionable message.

## Testing

- Port the existing stale source suite (buckets, scoring, caps, veto, idempotency, dry-run) to the new repo.
- New: **config-merge** tests — repo policy wins; local fills gaps; `dryRun` always local; missing file → local fallback.
- New: **policy-fetch** tests — happy path; 404 → fallback; malformed JSON → fallback; default-branch resolution.

## Rollout

1. Create `omp-stale-bot`; port `stale.mjs`, `github.mjs`, the runner seam, `agents/stale-bot.md`, the skill; add `lib/config.mjs` (load + fetch + merge) and `schema/stale-bot.schema.json`; package as an OMP plugin.
2. Install it (lockfile entry `stale-bot`); create the `Stale` label on powerhouse if absent.
3. Add `.github/stale-bot.json` to the monorepo (PR).
4. Point the operator's local config at it; keep `dryRun: true`; run one sweep; review the drafts.
5. Operator flips `dryRun: false` locally to go live.

## Open questions

- **Cutover of the existing cron:** swap the cron's `HARNESS_DIR`/path to the new plugin in one edit (recommended), or run both briefly? Recommend the single-edit swap.
- **Retiring the old profile:** remove the `stale` profile from `omp-vault-harness` at cutover, or leave a thin alias that defers to the new plugin? Decide at cutover; removal is cleaner.
- **Local override for testing:** the missing-file fallback already covers local-only use; a dedicated override path is a nice-to-have, not required.
- **Marketplace publication** as a follow-on once git-install is proven.
