# Stale-Bot Tool Design

- Status: **Proposed — awaiting review**
- Date: 2026-09-09
- Owner: froid
- Supersedes: the `stale` profile inside the `omp-vault-harness` OMP plugin, and the earlier plugin approach (`2026-09-09-stale-bot-plugin-design.md`, dropped).
- Home: `tools/stale-bot/` in the powerhouse monorepo — a plain folder, not a plugin. Versioned and PR-reviewable like the rest of the repo.

## Background

A stale-issue bot already runs daily against `powerhouse-inc/powerhouse` (~400 open issues) as the `stale` profile of the private `omp-vault-harness` OMP plugin, driven by a cron on the operator's machine:

```
HARNESS_DIR=~/.omp/stale-bot-conf node .../omp-vault-harness-stale/harness/run.mjs --once
```

It has been in `dryRun: true` (drafts and logs, posts nothing). It is coupled to the vault-harness plugin — shared identity, versioning, install — even though the stale bot and the vault knowledge-harness are unrelated.

**Decision (revised):** extract it into a **plain self-contained folder** in the monorepo — `tools/stale-bot/` — that runs headless against the powerhouse repo. No plugin manifest, no OMP devices/commands, no repo-policy fetch, no marketplace. The only genuinely new code is a small driver (`run.mjs`); everything else is a port of pieces that already work. It runs **live** by default (`dryRun: false`); a one-off `--dry-run` flag still exists for when you want drafts only.

## What it is

The bot is two things:

- **the brain** — `agents/stale-bot.md`: a markdown agent definition. The harness decides *what* happens to each issue (stale / close / unstale / skip); the agent only supplies the *words*, and holds exactly one power — a reasoned veto (`skip`) when the decision is factually wrong.
- **the hands** — a deterministic Node sweep: enumerate open issues, score engagement, bucket candidates, apply exempt labels + per-sweep caps, keep state, and do idempotent paired writes (comment→label, final-message→close). This stays in code on purpose — it is the bookkeeping you do not want an LLM improvising.

A small **driver** (`run.mjs`) wires the two together and talks to GitHub via `gh`.

## Folder layout

```
tools/stale-bot/
  run.mjs                  # NEW — the thin CLI driver (the only new code)
  config.json              # the policy + plumbing (see Config)
  agents/stale-bot.md      # the brain (ported, verbatim)
  lib/
    stale.mjs              # the sweep + per-issue logic (ported from the plugin)
    github.mjs             # gh API client (ported)
    agentdef.mjs           # parse agents/*.md frontmatter -> {systemPrompt, model, tools} (ported)
    runner-process.mjs     # spawn `omp -p --mode json`, parse NDJSON, extract verdict (ported)
    state.mjs              # state-file + logger plumbing (ported, trimmed)
  state/                   # stale-state.json (created at runtime)
  README.md                # what it is, how to run, config reference
```

Nothing here is an OMP plugin: no `.omp-plugin/`, no `package.json#omp.extensions`, no `extension/index.ts`. It is a Node folder you run with `node run.mjs`. It has no dependency on the monorepo's packages — it is a standalone script that shells out to `omp` and `gh`.

## The brain — `agents/stale-bot.md`

Markdown with frontmatter (ported verbatim from the current plugin agent):

```
---
name: stale-bot
description: Drafts the stale comment or closing message for one already-decided GitHub issue; returns a structured verdict and may veto with a reasoned skip. Posts nothing itself.
model: "@worker"
tools: read
output: { … verdict JSON schema … }
---
```

Body: the system prompt. Contract:

- The brief names the decided action (`stale` / `close` / `unstale` / `skip`), carries the issue (title, labels, body) and the non-bot comments, and specifies the exact text structure.
- The agent reads it all, detects the language from the title, writes the text, fills the summary fields, and ends with exactly one JSON line:
  `{"action":"stale|close|unstale|skip","language":"…","issueSummary":"…","activitySummary":"…","resolution":"…","comment":"…","closeBody":"…","reason":"…"}`
- Hard rules: never invent; do not contradict itself; empathetic; no emoji; under ~300 words.
- Veto (`skip`) only when posting would be factually wrong.
- `model: "@worker"` resolves through the operator's `~/.omp/agent/config.yml` `modelRoles.worker` (already set: `qwen3.8-27b-w4a16-defect`). `tools: read` — it reads the brief, never writes.

The driver parses this file with `agentdef.mjs` and hands the system prompt + model + tools to the headless runner. **No OMP discovery or plugin install is involved** — the file is read directly.

## The hands — the sweep (`lib/stale.mjs`)

Ported from the plugin's `harness/lib/sources/stale.mjs`; behavior unchanged:

- **Enumerate** open issues via `gh`; exclude closed and exempt-labelled (`help wanted`, `good first issue`, `dependencies`).
- **Engagement score** = `3×distinct users + 2×(comments+reactions) + weeks since last update` (bot logins and the posting identity are not "users").
- **Buckets:** B = open, not staled, quiet ≥ `daysBeforeStale` (60d) → stale candidates; A = already staled, quiet ≥ `daysBeforeClose` (7d) → close candidates (re-activated if there is qualifying human activity since the stale mark).
- **Caps** per sweep: `maxStalePerSweep` / `maxClosePerSweep` / `maxUnstalePerSweep` (30 each); highest engagement first.
- **`coolDays` (30)** cooldown after a veto.
- **Idempotent paired writes:** every write re-checks live GitHub state first; comment-before-label, final-message-before-close. A mid-sweep kill resumes next run; nothing is posted twice.
- **State** in `state/stale-state.json`: last-sweep timestamp, per-issue vetoes + cooldowns, recent sweep summaries.
- **`sweepEveryHours` (24)** minimum interval between sweeps (enforced via state).
- **Dry run:** identical up to the write step; drafts are logged, nothing is posted. Off by default here (the bot runs live); `--dry-run` re-enables it for a single invocation.

## The runner — `lib/runner-process.mjs` + `lib/agentdef.mjs`

Ported, unchanged. For each candidate the driver:

1. parses `agents/stale-bot.md` (`agentdef.mjs`) → system prompt + `@worker` model + tool list;
2. builds the brief (`buildBrief` in `stale.mjs`);
3. spawns `omp -p --mode json --max-time <roundTimeoutMin>m` (a headless OMP child), passing the system prompt explicitly; the child's `cwd` is the monorepo root;
4. reads the NDJSON stream to the terminal `agent_end`; the final assistant message is ground truth (its `model`/`usage` are logged for attribution);
5. `parseStaleVerdict` extracts + validates the JSON verdict; a malformed verdict → the round fails, no write, retried next sweep.

## The driver — `run.mjs` (the only new code)

A small CLI that replaces the vault-harness `run.mjs` (which is coupled to worktrees, PRs, and a reviewer). It:

- loads `config.json` (from the tool's folder, or `--config <dir>`);
- builds the stale source (`createStaleSource(cfg)`) and wires in `runAgent` (the runner above) + `ghJson` (the gh client);
- modes:
  - `--once` — run one sweep (drain candidates up to `max-tasks`), exit;
  - `--loop` — after each sweep, sleep `pollSeconds` and repeat (for a resident process);
  - `--dry-run` — force dry-run for this invocation only (drafts, no posts);
  - `--status` — print config + state, exit;
  - `--max-tasks N`, `--help`.
- no worktree, no PR, no reviewer, no health check — the stale bot is a single drafter round per issue.
- resolves relative paths (`stateDir`, `repoPath`) against the tool's own directory / the monorepo root so it runs the same from anywhere.

## Config — `config.json`

All local (no fetch from GitHub). The current `stale` block promoted to the top level, plus the plumbing the driver needs. `dryRun` is `false` — the bot runs live:

```json
{
  "repo": "powerhouse-inc/powerhouse",
  "repoPath": "~/powerhouse",
  "staleLabel": "Stale",
  "exemptLabels": ["help wanted", "good first issue", "dependencies"],
  "daysBeforeStale": 60,
  "daysBeforeClose": 7,
  "botLogins": [],
  "maxStalePerSweep": 30,
  "maxClosePerSweep": 30,
  "maxUnstalePerSweep": 30,
  "sweepEveryHours": 24,
  "coolDays": 30,
  "roundTimeoutMin": 10,
  "pollSeconds": 3600,
  "maxTasksPerRun": null,
  "workerModel": "@worker",
  "stateDir": "state",
  "dryRun": false
}
```

- `model: "@worker"` (agent frontmatter) and `workerModel` resolve through `~/.omp/agent/config.yml` `modelRoles` (operator-global; not duplicated here).
- `stateDir: "state"` resolves to `tools/stale-bot/state/` (the tool's own folder).
- `dryRun: false` → live posting by default; `--dry-run` overrides for a single invocation.
- A JSON example + field table lives in the README.

## Running it

```
cd tools/stale-bot
node run.mjs --once              # one sweep, LIVE (posts) — the default
node run.mjs --once --dry-run    # one sweep, drafts only, nothing posted
node run.mjs --once --max-tasks 3   # bound a sweep to N issues (good for a first live run)
node run.mjs --loop              # sweep, sleep pollSeconds, repeat (resident)
```

Cron (daily, matching `sweepEveryHours: 24`):

```
0 9 * * * cd /home/froid/powerhouse/tools/stale-bot && /usr/bin/node run.mjs --once >> /home/froid/powerhouse/tools/stale-bot/logs/cron.log 2>&1
```

(The `sweepEveryHours` state guard also protects against manual double-runs.)

## What we are NOT doing

- No OMP plugin (no `plugin.json`, no `package.json#omp.extensions`, no `extension/index.ts`, no OMP devices/commands, no lockfile entry).
- No repo policy file fetched from GitHub (config is local to the tool's folder).
- No skill / OMP session integration (the bot runs headless; spawning `stale-bot` from a session for a second opinion is a one-line add later — drop the agent into `~/.omp/agent/agents/` — not part of this).
- No marketplace publication.
- No rework of the sweep's decision math, scoring, caps, idempotency, or dry-run semantics.

## Porting notes

Copied from `/home/froid/omp-vault-harness-stale/`:

- `harness/lib/sources/stale.mjs` → `lib/stale.mjs` (drop the `sources/` nesting; keep `DEFAULTS`, `isBotLogin`, `engagementScore`, `parseStaleVerdict`, `buildBrief`, `processStaleTask`, `createStaleSource`, and the state-file helpers).
- `harness/lib/agentdef.mjs` → `lib/agentdef.mjs`
- `harness/lib/runner-process.mjs` → `lib/runner-process.mjs`
- the `gh` client the stale source calls (`ghJson`) → `lib/github.mjs`
- `harness/lib/state.mjs` → `lib/state.mjs` (trimmed to what the stale path uses: `createLogger`, `State`, `nowIso`, path helpers)
- `agents/stale-bot.md` → `agents/stale-bot.md` (verbatim)
- the `stale` block of `~/.omp/stale-bot-conf/config.json` → `config.json` (promoted + plumbing above)

Changed:

- **New** `run.mjs` (the driver) — the only new code.
- `config.json` promoted from the `stale` sub-block to top level; vault-specific fields (`vaultRepo`, `delivery`, `prRequired`, `reviewModel`, `maxReviewRounds`, `maxWorkerRounds`, `runHealth`, `profile`, `assignee`) dropped; `dryRun` set to `false`.
- Imports of vault helpers (e.g. `../paths.mjs`) in the ported files adjusted to the flat `lib/` layout; relative paths resolved against the tool's directory.

The `omp-vault-harness` plugin is **not modified** by this work; its `stale` profile keeps working until you decide to retire it.

## Verification

1. **Prereqs:** `gh auth status` (authenticated), `omp` on PATH, `@worker` role resolves.
2. **First live run (bounded):** `node run.mjs --once --max-tasks 3` → confirm the three highest-engagement candidates are drafted and **actually posted** on GitHub (correct comment/label, or final-message/close), matching the drafts; confirm the state file advances.
3. **Idempotency:** re-run immediately → no duplicate posts (state guard + live re-check).
4. **Full sweep / cron:** let an unbounded `--once` (or the cron) run; check the summary log + a follow-up `--status`.

## Open questions

- **Retire the old `stale` profile** in `omp-vault-harness` once the standalone is proven live? (recommend: yes)
- **Cron vs. resident `--loop`:** keep the daily cron (matches today; recommend) vs. a tmux/systemd resident `--loop`.
