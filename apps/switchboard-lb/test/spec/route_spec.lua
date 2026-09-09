local helper = require("spec.spec_helper")

local function run(http_drive_id)
    helper.reset_ngx()
    if http_drive_id ~= nil then
        ngx.var.http_drive_id = http_drive_id
    end
    package.loaded["route"] = nil
    require("route").from_header()
    return { doc_id = ngx.var.doc_id }
end

describe("route.from_header", function()
    it("copies the Drive-Id header value into doc_id", function()
        local r = run("drive-abc-123")
        assert.equals("drive-abc-123", r.doc_id)
    end)

    it("leaves doc_id empty when Drive-Id is missing", function()
        local r = run(nil)
        assert.equals("", r.doc_id)
    end)

    it("leaves doc_id empty when Drive-Id is empty string", function()
        local r = run("")
        assert.equals("", r.doc_id)
    end)

    it("preserves UUID-shaped values verbatim", function()
        local r = run("550e8400-e29b-41d4-a716-446655440000")
        assert.equals("550e8400-e29b-41d4-a716-446655440000", r.doc_id)
    end)
end)

local function run_token(uri)
    helper.reset_ngx()
    ngx.var.uri = uri
    package.loaded["route"] = nil
    require("route").from_webhook_token()
    return { doc_id = ngx.var.doc_id }
end

describe("route.from_webhook_token", function()
    it("keys on the token so one endpoint pins to one backend", function()
        local r = run_token("/webhooks/0123456789abcdef0123456789abcdef")
        assert.equals("0123456789abcdef0123456789abcdef", r.doc_id)
    end)

    it("keys off the last segment, so a BASE_PATH prefix still works", function()
        local r = run_token("/base/webhooks/0123456789abcdef0123456789abcdef")
        assert.equals("0123456789abcdef0123456789abcdef", r.doc_id)
    end)

    it("distinct endpoints get distinct keys", function()
        local a = run_token("/webhooks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        local b = run_token("/webhooks/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
        assert.are_not.equals(a.doc_id, b.doc_id)
    end)

    it("leaves the key empty when there is no final segment", function()
        -- The upstream answers 404 for this either way; the LB must not error.
        local r = run_token("/webhooks/")
        assert.equals("", r.doc_id)
    end)

    it("passes a malformed token through rather than judging its shape", function()
        -- Whether a token is real is the origin's call: it answers unknown and
        -- malformed identically so a prober cannot tell them apart.
        local r = run_token("/webhooks/not-a-token")
        assert.equals("not-a-token", r.doc_id)
    end)
end)

local function run_spread(http_drive_id, request_id)
    helper.reset_ngx()
    if http_drive_id ~= nil then
        ngx.var.http_drive_id = http_drive_id
    end
    ngx.var.request_id = request_id
    package.loaded["route"] = nil
    require("route").spread()
    return { doc_id = ngx.var.doc_id }
end

describe("route.spread", function()
    it("pins on Drive-Id when the caller sends one", function()
        local r = run_spread("drive-abc-123", "req-1")
        assert.equals("drive-abc-123", r.doc_id)
    end)

    it("falls back to the request id, not an empty key", function()
        -- An empty key is a constant, so it would hash every unpinned package
        -- request in the fleet onto one backend.
        local r = run_spread(nil, "req-1")
        assert.equals("req-1", r.doc_id)
    end)

    it("treats an empty Drive-Id as absent", function()
        local r = run_spread("", "req-2")
        assert.equals("req-2", r.doc_id)
    end)

    it("spreads distinct requests across distinct keys", function()
        local a = run_spread(nil, "req-a")
        local b = run_spread(nil, "req-b")
        assert.are_not.equals(a.doc_id, b.doc_id)
    end)
end)
