local M = {}

-- Pull the routing key off the `Drive-Id` request header. nginx exposes
-- HTTP headers as $http_<lowercased name with dashes turned into
-- underscores>, so `Drive-Id` is `$http_drive_id`. When the header is
-- missing or empty, `$doc_id` stays empty and the upstream `hash`
-- directive falls back to round-robin (documented nginx behavior).
-- The receiving switchboard validates ownership and returns a structured
-- wrong-shard error if the request landed on the wrong instance.
function M.from_header()
    ngx.var.doc_id = ngx.var.http_drive_id or ""
end

return M
