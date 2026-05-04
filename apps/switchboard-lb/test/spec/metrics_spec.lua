local helper = require("spec.spec_helper")

-- Mocks the prometheus library so metrics.run() succeeds without the real
-- nginx-lua-prometheus module on the LuaJIT path. The mock captures
-- every metric registration plus the values passed to inc()/observe(),
-- so the unit test can assert REASON_MAP semantics deterministically.
local function install_prom_mock()
    local captures = {
        parse_errors = {},
        requests     = {},
        durations    = {},
    }

    local stub_counter_factory = function(name)
        return {
            inc = function(_, v, label_values)
                if name == "lb_body_parse_errors_total" then
                    table.insert(captures.parse_errors, label_values[1])
                elseif name == "lb_requests_total" then
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

describe("metrics.inc_parse_error", function()
    local captures
    local metrics

    before_each(function()
        helper.reset_ngx()
        captures = install_prom_mock()
        metrics  = load_metrics()
        metrics.run()
    end)

    -- One case per REASON_MAP entry, asserting the bounded enum label.
    local cases = {
        { raw = "empty body",                                                   label = "empty_body" },
        { raw = "body must be a JSON object",                                   label = "non_object_root" },
        { raw = "missing or non-object variables",                              label = "missing_variables" },
        { raw = "deleteDocuments: multi-identifier operations not supported",   label = "multi_identifier" },
        { raw = "moveRelationship: cross-parent operations not supported",      label = "cross_parent_move" },
        { raw = "touchChannel: multi-document filter not supported",            label = "multi_doc_filter" },
        { raw = "no routing identifier found in variables",                     label = "no_identifier" },
        { raw = "pushSyncEnvelopes: envelopes span multiple channels",          label = "cross_channel_envelopes" },
        { raw = "pushSyncEnvelopes: envelopes[0].channelMeta.id missing",       label = "missing_channel_meta" },
    }

    for _, c in ipairs(cases) do
        it("maps '" .. c.raw .. "' -> '" .. c.label .. "'", function()
            metrics.inc_parse_error(c.raw)
            assert.equals(c.label, captures.parse_errors[1])
        end)
    end

    it("prefix-matches malformed JSON detail to 'malformed_json'", function()
        metrics.inc_parse_error("malformed JSON: Expected value but found T_END")
        assert.equals("malformed_json", captures.parse_errors[1])
    end)

    it("prefix-matches alternate cjson detail to 'malformed_json'", function()
        metrics.inc_parse_error("malformed JSON: invalid number at character 4")
        assert.equals("malformed_json", captures.parse_errors[1])
    end)

    it("falls through to 'unknown' for unmapped reasons", function()
        metrics.inc_parse_error("some future error string")
        assert.equals("unknown", captures.parse_errors[1])
    end)

    it("falls through to 'unknown' for nil reason", function()
        metrics.inc_parse_error(nil)
        assert.equals("unknown", captures.parse_errors[1])
    end)
end)

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
