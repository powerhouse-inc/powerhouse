// Usage: node mcp.mjs <toolName|--list> [jsonArgs|@file]
import fs from "node:fs";
const URL = "http://localhost:7987/mcp";
const H = { "content-type": "application/json", accept: "application/json, text/event-stream" };
let sid;
async function rpc(method, params, id) {
  const headers = { ...H }; if (sid) headers["mcp-session-id"] = sid;
  const body = { jsonrpc: "2.0", method, params }; if (id !== undefined) body.id = id;
  const r = await fetch(URL, { method: "POST", headers, body: JSON.stringify(body) });
  sid = r.headers.get("mcp-session-id") ?? sid;
  const t = await r.text();
  if (id === undefined) return null;
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("event-stream")) {
    const lines = t.split("\n").filter(l => l.startsWith("data:")).map(l => JSON.parse(l.slice(5)));
    return lines.find(l => l.id === id) ?? lines.at(-1);
  }
  try { return JSON.parse(t); } catch { return { raw: t, status: r.status }; }
}
const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "eval", version: "0" } }, 1);
if (init?.error) { console.error(JSON.stringify(init)); process.exit(1); }
await rpc("notifications/initialized", {});
const [, , tool, argStr] = process.argv;
if (tool === "--list") {
  const r = await rpc("tools/list", {}, 2);
  for (const t of r.result.tools) console.log(t.name, "-", (t.description||"").slice(0,150).replace(/\n/g," "));
  if (argStr) console.log(JSON.stringify(r.result.tools.find(t=>t.name===argStr), null, 1));
} else {
  const args = argStr ? (argStr.startsWith("@") ? JSON.parse(fs.readFileSync(argStr.slice(1), "utf8")) : JSON.parse(argStr)) : {};
  const r = await rpc("tools/call", { name: tool, arguments: args }, 3);
  if (r.error) { console.log(JSON.stringify(r.error)); process.exit(1); }
  for (const c of r.result.content ?? []) console.log(c.type === "text" ? c.text : JSON.stringify(c));
  if (r.result.structuredContent && !(r.result.content??[]).length) console.log(JSON.stringify(r.result.structuredContent));
  if (r.result.isError) process.exitCode = 2;
}
