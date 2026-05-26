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
# powerhouse.config.json seeding (set-if-absent)
# ============================================================
#
# Operators inject runtime config via a single env var, PH_CONNECT_CONFIG_JSON,
# carrying the JSON they want stamped onto the dist file. Same shape and same
# semantics as `ph connect config --json '{...}'`. The entrypoint deep-merges
# it into the dist `powerhouse.config.json` with **set-if-absent** semantics:
# any path that already has a value (from the build, from CLI flags during
# build, or from a mounted ConfigMap) wins — env-supplied values only fill
# gaps. The SPA then reads the file as usual.
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

  # Deep-merge with set-if-absent semantics. Recurses into objects on both
  # sides; arrays and primitives are leaves (only written when target is
  # null/missing — matches the previous per-field set-if-absent contract).
  #
  # Note: we use `== null` rather than `// null`. The `//` alternative
  # operator treats `false` as "absent" and would clobber pre-existing
  # `false` booleans (e.g. drives.sections.remote.enabled: false).
  jq --argjson op "$PH_CONNECT_CONFIG_JSON" '
    def seed($a; $b):
      if ($b | type) == "object" then
        reduce ($b | keys[]) as $k (
          $a;
          if .[$k] == null then
            .[$k] = $b[$k]
          elif (.[$k] | type) == "object" and ($b[$k] | type) == "object" then
            .[$k] = seed(.[$k]; $b[$k])
          else
            .  # already set; leave alone
          end
        )
      else
        if . == null then $b else . end
      end;
    seed(.; $op)
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
