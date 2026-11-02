import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createMonitorController } from "./controller.ts";
import {
  newToken,
  PASS_ENV,
  PROJECT_ROOTS_ENV,
  projectRootsFromEnv,
  serverEnvFromEnv,
  shutdown,
  STOP_TIMEOUT_MS,
} from "./hosting.ts";
import { createAppHandler, createControllerHandler } from "./http.ts";
import { createStaticHandler } from "./static.ts";

const USAGE = `usage: node src/server/serve.ts --project <root>… [--env KEY=VALUE…] [--port <n>]
Serves the built monitor (dist/) and its controller on 127.0.0.1.
Project roots also come from ${PROJECT_ROOTS_ENV}. --env and ${PASS_ENV} (names of
this process's vars) set env for every started host, code-loading keys included.`;

let parsed: ReturnType<typeof parse>;
function parse() {
  return parseArgs({
    options: {
      project: { type: "string", multiple: true },
      env: { type: "string", multiple: true },
      port: { type: "string", default: "4180" },
      help: { type: "boolean", short: "h" },
    },
  });
}
try {
  parsed = parse();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(USAGE);
  process.exit(2);
}
if (parsed.values.help) {
  console.log(USAGE);
  process.exit(0);
}

const roots = [
  ...(parsed.values.project ?? []).map((root) => path.resolve(root)),
  ...projectRootsFromEnv(),
];
const port = Number(parsed.values.port);
if (roots.length === 0 || !Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(USAGE);
  process.exit(2);
}

const dist = fileURLToPath(new URL("../../dist", import.meta.url));
if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error(
    `No ${path.join(dist, "index.html")}: run \`pnpm build\` first.`,
  );
  process.exit(1);
}

const serverEnv = serverEnvFromEnv();
for (const pair of parsed.values.env ?? []) {
  const eq = pair.indexOf("=");
  if (eq <= 0) {
    console.error(`--env expects KEY=VALUE, got ${JSON.stringify(pair)}`);
    process.exit(2);
  }
  serverEnv[pair.slice(0, eq)] = pair.slice(eq + 1);
}

let controller: ReturnType<typeof createMonitorController>;
try {
  controller = createMonitorController({
    projectRoots: roots,
    serverEnv,
    stopTimeoutMs: STOP_TIMEOUT_MS,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
const token = newToken();
const api = createControllerHandler({ controller, token });
const files = createStaticHandler({ root: dist, token });

const server = http.createServer(createAppHandler(api, files));

let closing = false;
const close = (code: number) => {
  if (closing) return;
  closing = true;
  server.close();
  server.closeAllConnections();
  void shutdown(controller).finally(() => process.exit(code));
};
process.once("SIGINT", () => close(130));
process.once("SIGTERM", () => close(143));

server.on("error", (error) => {
  console.error(`[ph-monitor] ${error.message}`);
  close(1);
});
server.listen(port, "127.0.0.1", () => {
  const { port: bound } = server.address() as AddressInfo;
  console.log(`[ph-monitor] http://127.0.0.1:${bound}/`);
  console.log(`[ph-monitor] projects: ${roots.join(", ")}`);
});
