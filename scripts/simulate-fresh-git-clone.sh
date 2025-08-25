#!/usr/bin/env bash
set -euo pipefail

# Usage: ./purge-artifacts.sh [TARGET_DIR]
# Requires: git (run inside a Git repo). Only untracked ignored files/dirs are removed.

target_dir="${1:-.}"

# Ensure we're inside a git repo (somewhere up the tree)
if ! git -C "$target_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: '$target_dir' is not inside a Git repository; need git to parse .gitignore." >&2
  exit 1
fi

purge_dir() {
  local dir="$1"

  # Don't touch the repo metadata folder
  if [[ "$(basename "$dir")" == ".git" ]]; then
    return
  fi

  # 1) Delete everything matched by THIS directory's .gitignore
  if [[ -f "$dir/.gitignore" ]]; then
    (
      cd "$dir" || exit 1
      # List untracked ignored entries matched by the local .gitignore.
      # - --others: only untracked
      # - --ignored: include ignored
      # - --exclude-from=.gitignore: read patterns from this dir's .gitignore
      # - --directory: show a whole dir as one entry if it’s ignored
      # - -z: NUL delimit
      tmp="$(mktemp)"
      # shellcheck disable=SC2064
      trap "rm -f '$tmp'" RETURN

      if git ls-files --others --ignored --exclude-from=.gitignore --directory -z >"$tmp" 2>/dev/null; then
        if [[ -s "$tmp" ]]; then
          # Delete FIRST so we don't traverse things that are about to be removed
          xargs -0 rm -rf -- < "$tmp"
          echo "Purged artifacts in '$dir' according to .gitignore"
        fi
      fi
    )
  fi

  # 2) Recurse into remaining immediate subdirectories (max depth = full recursion)
  #    -type d ensures we don't follow symlinked dirs
  #    skip .git explicitly
  while IFS= read -r -d '' sub; do
    # It may have been deleted by the purge step; re-check
    [[ -d "$sub" ]] || continue
    [[ "$(basename "$sub")" == ".git" ]] && continue
    purge_dir "$sub"
  done < <(find "$dir" -mindepth 1 -maxdepth 1 -type d ! -name .git -print0)
}

purge_dir "$(realpath "$target_dir")"