# Release Guide

How to ship **dev**, **staging**, and **production** releases of this monorepo.

![Release Workflow Diagram](https://raw.githubusercontent.com/powerhouse-inc/powerhouse/refs/heads/main/release-flow.png)

The release pipeline is a single GitHub Action — `.github/workflows/release-branch.yml` — that calls `releases/release.ts` to drive Nx's release tooling. As a developer you only control:

1. **The branch you run it on** — this decides the release **channel**.
2. **The `release_mode` input** — this decides the **semver bump**.

You do **not** manually edit `package.json` versions or `CHANGELOG.md` files, **except** in the baseline case described in [Staging — Case 3](#case-3--fresh-staging-line-at-a-non-adjacent-version-baseline-required). Nx writes them, commits them, tags them, and pushes them on every run.

> The repo also has `.github/workflows/manual-release.yml` ("Full Managed Release") — it is **deprecated**. Do not use it for normal releases.

## Table of contents

- [Channels](#channels)
- [How `release_mode` maps to a semver bump](#how-release_mode-maps-to-a-semver-bump)
- [Triggering a release](#triggering-a-release)
- [Dev releases (main)](#dev-releases-main)
- [Staging releases](#staging-releases)
  - [Case 1 — Fresh staging line, target reachable in one semver step](#case-1--fresh-staging-line-target-reachable-in-one-semver-step-from-main)
  - [Case 2 — Next prerelease on an existing staging branch](#case-2--next-prerelease-on-an-existing-staging-branch)
  - [Case 3 — Fresh staging line at a non-adjacent version](#case-3--fresh-staging-line-at-a-non-adjacent-version-baseline-required)
- [Production releases](#production-releases)
  - [Step 1 — Create the production release branch](#step-1--create-the-production-release-branch)
  - [Step 2 — Update `RELEASE-NOTES.md`](#step-2--update-release-notesmd)
  - [Step 3 — Trigger the Release Branch workflow](#step-3--trigger-the-release-branch-workflow)
  - [Step 4 — Wait for the workflow to complete](#step-4--wait-for-the-workflow-to-complete)
  - [Step 5 — Announce in `#coredev-releases`](#step-5--announce-in-coredev-releases)
  - [Hot-fix flow](#hot-fix-flow)
  - [Reference — `RELEASE-NOTES.md` format conventions](#reference--release-notesmd-format-conventions)
- [What the release commit contains](#what-the-release-commit-contains)
- [After the release job](#after-the-release-job)
- [Troubleshooting](#troubleshooting)
- [Quick reference](#quick-reference)

---

## Channels

| Branch                       | Channel    | npm dist-tag | Version shape     |
| ---------------------------- | ---------- | ------------ | ----------------- |
| `main`                       | dev        | `dev`        | `X.Y.Z-dev.N`     |
| `release/staging/<label>`    | staging    | `staging`    | `X.Y.Z-staging.N` |
| `release/production/<label>` | production | `latest`     | `X.Y.Z`           |

The `<label>` is a human-readable hint — Nx does **not** parse it. The actual published version comes from the current workspace `package.json` plus the `release_mode` input. Pick a label that matches what you intend to ship (e.g. `release/staging/6.0.3`) so the branch is readable in the GitHub UI.

Any branch name that doesn't match the three patterns above will cause the release script to throw.

## How `release_mode` maps to a semver bump

`releases/release.ts` rewrites your chosen mode based on channel before handing it to Nx:

| Channel       | Mode you pick               | Effective Nx specifier               | preid             |
| ------------- | --------------------------- | ------------------------------------ | ----------------- |
| dev / staging | `prerelease`                | `prerelease`                         | `dev` / `staging` |
| dev / staging | `patch` / `minor` / `major` | `prepatch` / `preminor` / `premajor` | `dev` / `staging` |
| production    | `prerelease`                | **rejected — throws**                | —                 |
| production    | `patch` / `minor` / `major` | `patch` / `minor` / `major`          | none              |

Prerelease counters in this repo start at `.1`, not `.0` (verifiable from existing tags like `v5.3.0-staging.1`). So `inc('6.0.0-dev.X', 'prerelease', 'staging')` lands on `6.0.0-staging.1`.

## Triggering a release

GitHub → **Actions** → **Release Branch** → **Run workflow**:

- Set **Use workflow from** to the release branch you want to publish from.
- Pick `release_mode`.
- Optionally toggle `dry_run` to simulate with no npm/git side effects.

The other inputs (`skip_publish`, `skip_changelog`, `skip_push`, `skip_git_tag`, `skip_stage`, `skip_commit`, `verbose`) are **recovery flags** for reruns after partial failures — leave them off for normal runs.

Concurrency is per-branch (`group: release-monorepo-${{ github.ref_name }}`) and **queues** rather than cancelling, so back-to-back runs on the same branch serialize safely.

---

## Dev releases (main)

Main auto-releases every night at **02:00 UTC** via the cron defined in the workflow. No action needed.

If you need an immediate dev release (e.g. another team is blocked waiting on it), run **Release Branch** on `main` with `release_mode=prerelease`. It publishes `X.Y.Z-dev.N+1`.

---

## Staging releases

> Staging releases do **not** require updating `RELEASE-NOTES.md` or posting to Discord — those are part of the [Production flow](#production-releases). You can optionally draft notes early during a staging cycle; see the drafting tip at the bottom of the Production section.

There are **three** cases. Pick the one that matches your situation.

### Case 1 — Fresh staging line, target reachable in one semver step from main

Use when main is at `X.Y.Z-dev.N` and your target first publish is one of:

- `X.Y.Z-staging.1`
- `X.Y.(Z+1)-staging.1`
- `X.(Y+1).0-staging.1`
- `(X+1).0.0-staging.1`

Anything else → see [Case 3](#case-3--fresh-staging-line-at-a-non-adjacent-version-baseline-required).

```bash
git checkout main && git pull --ff-only
git checkout -b release/staging/<X.Y.Z>
git push -u origin release/staging/<X.Y.Z>
```

Trigger **Release Branch** on the new branch:

| Target first publish (from main `6.0.0-dev.239`) | `release_mode` |
| ------------------------------------------------ | -------------- |
| `6.0.0-staging.1`                                | `prerelease`   |
| `6.0.1-staging.1`                                | `patch`        |
| `6.1.0-staging.1`                                | `minor`        |
| `7.0.0-staging.1`                                | `major`        |

Nx writes the new version into every workspace `package.json`, generates changelogs, publishes to npm with the `staging` dist-tag, pushes a `chore(release): publish <version>` commit, and tags `v<version>`.

### Case 2 — Next prerelease on an existing staging branch

Use when `release/staging/<X.Y.Z>` already exists at `X.Y.Z-staging.N` and you want to bring in the latest from main and publish `X.Y.Z-staging.N+1`.

```bash
git checkout release/staging/<X.Y.Z>
git pull --ff-only
git merge origin/main
```

Resolve conflicts. `package.json` (root + every workspace) and `CHANGELOG.md` will almost always conflict because both sides have been bumped.

> ⚠️ **Always keep the staging side for `package.json` `"version"` fields and `CHANGELOG.md` content.** If you accidentally take main's `-dev.N` versions, the next release will bump from `-dev.N` and ship the wrong tag.

Fast path for the version-file conflicts:

```bash
git checkout --ours -- package.json '**/package.json' CHANGELOG.md '**/CHANGELOG.md'
git add package.json '**/package.json' CHANGELOG.md '**/CHANGELOG.md'
# resolve any remaining (non-version) conflicts normally, then:
git commit
git push
```

Trigger **Release Branch** on the staging branch with `release_mode=prerelease`. Publishes `X.Y.Z-staging.N+1`.

### Case 3 — Fresh staging line at a non-adjacent version (baseline required)

Use when main is at `X.Y.Z-dev.N` and your target is **not** reachable by a single semver step. Most common example: main at `6.0.0-dev.239`, target first publish `6.0.3-staging.1` (the `6.0.1` and `6.0.2` lines were already cut on previous staging branches).

Semver `inc()` only steps by one in any direction, so the workflow alone can't get you there. You set the baseline by hand, then let the workflow do its normal `prerelease` bump from it.

```bash
git checkout main && git pull --ff-only
git checkout -b release/staging/<X.Y.Z>

# Set the baseline ONE prerelease number BELOW your desired first publish.
# To publish 6.0.3-staging.1 → baseline 6.0.3-staging.0.
npx nx release version <X.Y.Z-staging.N-1>

# Sanity check: every workspace package.json should report the same baseline.
git grep -h '"version":' -- '**/package.json' | sort -u

git add -A
git commit -m "chore(release): set baseline <X.Y.Z-staging.N-1> for staging cut"
git push -u origin release/staging/<X.Y.Z>
```

Trigger **Release Branch** on the new branch with `release_mode=prerelease`. Nx bumps the trailing number `N-1 → N` and publishes `X.Y.Z-staging.N`.

**Worked example — release `6.0.3-staging.1` from main at `6.0.0-dev.239`:**

```bash
git checkout main && git pull --ff-only
git checkout -b release/staging/6.0.3
npx nx release version 6.0.3-staging.0
git add -A
git commit -m "chore(release): set baseline 6.0.3-staging.0 for staging cut"
git push -u origin release/staging/6.0.3
# Then GitHub → Actions → Release Branch → Run on release/staging/6.0.3
# with release_mode=prerelease.
```

End state on the branch:

```
<sha>   chore(release): publish 6.0.3-staging.1                        ← CI
<sha>   chore(release): set baseline 6.0.3-staging.0 for staging cut   ← you
…       (main history)
```

Why baseline at `.0` and not `.1`: the workflow has no "publish exactly this version" mode. `release_mode=prerelease` always increments the trailing number, so the baseline must be **one below** the desired first publish.

If your first attempt fails after the baseline commit but before a successful publish, just retrigger the workflow — the baseline is still on the branch, so Nx will bump from it on the next run.

---

## Production releases

Production releases follow a **procedural flow** — do the steps in order. They are the only release type that requires updating `RELEASE-NOTES.md` and posting an announcement to Discord.

> `release_mode=prerelease` is **rejected for production** (the script throws). Production always uses `patch`, `minor`, or `major`.

### Step 1 — Create the production release branch

Always branch from the **staging** branch you are promoting:

```bash
git checkout release/staging/<X.Y.Z>
git pull --ff-only
git checkout -b release/production/<X.Y.Z>
git push -u origin release/production/<X.Y.Z>
```

For a hot-fix on an already-released production version, see [Hot-fix flow](#hot-fix-flow) below.

### Step 2 — Update `RELEASE-NOTES.md`

`RELEASE-NOTES.md` at the repo root is the **human-readable changelog** for the Powerhouse community. It is **separate from `CHANGELOG.md`** (which Nx generates per-commit automatically) and is curated by hand: highlights, breaking changes, migration steps, "what to try" callouts, and links to docs.

The release script does **not** stage `RELEASE-NOTES.md` (it only stages `package.json`, `CHANGELOG.md`, `COMMANDS.md`, `COMMANDS-LEGACY.md`). You commit and push the update **yourself**, on the production branch, **before** triggering the workflow in Step 3. The chore-release commit then lands on top of it.

From the production release branch, in Claude Code, run the project skill:

```
/release-notes
```

The skill will:

1. Ask which production version you're releasing.
2. Auto-detect the previous production tag (highest `vX.Y.Z` with no prerelease suffix) and confirm it with you.
3. Pull the commit list and changed-file list for `<PREV_TAG>..HEAD`.
4. Cross-reference the Nx-generated `CHANGELOG.md` entries that fall in that range.
5. Read `RELEASE-NOTES.md` to mirror the existing format / tone / emoji vocabulary.
6. Open the actual diffs (`git show <sha>`) for every breaking and notable feat — so code samples and API shapes are pulled from real code, not invented.
7. Prepend the drafted section to `RELEASE-NOTES.md`.
8. Produce a copy-paste-ready **Discord announcement** for `#coredev-releases` (under 2000 chars, no markdown headings, bare URLs only). **Save this message — you'll use it in Step 5.**
9. Report back: range covered, commit counts, subsections produced, Discord message length, anything intentionally left out, and a review checklist.

> Not running this in Claude Code? Open `.claude/skills/release-notes/SKILL.md` and follow the same steps manually — it's written to be readable by a human as well.

While the skill works, watch for these failure modes and push back:

- Bullets that paraphrase commit subjects without verifying behavior.
- Code samples invented from type names rather than copied from the diff.
- Fabricated academy / docs links — academy URLs should only appear if the commits themselves added them.
- Tone drift (e.g. marketing voice in a section that historically reads like release notes).

Review the generated content carefully:

1. Re-read every feature claim against `git show <sha>` for the cited commit.
2. Verify each linked URL resolves (both in the file and in the Discord message).
3. Confirm migration steps are runnable as written.
4. Cross-check breaking-change before/after blocks against the actual diff.
5. Preview the Discord message by pasting it into a DM to yourself before posting to `#coredev-releases`.

Then commit and push **before** triggering the workflow in Step 3:

```bash
git add RELEASE-NOTES.md
git commit -m "docs: release notes for v<X.Y.Z>"
git push
```

End state on the branch after Step 3 runs:

```
<sha>   chore(release): publish <X.Y.Z>             ← CI in Step 3
<sha>   docs: release notes for v<X.Y.Z>            ← you, Step 2
<sha>   …staging history…
```

### Step 3 — Trigger the Release Branch workflow

GitHub → **Actions** → **Release Branch** → **Run workflow**:

- Branch: `release/production/<X.Y.Z>`
- `release_mode`: `patch` (or `minor` / `major` per the table below)

| Staging current at | `release_mode` | Production publishes |
| ------------------ | -------------- | -------------------- |
| `6.1.0-staging.7`  | `patch`        | `6.1.0`              |
| `6.1.0-staging.7`  | `minor`        | `6.1.0`              |
| `6.1.0-staging.7`  | `major`        | `7.0.0`              |

For a normal promotion of `X.Y.Z-staging.N` to `X.Y.Z`, use `patch` — semver simply strips the prerelease suffix.

### Step 4 — Wait for the workflow to complete

The workflow does the actual release (versioning, changelog, publish, tag, push) and then runs the post-release jobs listed in [After the release job](#after-the-release-job). Watch the GitHub Actions UI until everything is green.

A failure posts to Discord via the `DISCORD_FAILURES` webhook. **None of the post-release steps roll back the npm publish** — once npm has the version, the version is burned. Operator action is required to recover.

### Step 5 — Announce in `#coredev-releases`

Once the workflow finishes successfully, paste the Discord message produced by the skill in Step 2 into the **`#coredev-releases`** channel.

If you lost the message, rerun `/release-notes` against the same range — it's deterministic and will produce the same output.

### Hot-fix flow

For a hot-fix on an already-released production version (`X.Y.Z+1`): cut a new staging line for `X.Y.(Z+1)` first using the [Case 3](#case-3--fresh-staging-line-at-a-non-adjacent-version-baseline-required) flow (because main is on a different version), then promote via a fresh `release/production/X.Y.(Z+1)` branch — following **Steps 1–5** above.

### Reference — `RELEASE-NOTES.md` format conventions

The `/release-notes` skill enforces these automatically. Documented here for visibility, hand-written entries, and the optional drafting-during-staging path.

- Newest version at the **top**, directly under the `# Release Changelog` heading. Never reorder or rewrite existing entries.
- Section header: `## 🚀 **v<X.Y.Z>**` — always the **final production version** (`v6.0.0`), never a staging tag (`v6.0.0-staging.7`).
- Common subsections (include only what applies):
  - `### ✨ Highlights` — 2–4 numbered themes.
  - `### NEW FEATURES` — one block per notable feat with `#### <emoji> <Title>`, prose, and a usage example.
  - `### BREAKING CHANGES` — title per breakage, before/after code blocks, per-item migration notes.
  - `### MIGRATION GUIDE` / `### MIGRATION STEPS` — ordered, runnable steps.
  - `### BUG FIXES AND IMPROVEMENTS` / `### 🐞 Bug Fixes` / `### IMPROVEMENTS`.
  - `### DOCUMENTATION` — links to academy / docs pages that ship with the release.
- Use **"✅ What to try:"** callouts when the change is something a consumer can exercise.
- Match the emoji vocabulary from prior entries (🚀 version, ✨ highlights, 🔐 auth, 🛡️ permissions, 🔍 inspector, ⚡ perf, 🐞 bug fixes, 🛠️ tooling). When in doubt, mirror the closest prior release.

> **Drafting during the staging cycle:** you can run `/release-notes` against a `release/staging/<X.Y.Z>` branch too — anchor on the latest production tag and target the version you'll eventually promote. Commit the draft to staging so reviewers can comment as more changes land. When you cut the production branch from staging, the draft comes along and only needs final polish.

---

## What the release commit contains

`releases/release.ts` only stages these paths into the auto-generated `chore(release): publish <version>` commit:

- `package.json` (root and every workspace)
- `CHANGELOG.md` (root and every workspace)
- `COMMANDS.md`, `COMMANDS-LEGACY.md`

If you push manual edits to any of those files on a release branch **outside** of the explicit baseline commit in [Case 3](#case-3--fresh-staging-line-at-a-non-adjacent-version-baseline-required), they'll be folded into the next release commit. Don't.

## After the release job

When `release_mode` is not a dry run, the workflow also runs:

- **Sentry sourcemap upload** for `powerhouse` and `ph-cli` projects.
- **publish-ph-binaries** — compiles `ph` for Mac/Linux/Windows and uploads them to the GitHub Release.
- **publish-docker** — builds and pushes Docker images for connect, switchboard, etc.
- **test-package-managers** — verifies npm/yarn/pnpm/bun can install the just-published packages.
- **trigger-downstream-packages** — fans out to dependent repos.

A failure in any of those steps posts to Discord via the `DISCORD_FAILURES` webhook. **None of them roll back the npm publish** — once npm has the version, the version is burned. Operator action is required to recover.

> For production releases, after this section runs green, post the Discord message from Production [Step 5](#step-5--announce-in-coredev-releases) to `#coredev-releases`. This is **not** the same channel as the failure webhook.

## Troubleshooting

- **"Cannot do a prerelease on production"** — you triggered the workflow on `release/production/*` with `release_mode=prerelease`. Use `patch`.
- **"Branch ... is invalid" / "must start with release/" / "invalid tag"** — branch name doesn't match `main`, `release/staging/<label>`, or `release/production/<label>`.
- **"No version changes detected — skipping release"** — Nx didn't find new commits worth releasing on this branch since the last tag. Confirm there are real commits since the last release tag.
- **Mixed versions across packages after `npx nx release version`** — a workspace is missing from the `projects` glob in `releases/release.ts` (currently: `packages/*`, `packages/analytics-engine/*`, `clis/*`, `apps/*`). Either add it there or hand-edit the missing `package.json` to the same baseline before committing.
- **Wrong base version published** — you ran a fresh staging or production cut without setting the baseline you needed. The npm version is now burned; cut a new line one prerelease number higher and move on.
- **Push rejected mid-release / rebase conflict** — another commit raced you on the release branch. npm is already poisoned at this point; coordinate, then rerun with `skip_publish=true` (and possibly `skip_changelog=true`) to finish the git side without republishing.

## Quick reference

| What you want                                     | Branch                           | Mode         | Notes                                                                      |
| ------------------------------------------------- | -------------------------------- | ------------ | -------------------------------------------------------------------------- |
| Nightly dev                                       | `main`                           | (cron)       | Auto at 02:00 UTC                                                          |
| Manual dev                                        | `main`                           | `prerelease` |                                                                            |
| Start `X.Y.Z-staging` from main `X.Y.Z-dev.*`     | `release/staging/X.Y.Z`          | `prerelease` | Case 1                                                                     |
| Start `X.Y.(Z+1)-staging` from main `X.Y.Z-dev.*` | `release/staging/X.Y.(Z+1)`      | `patch`      | Case 1                                                                     |
| Start `X.(Y+1).0-staging` from main `X.Y.Z-dev.*` | `release/staging/X.(Y+1).0`      | `minor`      | Case 1                                                                     |
| Next prerelease on existing staging branch        | existing `release/staging/X.Y.Z` | `prerelease` | Merge main first, keep staging side for `package.json` + `CHANGELOG.md`    |
| Non-adjacent staging cut (skip a patch number)    | `release/staging/X.Y.Z`          | `prerelease` | `npx nx release version <X.Y.Z-staging.N-1>` + commit before triggering CI |
| Promote staging to production                     | `release/production/X.Y.Z`       | `patch`      | Branch from the corresponding `release/staging/X.Y.Z`                      |
