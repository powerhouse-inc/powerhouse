// Tiny MCP streamable-HTTP client.
// Usage: node mcp.mjs list            -> tool names
//        node mcp.mjs call <tool> '<json args>'
//        node mcp.mjs schema <tool>
const URL_ = process.env.MCP_URL ?? "http://localhost:7082/mcp";
let session;
let id = 0;
async function rpc(method, params, notify = false) {
  const body = { jsonrpc: "2.0", method, params };
  if (!notify) body.id = ++id;
  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(session ? { "mcp-session-id": session } : {}),
    },
    body: JSON.stringify(body),
  });
  const sid = res.headers.get("mcp-session-id");
  if (sid) session = sid;
  if (notify) return;
  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";
  let msg;
  if (ct.includes("event-stream")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    msg = JSON.parse(lines[lines.length - 1].slice(5));
  } else msg = JSON.parse(text);
  if (msg.error) throw new Error(JSON.stringify(msg.error));
  return msg.result;
}
await rpc("initialize", {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "eval", version: "0" },
});
await rpc("notifications/initialized", {}, true);
const [cmd, a, b] = process.argv.slice(2);
if (cmd === "list") {
  const r = await rpc("tools/list", {});
  for (const t of r.tools) console.log(t.name, "-", (t.description ?? "").slice(0, 150).replace(/\n/g, " "));
} else if (cmd === "schema") {
  const r = await rpc("tools/list", {});
  console.log(JSON.stringify(r.tools.find((t) => t.name === a), null, 1));
} else if (cmd === "call") {
  const r = await rpc("tools/call", { name: a, arguments: JSON.parse(b ?? "{}") });
  for (const c of r.content ?? []) console.log(c.text ?? JSON.stringify(c));
  if (r.isError) process.exitCode = 1;
}
