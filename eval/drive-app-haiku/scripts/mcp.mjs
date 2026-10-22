// usage: node mcp.mjs list | node mcp.mjs call <toolName> '<json args>'
const URL = "http://localhost:7809/mcp";
const [, , cmd, name, argsJson] = process.argv;
const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
async function rpc(body, sid) {
  const h = { ...headers };
  if (sid) h["mcp-session-id"] = sid;
  const res = await fetch(URL, { method: "POST", headers: h, body: JSON.stringify(body) });
  const sessionId = res.headers.get("mcp-session-id") ?? sid;
  const text = await res.text();
  let json = null;
  const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
  try { json = JSON.parse(dataLine ? dataLine.slice(5) : text); } catch { json = { raw: text.slice(0, 500) }; }
  return { sessionId, json, status: res.status };
}
const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "eval", version: "1" } } });
const sid = init.sessionId;
await rpc({ jsonrpc: "2.0", method: "notifications/initialized" }, sid);
let r;
if (cmd === "list") r = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, sid);
else r = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: JSON.parse(argsJson || "{}") } }, sid);
const out = JSON.stringify(r.json, null, 1);
if (cmd === "list") console.log(r.json.result.tools.map((t) => t.name + ": " + (t.description || "").slice(0, 110)).join("\n"));
else { const t = r.json?.result?.content?.[0]?.text; const o = r.json?.error ? JSON.stringify(r.json.error) : (t ?? out); console.log(String(o).slice(0, Number(process.env.MAXC || 4000))); }
