local helper = {}

local SENTINEL = {}

function helper.reset_ngx()
    _G.ngx = {
        status = 0,
        header = {},
        var    = {},
        req = {
            read_body     = function() end,
            get_body_data = function() return _G._test_body end,
        },
        shared = {
            prometheus_metrics = {},
        },
        timer  = { every = function() end },
        log    = function(...) end,
        -- Deterministic stand-in for ngx.md5 (djb2, no bitwise ops so it runs
        -- on LuaJIT). Must not embed its input: the specs assert exactly that.
        md5    = function(value)
            local text = tostring(value)
            local hash = 5381
            for i = 1, #text do
                hash = (hash * 33 + text:byte(i)) % 4294967296
            end
            return string.format("%08x", hash)
        end,
        WARN   = "WARN",
        ERR    = "ERR",
        get_phase = function() return "init_worker" end,
        say  = function(_) end,
        exit = function(_) error(SENTINEL, 0) end,
    }
    return SENTINEL
end

return helper
