const URL_ = "http://localhost:7867/mcp";
const H = { "content-type": "application/json", accept: "application/json, text/event-stream" };
async function parse(res) {
  const t = await res.text();
  if (t.includes("\ndata:") || t.startsWith("event:")) {
    return JSON.parse(t.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join(""));
  }
  return JSON.parse(t);
}
export async function open() {
  let res = await fetch(URL_, { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "eval", version: "1" } } }) });
  const sid = res.headers.get("mcp-session-id");
  await parse(res);
  const h = { ...H, "mcp-session-id": sid };
  await fetch(URL_, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  let n = 2;
  return {
    async call(name, args) {
      const r = await parse(await fetch(URL_, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", id: n++, method: "tools/call", params: { name, arguments: args } }) }));
      if (r.error) return { error: r.error };
      const txt = r.result?.content?.[0]?.text;
      return { isError: r.result?.isError, structured: r.result?.structuredContent, text: txt };
    },
  };
}
