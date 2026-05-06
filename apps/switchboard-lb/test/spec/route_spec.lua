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
