// Stands in for `ph vetra`: `node stub-vetra.mjs <port> <projectName> [fail]`.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const [port, projectName, mode] = process.argv.slice(2);
fs.appendFileSync(path.join(process.cwd(), "starts.log"), `${process.pid}\n`);
console.log("stub vetra booting");

if (mode === "fail") {
  console.error(`Error: Port ${port} is already in use (strictPort)`);
  process.exit(3);
}

const bootedAt = Date.now();
const server = http.createServer((req, res) => {
  const ready = Date.now() - bootedAt > 400;
  res.writeHead(req.url === "/ready" && !ready ? 503 : 200).end("OK");
});
server.listen(Number(port), () => {
  const record = {
    pid: process.pid,
    projectName,
    switchboardPort: Number(port),
    connectPort: 0,
    mcpUrl: `http://localhost:${port}/mcp`,
    startedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.join(process.cwd(), ".ph"), { recursive: true });
  fs.writeFileSync(
    path.join(process.cwd(), ".ph", "vetra-runtime.json"),
    JSON.stringify(record),
  );
});
process.on("SIGTERM", () => process.exit(0));
