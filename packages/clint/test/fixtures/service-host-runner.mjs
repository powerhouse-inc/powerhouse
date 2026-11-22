import fs from "node:fs";
import { createServer } from "node:http";
import { z } from "zod";

// A host a service runs (`ph run <host> dev`), alone or as a compound's
// member: it writes its pid to `config.pidFile` at once, then serves HTTP and
// reports its origin once listening, after `config.delayMs`. As a real runner
// does (ph run installs no handler for a standalone host), it stops on
// SIGTERM, which is how `ph run` delivers a stop asked through stdin: the stop
// writes `config.marker`. With `config.hang` it never finishes, so only the
// stop timeout ends it.
export const kind = "reactor";
export const verbs = ["run", "dev"];
export const hostSchema = {
  safeParse: (host) => ({ success: true, data: host }),
};
export const outputsSchema = z.strictObject({ origin: z.url() });

export async function dev(host) {
  const config = host.config ?? {};
  fs.writeFileSync(config.pidFile, String(process.pid));
  await new Promise((resolve) => setTimeout(resolve, config.delayMs ?? 0));
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`${host.name} saw ${req.url}`);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const shutdown = () =>
    config.hang
      ? new Promise(() => undefined)
      : new Promise((resolve) =>
          server.close(() => {
            fs.writeFileSync(config.marker, "stopped through its stop");
            resolve();
          }),
        );
  process.once("SIGTERM", () => {
    void shutdown().then(() => process.exit(0));
  });
  return {
    outputs: { origin: `http://127.0.0.1:${server.address().port}` },
    ready: Promise.resolve(),
    shutdown,
  };
}

export const run = dev;
