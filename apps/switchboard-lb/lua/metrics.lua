-- Prometheus metrics wiring for switchboard-lb.
--
-- Initialised once per worker in init_worker_by_lua_block alongside
-- healthcheck.run(). Metric objects are module-level state (per-worker VM);
-- the underlying lua_shared_dict "prometheus_metrics" is cross-worker.
--
-- Public surface:
--   metrics.run()            — call from init_worker_by_lua_block
--   metrics.record_request() — call from server-level log_by_lua_block
--   metrics.collect()        — call from /metrics in conf/metrics.conf

local M = {}

local prometheus     -- lazy: set by run()
local m_requests     -- lb_requests_total counter
local m_duration     -- lb_request_duration_seconds histogram

-- Histogram bucket boundaries chosen for the LB's actual latency band.
-- M0 baseline: 84µs median, 172µs p95. Default Prometheus buckets start
-- at 5ms and are useless at this scale. See ARCHITECTURE.md §8 M4.
local BUCKETS = { 0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1 }

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

function M.collect()
    if not prometheus then return end
    prometheus:collect()
end

return M
