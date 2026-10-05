local M = {}

-- Pull the routing key off the `Drive-Id` request header. nginx exposes
-- HTTP headers as $http_<lowercased name with dashes turned into
-- underscores>, so `Drive-Id` is `$http_drive_id`. When the header is
-- missing or empty, `$doc_id` stays empty and every such request hashes to
-- the same peer (an empty key is still a constant key — see M.spread below
-- for the locations that must not do that).
-- The receiving switchboard validates ownership and returns a structured
-- wrong-shard error if the request landed on the wrong instance.
function M.from_header()
    ngx.var.doc_id = ngx.var.http_drive_id or ""
end

-- Route key for the token-addressed webhook family (`/webhooks/<token>`).
--
-- The token is the natural key: deliveries for one endpoint land on one
-- backend, while distinct endpoints spread across the pool. Correctness does
-- not depend on it — dedupe is a database claim, so any backend may serve any
-- delivery — but two things get better when redeliveries are pinned: the
-- dedupe row is already warm, and the per-endpoint rate limiter is
-- per-process, so pinning makes the configured limit mean what it says
-- instead of being three times looser than it reads.
--
-- Taken as the last path segment rather than anchored to `/webhooks/`, so a
-- deployment running under a BASE_PATH prefix keys off the same value. A path
-- with no final segment yields an empty key; the upstream answers 404 for it
-- either way.
function M.from_webhook_token()
    local token = ngx.var.uri:match("([^/]+)$")
    -- Hashed, not raw: the token is the endpoint's whole credential, and this
    -- value reaches the access log. The digest is stable, so pinning holds.
    ngx.var.doc_id = token and ngx.md5(token) or ""
end

-- Route key for package REST routes (`/api/<package>/…`).
--
-- A package route pins on `Drive-Id` when the caller supplies one, the same
-- contract `/graphql` offers. Without it the route has declared no affinity,
-- so the key falls back to `$request_id` — unique per request, which spreads
-- across the pool. The empty-string fallback would be worse than
-- round-robin: it is a constant, so every unpinned package request in the
-- fleet would hash to one backend.
function M.spread()
    local drive_id = ngx.var.http_drive_id
    if drive_id ~= nil and drive_id ~= "" then
        ngx.var.doc_id = drive_id
        return
    end
    ngx.var.doc_id = ngx.var.request_id or ""
end

return M
