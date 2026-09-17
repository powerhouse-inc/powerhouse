#!/usr/bin/env bash
# Stand-in for the `claude` binary. Behaviour is picked by FAKE_CLAUDE_MODE:
#   ok | noresult | apierror | budget | structured | hang
# FAKE_CLAUDE_ARGS_FILE, when set, receives argv one per line.
# FAKE_CLAUDE_WRITE_SESSION=1 writes a session file the way the CLI does,
# under $CLAUDE_CONFIG_DIR/projects/<encoded cwd>/<--session-id>.jsonl.
set -u
here=$(cd "$(dirname "$0")" && pwd)

if [ "${1:-}" = "--version" ]; then
  echo "2.1.258 (Claude Code)"
  exit 0
fi

if [ -n "${FAKE_CLAUDE_ARGS_FILE:-}" ]; then
  : > "$FAKE_CLAUDE_ARGS_FILE"
  for a in "$@"; do printf '%s\n' "$a" >> "$FAKE_CLAUDE_ARGS_FILE"; done
fi

session_id=""
prev=""
for a in "$@"; do
  if [ "$prev" = "--session-id" ]; then session_id=$a; fi
  prev=$a
done

if [ "${FAKE_CLAUDE_WRITE_SESSION:-}" = "1" ] && [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ -n "$session_id" ]; then
  enc=$(printf '%s' "$PWD" | sed 's/[^a-zA-Z0-9]/-/g')
  mkdir -p "$CLAUDE_CONFIG_DIR/projects/$enc"
  printf '{"type":"user","sessionId":"%s","cwd":"%s"}\n' "$session_id" "$PWD" \
    > "$CLAUDE_CONFIG_DIR/projects/$enc/$session_id.jsonl"
fi

mode=${FAKE_CLAUDE_MODE:-ok}
echo "fake-claude: mode=$mode" >&2

case "$mode" in
  ok)         cat "$here/ok.jsonl"; exit 0 ;;
  noresult)   cat "$here/noresult.jsonl"; exit 0 ;;
  apierror)   cat "$here/apierror.jsonl"; exit 1 ;;
  budget)     cat "$here/budget.jsonl"; exit 1 ;;
  structured) cat "$here/structured.jsonl"; exit 0 ;;
  hang)       head -n 1 "$here/ok.jsonl"; sleep 60; exit 0 ;;
  *)          echo "fake-claude: unknown mode $mode" >&2; exit 2 ;;
esac
