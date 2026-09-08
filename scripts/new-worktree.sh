#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/new-worktree.sh <name> [branch] [base]
#
# Creates an isolated worktree for this repo and prepares it so tests and
# type checking work immediately. A fresh worktree has no built workspace
# dependencies, and the per-package test suites and tsc project references
# resolve against the built dist/ and .tsbuild/ outputs of sibling
# packages, so a just-cloned worktree fails to run most tests until those
# are built. This script does the whole preparation:
#
#   1. git worktree add  ->  $PH_WORKTREE_ROOT/<project>/<name>
#   2. pnpm install      (node_modules + workspace links)
#   3. pnpm build        (curated workspace package builds, in dependency
#                          order - the same list CI builds)
#   4. pnpm tsc          (tsc --build: .tsbuild project-reference outputs
#                          that dependent packages' tsc resolves against)
#
# Arguments:
#   name      Worktree directory name. Issue work should be
#             "<issue>-<slug>", e.g. 2973-package-teardown.
#   branch    Branch to create (or check out, if it already exists).
#             Default: fix/<name>.
#   base      Commit to branch from. Default: main.
#
# Environment:
#   PH_WORKTREE_ROOT  Parent directory of the per-project worktree folder
#                     (default: $HOME/.worktrees). The worktree is created
#                     at $PH_WORKTREE_ROOT/<project-name>/<name>.
#
# Exit codes:
#   0  Worktree created and prepared.
#   1  Usage/setup error (bad arguments, worktree dir or branch conflict).
#   2  pnpm install or pnpm build failed.
#   3  pnpm tsc reported errors. The worktree is still usable; the errors
#      are listed and are usually pre-existing on the base branch.

if [[ $# -lt 1 || $# -gt 3 || "$1" == "-h" || "$1" == "--help" ]]; then
  awk '/^# Usage:/{f=1} f && /^#/{sub(/^# ?/,""); print; next} f{exit}' "$0"
  exit 1
fi

name="$1"
branch="${2:-fix/$name}"
base="${3:-main}"

repo_root="$(git rev-parse --show-toplevel)"
project="$(basename "$repo_root")"
worktree_root="${PH_WORKTREE_ROOT:-$HOME/.worktrees}"
worktree_dir="$worktree_root/$project/$name"

if [[ -e "$worktree_dir" ]]; then
  echo "Error: '$worktree_dir' already exists." >&2
  exit 1
fi

# A fresh worktree resolves sibling packages against their built outputs, so
# a plain checkout cannot run most tests. Keep the base reasonably current.
git fetch origin --quiet 2>/dev/null || true
if [[ "$base" == "main" ]] && git rev-parse --verify --quiet origin/main >/dev/null \
   && git rev-list --quiet main..origin/main | grep -q .; then
  echo "Warning: local 'main' is behind 'origin/main'; branching from origin/main instead." >&2
  base="origin/main"
fi

mkdir -p "$(dirname "$worktree_dir")"

# -b only when the branch is new; otherwise check out the existing branch.
if git show-ref --verify --quiet "refs/heads/$branch"; then
  git worktree add "$worktree_dir" "$branch"
else
  git worktree add -b "$branch" "$worktree_dir" "$base"
fi

echo "Worktree: $worktree_dir (branch: $branch, base: $base)"
cd "$worktree_dir"

echo
echo "== pnpm install"
pnpm install || exit 2

echo
echo "== pnpm build"
pnpm build || exit 2

echo
echo "== pnpm tsc"
if ! pnpm tsc; then
  echo
  echo "Warning: 'pnpm tsc' reported errors (usually pre-existing on the base" >&2
  echo "branch; a stale incremental build in the main checkout can hide them)." >&2
  echo "The worktree is still usable; packages whose tsc failed may report" >&2
  echo "TS6305/TS7006 until their own .tsbuild outputs exist." >&2
  exit 3
fi

echo
echo "Ready: $worktree_dir"
