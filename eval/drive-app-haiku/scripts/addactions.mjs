// usage: node addactions.mjs <documentId> <actions.json>
import { readFileSync } from "node:fs";
const ENDPOINT = "http://localhost:7809/mcp";
const h = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const [, , docId, file] = process.argv;
const actions = JSON.parse(readFileSync(file, "utf8"));
const r = await fetch(ENDPOINT, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "e", version: "1" } } }) });
const hh = { ...h, "mcp-session-id": r.headers.get("mcp-session-id") };
await fetch(ENDPOINT, { method: "POST", headers: hh, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
const t = await fetch(ENDPOINT, { method: "POST", headers: hh, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "addActions", arguments: { documentId: docId, actions } } }) });
const txt = await t.text();
const j = JSON.parse((txt.split("\n").find((l) => l.startsWith("data:")) || txt).replace(/^data:/, ""));
const out = j.result?.content?.[0]?.text ?? JSON.stringify(j.error ?? j);
console.log(String(out).slice(0, Number(process.env.MAXC || 1500)));
