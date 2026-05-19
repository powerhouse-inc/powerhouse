#!/bin/sh
set -e

# ============================================================
# nginx config templating
# ============================================================
#
# PH_CONNECT_BASE_PATH stays as-is for the catch-all `location ${VAR}` (so a
# subpath deploy at /connect still matches the bare /connect URL and falls
# through try_files to /index.html — preserves the prior behavior).
#
# PH_CONNECT_BASE_PREFIX is a derived var with the trailing slash stripped,
# used inside the prefixed locations like `${VAR}/assets/`. Without this,
# `${PH_CONNECT_BASE_PATH}/assets/` would render as `//assets/` at the
# default `/` base path and silently fail to match real /assets/ requests
# (causing custom Cache-Control / etag headers to be skipped).
#   "/"        -> ""         => location /assets/
#   "/connect" -> "/connect" => location /connect/assets/
#   "/connect/"-> "/connect"
PH_CONNECT_BASE_PATH="${PH_CONNECT_BASE_PATH:-/}"
PH_CONNECT_BASE_PREFIX="${PH_CONNECT_BASE_PATH%/}"
export PH_CONNECT_BASE_PATH PH_CONNECT_BASE_PREFIX

envsubst '${PORT},${PH_CONNECT_BASE_PATH},${PH_CONNECT_BASE_PREFIX}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# ============================================================
# Env -> powerhouse.config.json seeding (set-if-absent)
# ============================================================
#
# The seed table below MUST stay in sync with ENV_SEEDING_RULES in
# packages/shared/connect/env-to-runtime-config.ts. That TypeScript module is
# the source of truth and drives the build-time seeding inside the Vite
# plugin; this shell version exists because the runtime image ships nginx +
# jq only. We considered shipping `ph-cli` in the runtime image so the
# entrypoint could call `ph connect config <key> <value>`, but a quick
# experiment showed it ballooned the image from 126 MB -> 4.63 GB (ph-cli's
# transitive deps include monaco-editor, walletconnect, opentelemetry, etc.,
# none of which the runtime needs); rejected. See CONNECT-CONFIG-PLAN.md §11
# for the full breakdown.
#
# Semantics: set-if-absent. If the operator pre-mounted a config file with a
# value at `connect.foo.bar`, env vars never overwrite it. Within this table,
# the first rule whose env var is set wins on collision — so CLOUD-before-
# PUBLIC means CLOUD wins, matching the TS rule order.
#
# Implementation note: we write to a sibling tmp file then `cat tmp > file`
# (truncate-and-write) instead of `mv tmp file`. `mv` would replace the
# inode and fails with "Resource busy" when the file is bind-mounted as a
# single file (the standard Kubernetes ConfigMap / Secret projection).
# `cat >` preserves the inode so it works through bind mounts. If the file
# is read-only the write fails loudly — correct behavior, since operator-
# managed configs should not be re-seeded by the entrypoint.

DIST_DIR="/var/www/html/project"
RUNTIME_FILE="${DIST_DIR}/powerhouse.config.json"

# Apply a JSON value at a given dotted path inside the runtime file, but
# only if that path is currently null/missing. PATH_JSON is a JSON array
# like '["connect","drives","allowAddDrive"]'; VALUE_JSON is any JSON
# scalar/array/object literal.
seed_path_if_absent() {
  PATH_JSON="$1"
  VALUE_JSON="$2"
  jq --argjson p "$PATH_JSON" --argjson v "$VALUE_JSON" '
    if (getpath($p) == null) then setpath($p; $v) else . end
  ' "$RUNTIME_FILE" > "${RUNTIME_FILE}.tmp"
  cat "${RUNTIME_FILE}.tmp" > "$RUNTIME_FILE"
  rm -f "${RUNTIME_FILE}.tmp"
}

# Per-type wrappers around seed_path_if_absent. Each one short-circuits
# silently when the env var is unset/empty (matches the TS rule semantics).

# seed_string PATH_JSON VALUE
seed_string() {
  [ -z "$2" ] && return 0
  JSON_VALUE=$(jq -n --arg v "$2" '$v')
  seed_path_if_absent "$1" "$JSON_VALUE"
}

# seed_bool PATH_JSON VALUE [invert]
# Unknown values coerce to false (matches `parseBool = v => v.toLowerCase() === "true"`).
seed_bool() {
  [ -z "$2" ] && return 0
  case "$2" in
    [Tt][Rr][Uu][Ee]) BOOL="true"  ;;
    *)                BOOL="false" ;;
  esac
  if [ "$3" = "invert" ]; then
    if [ "$BOOL" = "true" ]; then BOOL="false"; else BOOL="true"; fi
  fi
  seed_path_if_absent "$1" "$BOOL"
}

# seed_number PATH_JSON VALUE
seed_number() {
  [ -z "$2" ] && return 0
  case "$2" in
    ''|*[!0-9]*)
      echo "[ph-config] invalid number '$2' for $1; skipping" >&2
      return 0
      ;;
  esac
  seed_path_if_absent "$1" "$2"
}

# seed_default_drives_url PATH_JSON VALUE
# Comma-separated URL list -> array of {url, name: null, icon: null}.
seed_default_drives_url() {
  [ -z "$2" ] && return 0
  DRIVES_JSON=$(printf '%s' "$2" | jq -R -c '
    split(",")
    | map(gsub("^\\s+|\\s+$"; ""))
    | map(select(length > 0))
    | map({ url: ., name: null, icon: null })
  ')
  seed_path_if_absent "$1" "$DRIVES_JSON"
}

if [ -f "$RUNTIME_FILE" ]; then
  # connect.app
  seed_string '["connect","app","basePath"]' "$PH_CONNECT_BASE_PATH"
  seed_string '["connect","app","logLevel"]' "$PH_CONNECT_LOG_LEVEL"

  # connect.packages
  seed_bool '["connect","packages","externalEnabled"]' "$PH_CONNECT_EXTERNAL_PACKAGES_DISABLED" invert

  # connect.drives (top-level)
  seed_bool '["connect","drives","allowAddDrive"]' "$PH_CONNECT_DISABLE_ADD_DRIVE" invert
  seed_default_drives_url '["connect","drives","defaultDrives"]' "$PH_CONNECT_DEFAULT_DRIVES_URL"
  seed_string '["connect","drives","preserveStrategy"]' "$PH_CONNECT_DRIVES_PRESERVE_STRATEGY"

  # connect.drives.sections.remote — CLOUD listed first, wins on collision; PUBLIC kept as legacy alias.
  seed_bool '["connect","drives","sections","remote","enabled"]'     "$PH_CONNECT_CLOUD_DRIVES_ENABLED"
  seed_bool '["connect","drives","sections","remote","allowAdd"]'    "$PH_CONNECT_DISABLE_ADD_CLOUD_DRIVES" invert
  seed_bool '["connect","drives","sections","remote","allowDelete"]' "$PH_CONNECT_DISABLE_DELETE_CLOUD_DRIVES" invert
  seed_bool '["connect","drives","sections","remote","enabled"]'     "$PH_CONNECT_PUBLIC_DRIVES_ENABLED"
  seed_bool '["connect","drives","sections","remote","allowAdd"]'    "$PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES" invert
  seed_bool '["connect","drives","sections","remote","allowDelete"]' "$PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES" invert

  # connect.drives.sections.local
  seed_bool '["connect","drives","sections","local","enabled"]'     "$PH_CONNECT_LOCAL_DRIVES_ENABLED"
  seed_bool '["connect","drives","sections","local","allowAdd"]'    "$PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES" invert
  seed_bool '["connect","drives","sections","local","allowDelete"]' "$PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES" invert

  # connect.renown
  seed_string '["connect","renown","url"]'        "$PH_CONNECT_RENOWN_URL"
  seed_string '["connect","renown","networkId"]'  "$PH_CONNECT_RENOWN_NETWORK_ID"
  seed_number '["connect","renown","chainId"]'    "$PH_CONNECT_RENOWN_CHAIN_ID"
fi

echo "Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "Connect available at: http://localhost:${PORT}${PH_CONNECT_BASE_PATH}"
    exec nginx -g "daemon off;"
else
    echo "Nginx configuration test failed"
    exit 1
fi
