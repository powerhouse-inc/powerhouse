-- Prometheus metrics wiring for switchboard-lb (M4).
--
-- Initialised once per worker in init_worker_by_lua_block alongside
-- healthcheck.run(). Metric objects are module-level state (per-worker VM);
-- the underlying lua_shared_dict "prometheus_metrics" is cross-worker.
--
-- Public surface:
--   metrics.run()                   — call from init_worker_by_lua_block
--   metrics.record_request()        — call from server-level log_by_lua_block
--   metrics.inc_parse_error(reason) — call from errors.lua before ngx.exit()
--   metrics.collect()               — call from /metrics in conf/metrics.conf
--
-- Cardinality control: the `reason` label on lb_body_parse_errors_total is
-- a bounded enum. REASON_MAP enumerates every literal string passed to
-- errors.bad_request()/errors.conflict() in lua/route.lua. The malformed-JSON
-- case uses prefix matching because cjson's decode error detail is interpolated
-- into the message — matching the prefix collapses every distinct cjson
-- diagnostic into one label value.

local M = {}

local prometheus     -- lazy: set by run()
local m_requests     -- lb_requests_total counter
local m_duration     -- lb_request_duration_seconds histogram
local m_parse_errs   -- lb_body_parse_errors_total counter

-- Histogram bucket boundaries chosen for the LB's actual latency band.
-- M0 baseline: 84µs median, 172µs p95. Default Prometheus buckets start
-- at 5ms and are useless at this scale. See ARCHITECTURE.md §8 M4.
local BUCKETS = { 0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1 }

-- Maps the human-readable reason strings from lua/route.lua's call sites
-- to bounded enum labels. Adding a new error reason in route.lua without
-- updating this map produces a "unknown" label and a WARN log — that's a
-- bug signal, not a label explosion.
local REASON_MAP = {
    ["empty body"]                                                     = "empty_body",
    ["body must be a JSON object"]                                     = "non_object_root",
    ["missing or non-object variables"]                                = "missing_variables",
    ["deleteDocuments: multi-identifier operations not supported"]     = "multi_identifier",
    ["moveChildren: cross-parent operations not supported"]            = "cross_parent_move",
    ["touchChannel: multi-document filter not supported"]              = "multi_doc_filter",
    ["no routing identifier found in variables"]                       = "no_identifier",
    ["pushSyncEnvelopes: envelopes span multiple channels"]            = "cross_channel_envelopes",
    ["pushSyncEnvelopes: envelopes[0].channelMeta.id missing"]         = "missing_channel_meta",
}

-- The malformed-JSON message is "malformed JSON: " .. <cjson detail>;
-- prefix-match so the variable detail doesn't become a label value.
local MALFORMED_JSON_PREFIX = "malformed JSON:"

function M.run()
    prometheus = require("prometheus").init("prometheus_metrics")

    m_requests = prometheus:counter(
        "lb_requests_total",
        "Total LB requests",
        { "class", "backend", "status" }
    )

    m_duration = prometheus:histogram(
        "lb_request_duration_seconds",
        "LB upstream response time",
        { "class", "backend" },
        BUCKETS
    )

    m_parse_errs = prometheus:counter(
        "lb_body_parse_errors_total",
        "Body parse / routing errors",
        { "reason" }
    )
end

local function backend_label(addr)
    if not addr or addr == "" or addr == "-" then
        return "none"
    end
    return addr
end

function M.record_request()
    if not m_requests then return end

    local class   = ngx.var.route_class
    if not class or class == "" then class = "unknown" end
    local backend = backend_label(ngx.var.upstream_addr)
    local status  = ngx.var.status

    m_requests:inc(1, { class, backend, status })

    -- WS subscription "duration" is connection lifetime, not LB latency.
    -- The 1s top bucket would put every WS in +Inf and skew the histogram.
    if class ~= "subscription" then
        local t = tonumber(ngx.var.upstream_response_time)
        if t then
            m_duration:observe(t, { class, backend })
        end
    end
end

function M.inc_parse_error(raw_reason)
    if not m_parse_errs then return end

    local label = REASON_MAP[raw_reason]
    if not label then
        if raw_reason and raw_reason:sub(1, #MALFORMED_JSON_PREFIX) == MALFORMED_JSON_PREFIX then
            label = "malformed_json"
        else
            label = "unknown"
            ngx.log(ngx.WARN, "metrics: unmapped parse error reason: ", raw_reason or "<nil>")
        end
    end

    m_parse_errs:inc(1, { label })
end

function M.collect()
    if not prometheus then return end
    prometheus:collect()
end

return M
