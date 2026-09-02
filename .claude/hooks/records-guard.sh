#!/usr/bin/env bash
# Blocks a bench agent from reaching the record files by any route but the CLI.
#
# Reads a PreToolUse payload on stdin and exits 2 to block, with stderr going
# back to the agent as feedback. Roles: runner, analyst, verifier, none.
#
# A fabricated record with plausible numbers passes every schema check and
# every reference test, so the only defence is keeping a model off the number
# path. That is what the runner's anchored pipeline is for.

set -u

ROLE="${1:-none}"

deny() {
  printf '%s\n' "$1" >&2
  exit 2
}

PAYLOAD="$(cat)"

command -v node >/dev/null 2>&1 ||
  deny "records-guard needs node to read the tool payload, and refuses to pass commands through without it."

# node rather than jq. This script is also the project-wide hook, so anything
# it needs, it needs on every machine that opens the repo - and jq is not that.
# CI's node:24 image has no jq either. node is present wherever this repo is.
#
# One newline separates the two fields, and tool_name cannot contain one, so a
# command that does - a heredoc - still survives the split intact.
FIELDS="$(printf '%s' "$PAYLOAD" | node -e '
let raw = "";
process.stdin
  .on("data", (chunk) => (raw += chunk))
  .on("end", () => {
    let payload = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }
    const tool = typeof payload.tool_name === "string" ? payload.tool_name : "";
    const input = payload.tool_input;
    const command =
      input && typeof input.command === "string" ? input.command : "";
    process.stdout.write(tool + "\n" + command);
  });
')"
TOOL="${FIELDS%%$'\n'*}"
# Command substitution strips trailing newlines, so an empty command leaves no
# separator at all. Without this the command would inherit the tool name, and
# the empty-command check below - the one that refuses a call it cannot read -
# would never fire.
if [ "$TOOL" = "$FIELDS" ]; then
  CMD=""
else
  CMD="${FIELDS#*$'\n'}"
fi

# A Bash call whose command the guard cannot see is a call it cannot check.
if [ "$TOOL" = "Bash" ] && [ -z "$CMD" ]; then
  deny "records-guard could not read the command out of the payload, so it is blocked. Report this rather than working around it."
fi

# Nothing to check on a non-Bash tool: the agents have no Write or Edit.
[ -n "$CMD" ] || exit 0

RECORD_FILES='(BENCHMARKS|TASKS)\.jsonl'

# ---- every role ----------------------------------------------------------

# Matched the same way as the record files: a command that acts on the lock,
# not one that merely names it. The first version matched any mention, which
# blocked writing the documentation that explains the rule.
if printf '%s' "$CMD" | grep -Eq "(>|>>|\btee\b|\bsed\b -i|\bmv\b|\brm\b|\bcp\b|\btouch\b|\bunlink\b|\bflock\b)[^|]*\.records\.lock"; then
  deny "The lock is never touched by hand. If a command reported exit 68 naming the lock file, stop and say so: a stale lock means a writer died, and clearing it can lose that writer's work."
fi

if printf '%s' "$CMD" | grep -Eq "(>|>>|\btee\b|\bsed\b -i|\bmv\b|\brm\b|\bcp\b|\btruncate\b)[^|]*$RECORD_FILES"; then
  deny "Neither record file is written by anything but 'pnpm bench:records'. Reading is fine, but pipe it - a redirect that lands on the file is what append-only exists to prevent."
fi

# The file-integrity rules end here. ROLE=none is the project-wide layer, and
# it also runs against the human own session, so it protects the two files
# and stops. Everything below is agent discipline: rules about how a record
# should be arrived at, which a human working in a scratch directory or
# choosing an id has no reason to obey.
[ "$ROLE" = "none" ] && exit 0

# ---- every agent role ----------------------------------------------------

if printf '%s' "$CMD" | grep -Eq '\bbench:records\b'; then
  if printf '%s' "$CMD" | grep -Eq '\$\(|`|<\('; then
    deny "No command substitution inside a bench:records call. The record has to be literal in the transcript, or nobody can tell afterwards what was written."
  fi
  if printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])--id([[:space:]]|=|$)'; then
    deny "--id is not yours to choose. The tool allocates the next free one."
  fi
  if printf '%s' "$CMD" | grep -Eq 'bench:records[[:space:]]+(add-benchmark|add-task|set-status)' &&
    ! printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])--dir[[:space:]]+bench([[:space:]]|$)'; then
    deny "Every mutating bench:records call passes --dir bench, so it is obvious from the command which files it touched."
  fi
fi

if printf '%s' "$CMD" | grep -Eq '\bgit[[:space:]]+(commit|push|add|checkout|switch|reset|rebase|stash|restore)\b'; then
  deny "Committing is the human's. Report what you wrote and let them land it."
fi


HAS_ADD_BENCHMARK=0
HAS_ADD_TASK=0
HAS_SET_STATUS=0
printf '%s' "$CMD" | grep -Eq 'bench:records[[:space:]]+add-benchmark' && HAS_ADD_BENCHMARK=1
printf '%s' "$CMD" | grep -Eq 'bench:records[[:space:]]+add-task' && HAS_ADD_TASK=1
printf '%s' "$CMD" | grep -Eq 'bench:records[[:space:]]+set-status' && HAS_SET_STATUS=1
# bench:record is the wrapper that runs a benchmark and appends it. It carries
# no add-benchmark verb, so it needs its own detection or it would let the two
# reading roles record.
HAS_RECORD_ALL=0
printf '%s' "$CMD" | grep -Eq 'bench:record([[:space:]]|$)' && HAS_RECORD_ALL=1

case "$ROLE" in
runner)
  [ "$HAS_ADD_TASK" = 1 ] &&
    deny "Filing findings is the analyst's. You record runs."
  [ "$HAS_SET_STATUS" = 1 ] &&
    deny "Changing a task's status is the verifier's. You record runs."
  if [ "$HAS_ADD_BENCHMARK" = 1 ]; then
    printf '%s' "$CMD" | grep -Eq '^set -o pipefail;' ||
      deny "Start the pipeline with 'set -o pipefail;'. Without it a crashed adapter exits 0 and the run silently records nothing."
    printf '%s' "$CMD" | grep -Eq '(bench:records:from-vitest|bench:sync:record)' ||
      deny "add-benchmark takes its input from the adapter, on a pipe. A record you assembled yourself is a record nobody measured."
    printf '%s' "$CMD" | grep -Eq '\|[[:space:]]*pnpm[^|]*bench:records[[:space:]]+add-benchmark[[:space:]]+-([[:space:]]|$)' ||
      deny "The only accepted shape is '<adapter> | pnpm ... bench:records add-benchmark - --dir bench'."
    printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])--(conclusion|caveat|title|question)([[:space:]]|=)' &&
      deny "The conclusions and caveats come from the numbers. Put what you noticed in your report, not in the record."
    printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])--allow-dirty([[:space:]]|$)' &&
      deny "--allow-dirty is not yours to pass. The record carries the current sha, and on a dirty tree that sha names code that did not run. Report the dirty tree and stop."
  fi
  ;;
analyst)
  [ "$HAS_RECORD_ALL" = 1 ] &&
    deny "Recording runs is the runner's. You read what it recorded and file findings."
  [ "$HAS_ADD_BENCHMARK" = 1 ] &&
    deny "Recording runs is the runner's. You read what it recorded and file findings."
  [ "$HAS_SET_STATUS" = 1 ] &&
    deny "Everything you file lands at UNVERIFIED. Deciding whether it holds is the verifier's."
  if [ "$HAS_ADD_TASK" = 1 ]; then
    printf '%s' "$CMD" | grep -q "<<'JSON'" ||
      deny "Pass the task as a quoted heredoc (<<'JSON'), so the finding is literal in the transcript."
    if ! printf '%s' "$CMD" | grep -q '"kind"[[:space:]]*:[[:space:]]*"HARNESS"'; then
      printf '%s' "$CMD" | grep -Eq '"evidence"[[:space:]]*:[[:space:]]*\[[[:space:]]*"B-[0-9]{3,}"' ||
        deny "A DEFECT or a GAP cites the run that showed it: \"evidence\": [\"B-nnn\"]. Only a HARNESS finding, which is about the apparatus, may stand without one."
    fi
  fi
  ;;
verifier)
  [ "$HAS_RECORD_ALL" = 1 ] &&
    deny "Recording runs is the runner's. Fresh numbers go in --note, against a B-id that already exists."
  [ "$HAS_ADD_BENCHMARK" = 1 ] &&
    deny "Recording runs is the runner's. Fresh numbers go in --note, against a B-id that already exists."
  [ "$HAS_ADD_TASK" = 1 ] &&
    deny "Filing findings is the analyst's. You decide whether the ones already filed hold."
  if [ "$HAS_SET_STATUS" = 1 ]; then
    printf '%s' "$CMD" | grep -Eq '[[:space:]](FIXED|COMMITTED)([[:space:]]|$)' &&
      deny "FIXED belongs to whoever changes the code and COMMITTED to whoever lands it. You may set UNVERIFIED, VERIFIED or REFUTED."
    printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])--note[[:space:]]' ||
      deny "Every status change carries --note saying what you ran and what it showed."
    printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])--by[[:space:]]+bench-verifier([[:space:]]|$)' ||
      deny "Pass --by bench-verifier, so the history says who reached the verdict."
    if printf '%s' "$CMD" | grep -Eq '[[:space:]](VERIFIED|REFUTED)([[:space:]]|$)'; then
      printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])--evidence[[:space:]]+B-[0-9]{3,}' ||
        deny "VERIFIED and REFUTED both need --evidence B-nnn. A verdict with nothing behind it is the rubber stamp this loop exists to prevent."
    fi
  fi
  ;;
*)
  deny "records-guard was given an unknown role: $ROLE"
  ;;
esac

exit 0
