# Issue 128 — Open-Source Readiness: Evidence

Issue: https://github.com/powerhouse-inc/powerhouse/issues/128

## Checklist mapping

| #128 checklist item | Before | After | Evidence |
| --- | --- | --- | --- |
| Public repo on GitHub | done | unchanged | the repository is public |
| Valid OSS `LICENSE` | done (AGPL-3.0) | unchanged | `LICENSE` |
| `CONTRIBUTING.md` | missing | added | `CONTRIBUTING.md` (repo root) |
| `CODE_OF_CONDUCT.md` | missing | added | `CODE_OF_CONDUCT.md` (repo root, Contributor Covenant v2.1) |
| Easy to contribute | README-only section with one broken link | improved | README "How to contribute" now points at both new files, links the good-first-issue / help-wanted searches, and the dead release link is fixed |

## Verification

- Markdown-only change; no source code, CI workflow, or issue template touched.
- Every command in `CONTRIBUTING.md` cross-checked against: root
  `package.json` (`test`, `lint`, `tsc`, `simulate-ci-workflow`),
  `apps/switchboard/package.json` (`start`, `dev`),
  `apps/connect/package.json` (`dev`), `pnpm-workspace.yaml`,
  `.husky/pre-commit` and the `commitlint` config,
  `.github/workflows/check-commit.yml` (required-check steps), and
  `RELEASE.md` (nightly dev release at 02:00 UTC via `release-branch.yml`).
- All relative links in `README.md` and `CONTRIBUTING.md` resolve to files
  that exist; the fixed link points at the existing
  `.github/workflows/release-branch.yml` (the old
  `release-package-manual.yml` did not exist).
- Commits pass `commitlint` (conventional type/scope, lowercase subject,
  ≤200 characters) — enforced by the husky commit-msg hook and re-checked by
  the Check Commit CI workflow on the PR.

## Out of scope (repo settings, not files)

- Creating and maintaining the `good first issue` / `help wanted` labels on
  GitHub
- Required status checks / branch protection configuration
