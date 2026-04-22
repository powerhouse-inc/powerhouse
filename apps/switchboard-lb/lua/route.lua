local cjson  = require("cjson.safe")
local errors = require("errors")

local M = {}

local TOP_KEYS = {
    "identifier",
    "documentIdentifier",
    "parentIdentifier",
    "childIdentifier",
    "docId",
}

local function extract(vars)
    local envs = vars.envelopes
    if type(envs) == "table" and #envs > 0 then
        local first = envs[1]
        local ch0 = type(first) == "table"
                and type(first.channelMeta) == "table"
                and first.channelMeta.id
        if type(ch0) ~= "string" or #ch0 == 0 then
            return errors.conflict("pushSyncEnvelopes: envelopes[0].channelMeta.id missing")
        end
        for i = 2, #envs do
            local env = envs[i]
            local chi = type(env) == "table"
                    and type(env.channelMeta) == "table"
                    and env.channelMeta.id
            if chi ~= ch0 then
                return errors.conflict("pushSyncEnvelopes: envelopes span multiple channels")
            end
        end
        return ch0
    end

    if type(vars.identifiers) == "table" then
        return errors.conflict("deleteDocuments: multi-identifier operations not supported")
    end

    local src = vars.sourceParentIdentifier
    local tgt = vars.targetParentIdentifier
    local src_ok = type(src) == "string" and #src > 0
    local tgt_ok = type(tgt) == "string" and #tgt > 0
    if src_ok and tgt_ok then
        if src ~= tgt then
            return errors.conflict("moveChildren: cross-parent operations not supported")
        end
        return src
    end
    if src_ok then return src end
    if tgt_ok then return tgt end

    for _, k in ipairs(TOP_KEYS) do
        local v = vars[k]
        if type(v) == "string" and #v > 0 then
            return v
        end
    end

    if type(vars.filter) == "table" then
        local v = vars.filter.documentId
        if type(v) == "string" and #v > 0 then
            return v
        end
    end

    if type(vars.input) == "table" and type(vars.input.filter) == "table" then
        local list = vars.input.filter.documentId
        if type(list) == "table" then
            if #list > 1 then
                return errors.conflict("touchChannel: multi-document filter not supported")
            end
            if #list == 1 and type(list[1]) == "string" and #list[1] > 0 then
                return list[1]
            end
        end
    end

    return errors.conflict("no routing identifier found in variables")
end

function M.from_body()
    ngx.req.read_body()
    local raw = ngx.req.get_body_data()
    if not raw or #raw == 0 then
        return errors.bad_request("empty body")
    end

    local payload, decode_err = cjson.decode(raw)
    if payload == nil then
        return errors.bad_request("malformed JSON: " .. (decode_err or "unknown"))
    end
    if type(payload) ~= "table" then
        return errors.bad_request("body must be a JSON object")
    end
    if type(payload.variables) ~= "table" then
        return errors.bad_request("missing or non-object variables")
    end

    ngx.var.doc_id = extract(payload.variables)
end

return M
