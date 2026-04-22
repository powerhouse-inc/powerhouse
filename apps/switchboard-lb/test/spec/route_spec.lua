local cjson  = require("cjson.safe")
local helper = require("spec.spec_helper")

local function run(body)
    _G._test_body = body
    local SENTINEL = helper.reset_ngx()
    package.loaded["errors"] = nil
    package.loaded["route"]  = nil
    local ok, err = pcall(function() require("route").from_body() end)
    if not ok and err ~= SENTINEL then error(err) end
    return {
        status = ngx.status,
        exited = not ok,
        doc_id = ngx.var.doc_id,
    }
end

local function enc(tbl) return cjson.encode(tbl) end

describe("route.from_body", function()
    describe("error branches", function()
        it("rejects empty body with 400", function()
            local r = run(nil)
            assert.equals(400, r.status)
            assert.is_true(r.exited)
        end)

        it("rejects malformed JSON with 400", function()
            local r = run("{ not json")
            assert.equals(400, r.status)
        end)

        it("rejects non-object root with 400", function()
            local r = run("[1,2,3]")
            assert.equals(400, r.status)
        end)

        it("rejects missing variables with 400", function()
            local r = run(enc({ query = "{ __typename }" }))
            assert.equals(400, r.status)
        end)

        it("returns 409 when no routing id can be found", function()
            local r = run(enc({ variables = { foo = "bar" } }))
            assert.equals(409, r.status)
        end)
    end)

    describe("top-level identifier keys", function()
        local cases = {
            { key = "identifier",         value = "doc-1" },
            { key = "documentIdentifier", value = "doc-2" },
            { key = "parentIdentifier",   value = "doc-3" },
            { key = "childIdentifier",    value = "doc-4" },
            { key = "docId",              value = "doc-5" },
        }
        for _, c in ipairs(cases) do
            it("extracts " .. c.key, function()
                local r = run(enc({ variables = { [c.key] = c.value } }))
                assert.is_false(r.exited)
                assert.equals(c.value, r.doc_id)
            end)
        end
    end)

    describe("nested paths", function()
        it("extracts filter.documentId (documentOperations)", function()
            local r = run(enc({ variables = { filter = { documentId = "d-filter" } } }))
            assert.is_false(r.exited)
            assert.equals("d-filter", r.doc_id)
        end)

        it("extracts single-element input.filter.documentId (touchChannel)", function()
            local r = run(enc({
                variables = { input = { filter = { documentId = { "d-touch" } } } },
            }))
            assert.is_false(r.exited)
            assert.equals("d-touch", r.doc_id)
        end)

        it("rejects multi-element input.filter.documentId with 409", function()
            local r = run(enc({
                variables = { input = { filter = { documentId = { "a", "b" } } } },
            }))
            assert.equals(409, r.status)
        end)
    end)

    describe("pushSyncEnvelopes", function()
        it("routes on envelopes[0].channelMeta.id when all envelopes share it", function()
            local r = run(enc({
                variables = { envelopes = {
                    { channelMeta = { id = "ch-1" } },
                    { channelMeta = { id = "ch-1" } },
                } },
            }))
            assert.is_false(r.exited)
            assert.equals("ch-1", r.doc_id)
        end)

        it("rejects cross-channel envelopes with 409", function()
            local r = run(enc({
                variables = { envelopes = {
                    { channelMeta = { id = "ch-1" } },
                    { channelMeta = { id = "ch-2" } },
                } },
            }))
            assert.equals(409, r.status)
        end)

        it("rejects missing envelopes[0].channelMeta.id with 409", function()
            local r = run(enc({
                variables = { envelopes = { { channelMeta = {} } } },
            }))
            assert.equals(409, r.status)
        end)
    end)

    describe("multi-identifier operations", function()
        it("rejects identifiers[] with 409 (deleteDocuments)", function()
            local r = run(enc({ variables = { identifiers = { "a", "b" } } }))
            assert.equals(409, r.status)
        end)

        it("rejects cross-parent moveChildren with 409", function()
            local r = run(enc({
                variables = {
                    sourceParentIdentifier = "p-1",
                    targetParentIdentifier = "p-2",
                },
            }))
            assert.equals(409, r.status)
        end)

        it("routes same-parent moveChildren on the parent id", function()
            local r = run(enc({
                variables = {
                    sourceParentIdentifier = "p-same",
                    targetParentIdentifier = "p-same",
                },
            }))
            assert.is_false(r.exited)
            assert.equals("p-same", r.doc_id)
        end)
    end)
end)
