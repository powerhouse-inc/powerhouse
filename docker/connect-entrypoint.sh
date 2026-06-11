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
# powerhouse.config.json runtime overrides (operator wins)
# ============================================================
#
# Operators inject runtime config via a single env var, PH_CONNECT_CONFIG_JSON,
# carrying the JSON they want applied to the dist file. Same shape as
# `ph connect config --json '{...}'`. The entrypoint deep-merges it into the
# dist `powerhouse.config.json` with **operator-wins** semantics: a concrete
# leaf in the env JSON (including false / "" / [] / 0) overwrites whatever
# the build baked; a `null` leaf (or an omitted key) keeps the existing
# value, so build defaults only apply where the operator expressed no
# opinion. The SPA then reads the file as usual.
#
# Why operator-wins: the build pads the dist file with DEFAULT_CONNECT_CONFIG
# for every field (self-describing dist), so the previous set-if-absent merge
# could never apply an operator override to any defaulted field — e.g.
# setting connect.branding.appName from a deploy pipeline was silently
# ignored because the baked default already occupied the path.
#
# Exception: `connect.app.basePath` is stripped from the operator payload.
# The base path is baked into the built asset URLs (vite `base`) and the
# nginx location prefixes; a runtime-only override desyncs the SPA from its
# own assets and bricks the deploy. Rebuild with `--base` (or use
# `--dynamic-base`) to change it.
#
# Backward incompatible: the old PH_CONNECT_* per-field env vars
# (PH_CONNECT_LOG_LEVEL, PH_CONNECT_DISABLE_ADD_DRIVE, PH_CONNECT_RENOWN_*,
# etc.) no longer have any effect. Migrate to PH_CONNECT_CONFIG_JSON.
#
# Implementation note: we write to a sibling tmp file then `cat tmp > file`
# (truncate-and-write) instead of `mv tmp file`. `mv` would replace the
# inode and fails with "Resource busy" when the file is bind-mounted as a
# single file (Kubernetes ConfigMap / Secret projection). `cat >` preserves
# the inode so it works through bind mounts. If the file is read-only the
# write fails loudly — correct behavior, since operator-managed configs
# should not be re-seeded by the entrypoint.

DIST_DIR="${DIST_DIR:-/var/www/html/project}"
RUNTIME_FILE="${DIST_DIR}/powerhouse.config.json"

if [ -f "$RUNTIME_FILE" ] && [ -n "${PH_CONNECT_CONFIG_JSON:-}" ]; then
  # Validate up front so misconfigs fail loudly instead of silently dropping
  # the entire operator payload.
  if ! printf '%s' "$PH_CONNECT_CONFIG_JSON" | jq -e . >/dev/null 2>&1; then
    echo "[ph-config] PH_CONNECT_CONFIG_JSON is not valid JSON; aborting" >&2
    exit 1
  fi
  if ! printf '%s' "$PH_CONNECT_CONFIG_JSON" | jq -e 'type == "object"' >/dev/null 2>&1; then
    echo "[ph-config] PH_CONNECT_CONFIG_JSON must be a JSON object; aborting" >&2
    exit 1
  fi

  # Deep-merge with operator-wins semantics. Recurses where both sides are
  # objects; arrays and primitives are leaves. An operator leaf overwrites
  # the existing value unless it is `null`, which defers to the file.
  #
  # Note: we test `== null` rather than using the `//` alternative operator.
  # `//` treats `false` as "absent" and would discard explicit operator
  # `false` values (e.g. drives.sections.remote.enabled: false).
  #
  # strip_base drops connect.app.basePath from the operator payload (see
  # header). Guarded on the intermediate types so a malformed payload like
  # {"connect": "x"} degrades to a plain merge instead of a jq error.
  jq --argjson op "$PH_CONNECT_CONFIG_JSON" '
    def merge($a; $b):
      if ($a | type) == "object" and ($b | type) == "object" then
        reduce ($b | keys[]) as $k (
          $a;
          .[$k] = merge(.[$k]; $b[$k])
        )
      elif $b == null then
        $a
      else
        $b
      end;
    def strip_base($o):
      if ($o.connect | type) == "object" and ($o.connect.app | type) == "object"
      then $o | del(.connect.app.basePath)
      else $o
      end;
    merge(.; strip_base($op))
  ' "$RUNTIME_FILE" > "${RUNTIME_FILE}.tmp"
  cat "${RUNTIME_FILE}.tmp" > "$RUNTIME_FILE"
  rm -f "${RUNTIME_FILE}.tmp"
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
