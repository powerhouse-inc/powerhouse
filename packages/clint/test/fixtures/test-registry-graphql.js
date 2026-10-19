#!/usr/bin/env node
/**
 * Minimal HTTP server that accepts GraphQL announceClintEndpoints mutations.
 *
 * Startup:
 *   Prints "Registry listening on http://localhost:{port}" on stdout
 *   so callers can detect readiness and discover the assigned port.
 *
 * Endpoints:
 *   POST /              — accepts GraphQL mutation JSON body, validates shape,
 *                         stores input variables, returns success response
 *   GET  /announcements — returns all stored mutation inputs as a JSON array
 *
 * Env vars:
 *   PORT        — listen port (default 0 = OS-assigned)
 *   DOCUMENT_ID — override the random document ID
 */
import http from "node:http";
import { randomUUID } from "node:crypto";

const port = parseInt(process.env.PORT || "0", 10);
const documentId = process.env.DOCUMENT_ID || randomUUID();
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
        const parsed = JSON.parse(body);
        if (!parsed.query || !parsed.variables?.input) {
          console.log("  (missing query or variables.input)");
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            '{"errors":[{"message":"missing query or variables.input"}]}',
          );
          return;
        }
        const input = parsed.variables.input;
        console.log(JSON.stringify(input, null, 2));
        announcements.push(input);
        const count = input.endpoints?.length ?? 0;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            data: {
              announceClintEndpoints: { ok: true, count },
            },
          }),
        );
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
  const url = `http://localhost:${assignedPort}?documentId=${documentId}`;
  console.log(`Registry listening on http://localhost:${assignedPort}`);
  console.log(`<CLI_NAME>_SERVICE_ANNOUNCE_URL=${url}`);
});
