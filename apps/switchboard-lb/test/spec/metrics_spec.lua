local helper = require("spec.spec_helper")

-- Mocks the prometheus library so metrics.run() succeeds without the real
-- nginx-lua-prometheus module on the LuaJIT path. The mock captures
-- every metric registration plus the values passed to inc()/observe().
local function install_prom_mock()
    local captures = {
        requests  = {},
        durations = {},
    }

    local stub_counter_factory = function(name)
        return {
            inc = function(_, v, label_values)
                if name == "lb_requests_total" then
                    table.insert(captures.requests, label_values)
                end
            end,
        }
    end

    local stub_histogram = {
        observe = function(_, v, label_values)
            table.insert(captures.durations, { v = v, labels = label_values })
        end,
    }

    package.loaded["prometheus"] = {
        init = function(_, dict_name)
            return {
                counter = function(_, name, _, _)
                    return stub_counter_factory(name)
                end,
                histogram = function(_, _, _, _, _)
                    return stub_histogram
                end,
            }
        end,
    }

    return captures
end

local function load_metrics()
    package.loaded["metrics"] = nil
    return require("metrics")
end

describe("metrics.record_request", function()
    local captures
    local metrics

    before_each(function()
        helper.reset_ngx()
        captures = install_prom_mock()
        metrics  = load_metrics()
        metrics.run()
    end)

    it("records request with class/backend/status labels", function()
        ngx.var.route_class            = "graphql"
        ngx.var.upstream_addr          = "172.24.0.2:8080"
        ngx.var.status                 = "200"
        ngx.var.upstream_response_time = "0.0012"

        metrics.record_request()

        assert.equals(1, #captures.requests)
        assert.same({ "graphql", "172.24.0.2:8080", "200" }, captures.requests[1])
        assert.equals(1, #captures.durations)
        assert.equals(0.0012, captures.durations[1].v)
    end)

    it("normalises empty $upstream_addr to 'none' (e.g. /health)", function()
        ngx.var.route_class            = "health"
        ngx.var.upstream_addr          = ""
        ngx.var.status                 = "200"
        ngx.var.upstream_response_time = ""

        metrics.record_request()

        assert.same({ "health", "none", "200" }, captures.requests[1])
        -- /health has no upstream — observe is skipped (tonumber("") is nil).
        assert.equals(0, #captures.durations)
    end)

    it("normalises '-' $upstream_addr to 'none'", function()
        ngx.var.route_class            = "graphql"
        ngx.var.upstream_addr          = "-"
        ngx.var.status                 = "503"
        ngx.var.upstream_response_time = "0.0005"

        metrics.record_request()

        assert.same({ "graphql", "none", "503" }, captures.requests[1])
    end)

    it("skips duration observation for class=subscription", function()
        ngx.var.route_class            = "subscription"
        ngx.var.upstream_addr          = "172.24.0.2:8080"
        ngx.var.status                 = "101"
        ngx.var.upstream_response_time = "3600.0"

        metrics.record_request()

        assert.equals(1, #captures.requests)
        assert.equals(0, #captures.durations)
    end)

    it("falls back to class='unknown' when route_class unset", function()
        ngx.var.route_class            = nil
        ngx.var.upstream_addr          = "172.24.0.2:8080"
        ngx.var.status                 = "200"
        ngx.var.upstream_response_time = "0.001"

        metrics.record_request()

        assert.equals("unknown", captures.requests[1][1])
    end)
end)
