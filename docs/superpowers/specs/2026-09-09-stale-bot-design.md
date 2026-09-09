# Stale-Bot Standalone Tool Design

- Status: **Proposed — awaiting review**
- Date: 2026-09-09
- Owner: froid
- Supersedes: the `stale` profile inside the `omp-vault-harness` OMP plugin, and the earlier plugin approach (`2026-09-09-stale-bot-plugin-design.md`, dropped).
- Home: `~/stale-bot/` — a plain folder, not a plugin, not a repo.

## Background

A stale-issue bot already runs daily against `powerhouse-inc/powerhouse` (~400 open issues) as the `stale` profile of the private `omp-vault-harness` OMP plugin, driven by a cron on the operator's machine:

```
HARNESS_DIR=~/.omp/stale-bot-conf node .../omp-vault-harness-stale/harness/run.mjs --once
```

It is currently in `dryRun: true` (drafts and logs, posts nothing). It is coupled to the vault-harness plugin — shared identity, versioning, install — even though the stale bot and the vault knowledge-harness are unrelated, and it is not reusable or installable by anyone else.

**Decision (revised):** rather than packaging it as a standalone OMP *plugin* (the earlier direction), extract it into a **plain self-contained folder** — `~/stale-bot/` — that runs headless against the powerhouse repo. No plugin manifest, no OMP devices/commands, no repo-policy fetch, no marketplace. The only genuinely new code is a small driver (`run.mjs`); everything else is a port of pieces that already work.

## What it is

The bot is two things:

- **the brain** — `agents/stale-bot.md`: a markdown agent definition. The harness decides *what* happens to each issue (stale / close / unstale / skip); the agent only supplies the *words*, and holds exactly one power — a reasoned veto (`skip`) when the decision is factually wrong.
- **the hands** — a deterministic Node sweep: enumerate open issues, score engagement, bucket candidates, apply exempt labels + per-sweep caps, keep state, and do idempotent paired writes (comment→label, final-message→close). This stays in code on purpose — it is the bookkeeping you do not want an LLM improvising.

A small **driver** (`run.mjs`) wires the two together and talks to GitHub via `gh`.

## Folder layout

```
~/stale-bot/
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

Nothing here is an OMP plugin: no `.omp-plugin/`, no `package.json#omp.extensions`, no `extension/index.ts`. It is a Node folder you run with `node run.mjs`.

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
- **Dry run:** identical up to the write step; drafts are logged, nothing is posted.

## The runner — `lib/runner-process.mjs` + `lib/agentdef.mjs`

Ported, unchanged. For each candidate the driver:

1. parses `agents/stale-bot.md` (`agentdef.mjs`) → system prompt + `@worker` model + tool list;
2. builds the brief (`buildBrief` in `stale.mjs`);
3. spawns `omp -p --mode json --max-time <roundTimeoutMin>m` (a headless OMP child), passing the system prompt explicitly; the child's `cwd` is the powerhouse checkout;
4. reads the NDJSON stream to the terminal `agent_end`; the final assistant message is ground truth (its `model`/`usage` are logged for attribution);
5. `parseStaleVerdict` extracts + validates the JSON verdict; a malformed verdict → the round fails, no write, retried next sweep.

## The driver — `run.mjs` (the only new code)

A small CLI that replaces the vault-harness `run.mjs` (which is coupled to worktrees, PRs, and a reviewer). It:

- loads `config.json` (from the folder, or `--config <dir>`);
- builds the stale source (`createStaleSource(cfg)`) and wires in `runAgent` (the runner above) + `ghJson` (the gh client);
- modes:
  - `--once` — run one sweep (drain candidates up to `max-tasks`), exit;
  - `--loop` — after each sweep, sleep `pollSeconds` and repeat (for a resident process);
  - `--dry-run` — force dry-run for this invocation (or `"dryRun": true` in config);
  - `--status` — print config + state, exit;
  - `--max-tasks N`, `--help`.
- no worktree, no PR, no reviewer, no health check — the stale bot is a single drafter round per issue.

## Config — `config.json`

All local (no fetch from GitHub). The current `stale` block promoted to the top level, plus the plumbing the driver needs:

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
  "stateDir": "~/stale-bot/state",
  "dryRun": true
}
```

- `model: "@worker"` (agent frontmatter) and `workerModel` resolve through `~/.omp/agent/config.yml` `modelRoles` (operator-global; not duplicated here).
- `dryRun` stays local by design — it is the operator's live/dry switch, not repo policy.
- A JSON example + field table lives in the README.

## Running it

```
cd ~/stale-bot
node run.mjs --once --dry-run     # one sweep, drafts only, nothing posted
node run.mjs --once               # one sweep, posts (when dryRun is false)
node run.mjs --loop               # sweep, sleep pollSeconds, repeat (resident)
```

Cron (daily, matching today's `sweepEveryHours: 24`):

```
0 9 * * * cd /home/froid/stale-bot && /usr/bin/node run.mjs --once >> /home/froid/stale-bot/logs/cron.log 2>&1
```

(Keeps the current behaviour; the `sweepEveryHours` state guard also protects against manual double-runs.)

## What we are NOT doing

- No OMP plugin (no `plugin.json`, no `package.json#omp.extensions`, no `extension/index.ts`, no OMP devices/commands, no lockfile entry).
- No repo policy file fetched from GitHub (the earlier `.github/stale-bot.json` idea is dropped — config is simply local to the folder).
- No skill / OMP session integration (the bot runs headless via cron; if you later want to spawn `stale-bot` from a session for a second opinion, that is a one-line add — drop the agent into `~/.omp/agent/agents/` — but it is not part of this).
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
- `config.json` promoted from the `stale` sub-block to top level; vault-specific fields (`vaultRepo`, `delivery`, `prRequired`, `reviewModel`, `maxReviewRounds`, `maxWorkerRounds`, `runHealth`, `profile`, `assignee`) dropped.
- Imports of vault helpers (e.g. `../paths.mjs`) in the ported files adjusted to the flat `lib/` layout.

The `omp-vault-harness` plugin is **not modified** by this work; its `stale` profile keeps working until cutover.

## Verification

1. **Dry run:** `node ~/stale-bot/run.mjs --once --dry-run` → inspect the draft log; confirm it enumerates, scores, buckets, and drafts the expected candidates and posts nothing; confirm the state file is written.
2. **Idempotency:** run the dry sweep twice in a row → the second run reports no new actions (state guard + `sweepEveryHours`).
3. **Live (small):** flip `dryRun: false`, run `--once --max-tasks 2`, and confirm the two chosen issues get the correct comment/label (or final-message/close) on GitHub, matching the drafts.
4. **Cron:** install the crontab line; let it run once unattended; check the log + a follow-up `--status`.

## Open questions

- **Retire the old profile?** At cutover, remove the `stale` profile from `omp-vault-harness` (cleaner) or leave it as a thin alias. Recommend removing once the standalone is proven live.
- **Config home:** keep config in the folder (`~/stale-bot/config.json`, proposed) vs. the existing `~/.omp/stale-bot-conf/`. Recommend the folder (a self-contained "folder you run").
- **Cron vs. resident `--loop`:** keep the daily cron (matches today) vs. a tmux/systemd resident `--loop`. Recommend the cron (simpler, matches the current setup).
