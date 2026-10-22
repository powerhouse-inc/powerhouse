const ENDPOINT = "http://localhost:7809/mcp";
const h = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const r = await fetch(ENDPOINT, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "e", version: "1" } } }) });
const hh = { ...h, "mcp-session-id": r.headers.get("mcp-session-id") };
await fetch(ENDPOINT, { method: "POST", headers: hh, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
const t = await fetch(ENDPOINT, { method: "POST", headers: hh, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) });
const txt = await t.text();
const j = JSON.parse((txt.split("\n").find((l) => l.startsWith("data:")) || txt).replace(/^data:/, ""));
for (const tool of j.result.tools) if (process.argv.slice(2).includes(tool.name)) console.log(tool.name, JSON.stringify(tool.inputSchema).slice(0, 1800));
