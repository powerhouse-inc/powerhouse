-- Active health probing that does NOT mutate nginx's view of the upstream.
--
-- Why custom: lua-resty-upstream-healthcheck calls set_peer_down on the
-- upstream peer when it detects failure, which makes `hash ... consistent`
-- skip the peer at selection time and silently re-route a pinned doc to
-- a different backend — violating §4.1's strict pinning invariant.
-- Suppressing set_peer_down keeps the library's probing alive but its
-- status_page reads from nginx's peer.down (always false in our setup),
-- so observability is gone too. Doing it ourselves is straightforward.
--
-- With this module, peers always look "up" to nginx; dead-backend traffic
-- still gets a clean 503 via @no_backend (TCP refused → 502 → error_page).
-- The probe loop here exists purely for observability — it powers
-- /__hc/status so operators (and tests) can see ejections.
--
-- Probing runs in every worker. Counters are per-worker (Lua module-local
-- state, separate per worker VM). The resulting up/down STATE is written
-- to a lua_shared_dict so the status endpoint reads a consistent view
-- regardless of which worker serves it. Workers writing the same state
-- value is idempotent.

local upstream = require("ngx.upstream")

local M = {}

local INTERVAL = 2     -- seconds between probe cycles
local TIMEOUT  = 1000  -- ms per probe
local FALL     = 3     -- consecutive failures → DOWN
local RISE     = 2     -- consecutive successes → UP
local SHM_NAME = "healthcheck"

local counters = {}

local function probe(host, port)
    local sock = ngx.socket.tcp()
    sock:settimeout(TIMEOUT)
    local ok = sock:connect(host, port)
    if not ok then sock:close(); return false end
    local _, err = sock:send("GET /health HTTP/1.0\r\nHost: switchboard\r\n\r\n")
    if err then sock:close(); return false end
    local line = sock:receive("*l")
    sock:close()
    return line and line:match("^HTTP/1%.[01] 200") ~= nil
end

local function tick()
    local peers = upstream.get_primary_peers("switchboards")
    if not peers then return end
    local shm = ngx.shared[SHM_NAME]
    for _, peer in ipairs(peers) do
        local host, port_s = peer.name:match("([^:]+):(%d+)")
        if host and port_s then
            local healthy = probe(host, tonumber(port_s))
            local c = counters[peer.name]
            if not c then
                c = { fails = 0, succs = 0 }
                counters[peer.name] = c
            end
            if healthy then
                c.fails = 0
                c.succs = c.succs + 1
                if c.succs >= RISE then
                    shm:set("state:" .. peer.name, "up")
                end
            else
                c.succs = 0
                c.fails = c.fails + 1
                if c.fails >= FALL then
                    shm:set("state:" .. peer.name, "down")
                end
            end
        end
    end
end

local function loop(premature)
    if premature then return end
    tick()
end

function M.run()
    -- Seed peer state to "up" so /__hc/status returns a sensible answer
    -- before the first probe cycle completes (~INTERVAL * RISE seconds).
    local peers = upstream.get_primary_peers("switchboards") or {}
    local shm = ngx.shared[SHM_NAME]
    for _, peer in ipairs(peers) do
        if shm:get("state:" .. peer.name) == nil then
            shm:set("state:" .. peer.name, "up")
        end
    end
    local ok, err = ngx.timer.every(INTERVAL, loop)
    if not ok then
        ngx.log(ngx.ERR, "healthcheck: timer.every failed: ", err)
    end
end

function M.status()
    local peers = upstream.get_primary_peers("switchboards")
    if not peers then return "no upstream\n" end
    local shm = ngx.shared[SHM_NAME]
    local lines = { "Upstream switchboards", "    Primary Peers" }
    for _, peer in ipairs(peers) do
        local state = shm:get("state:" .. peer.name) or "up"
        local label = (state == "down") and "DOWN" or "UP"
        table.insert(lines, "        " .. peer.name .. " " .. label)
    end
    table.insert(lines, "    Backup Peers")
    return table.concat(lines, "\n") .. "\n"
end

return M
