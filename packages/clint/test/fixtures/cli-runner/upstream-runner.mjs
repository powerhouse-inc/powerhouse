import { createServer } from "node:http";
import { z } from "zod";

// A stand-in for a member that serves HTTP (a switchboard, Connect): it
// answers every request with the path it saw, and reports its origin.
export const kind = "reactor";
export const verbs = ["run", "serve", "dev", "build"];
export const hostSchema = {
  safeParse: (host) => ({ success: true, data: host }),
};
export const outputsSchema = z.strictObject({ origin: z.url() });

export async function run(host) {
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`${host.name} saw ${req.url}`);
  });
  const ready = new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  await ready;
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    outputs: { origin },
    ready,
    shutdown: () => new Promise((resolve) => server.close(resolve)),
  };
}

export const serve = run;
export const dev = run;
export async function build() {}
