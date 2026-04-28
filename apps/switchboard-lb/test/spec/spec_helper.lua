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
        WARN   = "WARN",
        ERR    = "ERR",
        get_phase = function() return "init_worker" end,
        say  = function(_) end,
        exit = function(_) error(SENTINEL, 0) end,
    }
    return SENTINEL
end

return helper
