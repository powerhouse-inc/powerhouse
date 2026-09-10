# Open-Source Readiness (Issue #128) — Design Spec

> **Status:** approved 2026-09-10
> **Scope:** repository-root documentation only (no source code changes)
> **Companion plan:** `docs/superpowers/plans/2026-09-10-oss-docs.md`
> **Issue:** https://github.com/powerhouse-inc/powerhouse/issues/128

## 1. Why this spec exists

Issue #128 tracks making this repo "an open source project by Gitbook standards".
Three of the five checklist items were still open when this work started:

- a `CONTRIBUTING.md` explaining how to contribute
- a `CODE_OF_CONDUCT.md`
- making it easy for others to contribute

The public GitHub repo and the AGPL-3.0 `LICENSE` were already in place. This
spec covers only the remaining items.

## 2. What "easy to contribute" means here

The repo already has all the machinery a contributor needs — issue templates,
conventional-commit linting, a full CI matrix, a worktree preparation script,
and the spec/plan/evidence workflow — but nothing at the repo root tells a
first-time contributor that it exists. The README's "How to contribute"
section covers the package PR flow and contains one broken link. "Easy to
contribute" is therefore satisfied by discoverability, not by new tooling:

1. **`CONTRIBUTING.md`** (new, root) — the single entry point:
   prerequisites, setup, running the apps, testing, lint, commits, PRs,
   releases, and where to find work and documentation.
2. **`CODE_OF_CONDUCT.md`** (new, root) — Contributor Covenant v2.1, with
   reporting pointed at the Powerhouse contact page (the repo publishes no
   email address).
3. **README "How to contribute"** (modified) — a pointer to both new files,
   a "finding work" paragraph (good-first-issue / help-wanted search links,
   issue templates), the `feature/` → `feat/` branch-naming alignment, and
   the dead `release-package-manual.yml` link fixed to the actual release
   pipeline.

## 3. Content decisions

### 3.1 `CONTRIBUTING.md`

Every command and claim is verified against the repo's own configuration:

- Prerequisites mirror the README table (Node `>=24`, pnpm `latest`,
  bun 1.3.x, optional playwright chromium), including the worktree script's
  note on why `pnpm tsc` after `pnpm build` is required.
- Run commands use verified Nx targets: `nx start` / `nx dev` on
  `@powerhousedao/switchboard`, `nx dev` on `@powerhousedao/connect` (Vite),
  plus the no-build `docker compose` alternative.
- Testing: per-package `pnpm --filter=… test`, the curated root `pnpm test`
  set, and `pnpm simulate-ci-workflow` for full local CI.
- Commits: conventional commits, lowercase subject, max 200 characters, one
  package scope per commit — the same rules husky (`commitlint`) and CI
  enforce.
- Releases: no manual version or changelog edits; `main` auto-releases
  nightly (02:00 UTC, `dev` channel) via `release-branch.yml`; `RELEASE.md`
  is the authority for staging and production.
- Pointers: ADRs in `docs/adr/`, the `docs/superpowers` agent workflow, and
  the Academy (https://academy.vetra.io).

### 3.2 `CODE_OF_CONDUCT.md`

Standard Contributor Covenant v2.1 text. The contact section points at
https://www.powerhouse.inc/ — the contact page is the repo's only public
contact channel (no email address is published in the repo).

### 3.3 `README.md`

The "How to contribute to this project" section gains a short intro (links to
`CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`) and a "finding work" paragraph.
The existing package PR steps are kept, with:

- `feature/my-branch` → `feat/my-branch` (repo convention per
  `scripts/new-worktree.sh` and the repo's agent notes)
- the dead `…/workflows/release-package-manual.yml` link →
  `…/workflows/release-branch.yml`, with the "auto-release right after
  merge" wording corrected to the actual nightly dev-release behavior
  described in `RELEASE.md`.

## 4. Out of scope

- Creating or maintaining GitHub-side labels (`good first issue`,
  `help wanted`) and required-checks / branch-protection configuration —
  repo settings, not files.
- Issue-template changes, CI workflow changes, and anything under
  `apps/academy`.
- The deprecated `manual-release.yml` workflow (left in place per
  `RELEASE.md`).

## 5. Verification

The companion plan verifies by:

1. Confirming each new file exists at the expected path.
2. Cross-checking every command in `CONTRIBUTING.md` against a script or
   target that exists (`package.json` scripts, Nx target inference).
3. Confirming every link resolves: relative file links, the
   `release-branch.yml` workflow file, and well-formed GitHub search URLs.
4. Passing all commits through `commitlint` (husky runs it on every commit;
   CI re-checks on push).
5. The PR's **Check Commit** workflow running green.
