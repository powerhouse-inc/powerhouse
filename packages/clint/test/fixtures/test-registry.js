#!/usr/bin/env node
/**
 * Minimal HTTP server that collects service announcement POSTs.
 *
 * Startup:
 *   Prints "Registry listening on http://localhost:{port}" on stdout
 *   so callers can detect readiness and discover the assigned port.
 *
 * Endpoints:
 *   POST /              — accepts JSON body, stores it in memory
 *   GET  /announcements — returns all stored payloads as a JSON array
 *
 * Env vars:
 *   PORT — listen port (default 0 = OS-assigned)
 */
import http from "node:http";

const port = parseInt(process.env.PORT || "0", 10);
const announcements = [];

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  if (req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        console.log(JSON.stringify(payload, null, 2));
        announcements.push(payload);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      } catch {
        console.log("  (invalid JSON)");
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end('{"error":"invalid json"}');
      }
    });
    return;
  }

  if (req.method === "GET" && req.url === "/announcements") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(announcements));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(port, () => {
  const addr = server.address();
  const assignedPort = typeof addr === "object" ? addr.port : port;
  console.log(`Registry listening on http://localhost:${assignedPort}`);
});
