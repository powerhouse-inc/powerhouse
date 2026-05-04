local cjson = require("cjson.safe")

local M = {}

local function send(code, msg)
    ngx.status = code
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode({ error = msg }))
    require("metrics").inc_parse_error(msg)
    ngx.exit(code)
end

function M.bad_request(msg)
    send(400, msg or "bad request")
end

function M.conflict(msg)
    send(409, msg or "conflict")
end

return M
