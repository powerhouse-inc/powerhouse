#!/usr/bin/env bash
# Compares this run's per-job durations against the median of recent green
# baseline-branch runs of the same workflow. GitHub's run history is the
# dataset, so there is nothing to store or maintain.
#
# A job is flagged only when it exceeds BOTH gates — median * RELATIVE_THRESHOLD
# and median + ABSOLUTE_FLOOR_SECONDS — because observed runner variance on
# this repo swings +/- 90s on unchanged code. Warn-only by design: annotations,
# a step-summary table, and a sticky PR comment.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:?}"
RUN_ID="${GITHUB_RUN_ID:?}"
WORKFLOW_FILE="${WORKFLOW_FILE:?}"
BASELINE_BRANCH="${BASELINE_BRANCH:-main}"
SAMPLES="${SAMPLES:-10}"
RELATIVE_THRESHOLD="${RELATIVE_THRESHOLD:-1.25}"
ABSOLUTE_FLOOR_SECONDS="${ABSOLUTE_FLOOR_SECONDS:-60}"
MIN_SAMPLES=3
PR_NUMBER="${PR_NUMBER:-}"
COMMENT_MARKER="<!-- ci-duration-watch -->"

epoch() { date -u -d "$1" +%s; }

fmt() {
  local s=$1
  printf '%dm%02ds' $((s / 60)) $((s % 60))
}

# Emits "name<TAB>seconds" for every succeeded job of a run. The watch job
# itself is still in progress when this runs, so filtering on a success
# conclusion also excludes it.
run_jobs() {
  gh api "repos/$REPO/actions/runs/$1/jobs?per_page=100" --paginate \
    --jq '.jobs[] | select(.conclusion == "success") | [.name, .started_at, .completed_at] | @tsv' |
    while IFS=$'\t' read -r name started completed; do
      printf '%s\t%s\n' "$name" "$(($(epoch "$completed") - $(epoch "$started")))"
    done
}

current_file=$(mktemp)
run_jobs "$RUN_ID" > "$current_file"
if [ ! -s "$current_file" ]; then
  echo "no completed successful jobs in this run to compare"
  exit 0
fi

baseline_ids=$(gh api \
  "repos/$REPO/actions/workflows/$WORKFLOW_FILE/runs?branch=$BASELINE_BRANCH&status=success&per_page=$SAMPLES" \
  --jq ".workflow_runs[] | select(.id != $RUN_ID) | .id")

baseline_file=$(mktemp)
for id in $baseline_ids; do
  run_jobs "$id"
done > "$baseline_file"

summary_rows=""
comment_rows=""
regressions=0

while IFS=$'\t' read -r name seconds; do
  durations=$(awk -F'\t' -v n="$name" '$1 == n { print $2 }' "$baseline_file" | sort -n)
  count=$(printf '%s\n' "$durations" | grep -c . || true)

  if [ "$count" -lt "$MIN_SAMPLES" ]; then
    summary_rows+="| ${name} | $(fmt "$seconds") | — | insufficient baseline (${count} samples) |"$'\n'
    continue
  fi

  median=$(printf '%s\n' "$durations" | awk '
    { a[NR] = $1 }
    END {
      if (NR % 2) print a[(NR + 1) / 2]
      else print int((a[NR / 2] + a[NR / 2 + 1]) / 2)
    }')

  delta=$((seconds - median))
  pct=$(awk -v c="$seconds" -v m="$median" 'BEGIN { printf "%+.0f", (c - m) / m * 100 }')

  breach=$(awk -v c="$seconds" -v m="$median" -v r="$RELATIVE_THRESHOLD" -v f="$ABSOLUTE_FLOOR_SECONDS" \
    'BEGIN { print (c > m * r && c > m + f) ? 1 : 0 }')

  if [ "$breach" = "1" ]; then
    regressions=$((regressions + 1))
    echo "::warning title=CI duration regression::${name} took $(fmt "$seconds") vs a $(fmt "$median") median over the last ${count} green ${BASELINE_BRANCH} runs (${pct}%)"
    summary_rows+="| ${name} | $(fmt "$seconds") | $(fmt "$median") | ⚠️ ${pct}% |"$'\n'
    comment_rows+="| ${name} | $(fmt "$seconds") | $(fmt "$median") | ${pct}% |"$'\n'
  else
    summary_rows+="| ${name} | $(fmt "$seconds") | $(fmt "$median") | ${pct}% |"$'\n'
  fi
done < "$current_file"

{
  echo "### CI duration watch"
  echo ""
  echo "Baseline: median of the last green \`${BASELINE_BRANCH}\` runs of \`${WORKFLOW_FILE}\` (up to ${SAMPLES} samples). Flag = > ×${RELATIVE_THRESHOLD} and > +${ABSOLUTE_FLOOR_SECONDS}s."
  echo ""
  echo "| Job | This run | Baseline median | Δ |"
  echo "| --- | --- | --- | --- |"
  printf '%s' "$summary_rows"
} >> "$GITHUB_STEP_SUMMARY"

if [ "$regressions" -eq 0 ]; then
  echo "all jobs within baseline"
  exit 0
fi

echo "${regressions} job(s) exceeded the baseline thresholds"

# Sticky PR comment: one comment per PR, updated in place.
if [ -n "$PR_NUMBER" ]; then
  body="${COMMENT_MARKER}
### ⚠️ CI duration regression

Compared with the median of the last green \`${BASELINE_BRANCH}\` runs of \`${WORKFLOW_FILE}\`:

| Job | This run | Baseline median | Δ |
| --- | --- | --- | --- |
${comment_rows}
This is a warning, not a failure — but a slow creep here is how jobs walk into their timeouts. If the slowdown is expected, say so in the PR; if not, it is worth a look before merging."

  existing=$(gh api "repos/$REPO/issues/$PR_NUMBER/comments?per_page=100" --paginate \
    --jq "[.[] | select(.body | startswith(\"$COMMENT_MARKER\"))][0].id // empty")

  if [ -n "$existing" ]; then
    gh api --method PATCH "repos/$REPO/issues/comments/$existing" -f body="$body" > /dev/null
  else
    gh api --method POST "repos/$REPO/issues/$PR_NUMBER/comments" -f body="$body" > /dev/null
  fi
  echo "posted sticky PR comment on #$PR_NUMBER"
fi

exit 0
