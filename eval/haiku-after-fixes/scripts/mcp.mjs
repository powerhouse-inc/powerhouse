// usage: node mcp.mjs list | node mcp.mjs call <tool> '<json args>' | node mcp.mjs raw '<json-rpc method>' '<params json>'
const URL_ = "http://localhost:7867/mcp";
const H = { "content-type": "application/json", accept: "application/json, text/event-stream" };
async function parse(res) {
  const t = await res.text();
  if (t.startsWith("event:") || t.includes("\ndata:")) {
    const line = t.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
    return JSON.parse(line);
  }
  return JSON.parse(t);
}
async function session() {
  let res = await fetch(URL_, { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "eval", version: "1" } } }) });
  const sid = res.headers.get("mcp-session-id");
  await parse(res);
  const h2 = { ...H, "mcp-session-id": sid };
  await fetch(URL_, { method: "POST", headers: h2, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  return h2;
}
async function rpc(h, id, method, params) {
  const res = await fetch(URL_, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  return parse(res);
}
const [cmd, a1, a2] = process.argv.slice(2);
const h = await session();
let out;
if (cmd === "list") out = await rpc(h, 2, "tools/list", {});
else if (cmd === "call") out = await rpc(h, 2, "tools/call", { name: a1, arguments: JSON.parse(a2 || "{}") });
else if (cmd === "raw") out = await rpc(h, 2, a1, JSON.parse(a2 || "{}"));
console.log(JSON.stringify(out, null, 1).slice(0, Number(process.env.MAXC || 6000)));
