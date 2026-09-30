import type { SwitchboardReactor } from "@powerhousedao/switchboard/server";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import {
  createServer,
  request,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const ERASURE_ADMIN = "0xadad00000000000000000000000000000000adad";
export const ERASURE_DRIVE_ID = "erasure-e2e";
export const ERASURE_DRIVE_NAME = "Erasure E2E";
const SWITCHBOARD_PORT = 4012;
const PROXY_PORT = 4013;
const SECRET = "vetra-e2e-privacy-deployment-secret-0123456789";

// Privacy refuses OPEN, and ADMIN_ONLY hides the drive from an anonymous Connect.
const ENV: Record<string, string> = {
  AUTH_ENABLED: "true",
  DOCUMENT_PERMISSIONS_ENABLED: "true",
  ADMINS: ERASURE_ADMIN,
  PH_PRIVACY_ENABLED: "true",
  PH_PRIVACY_DEPLOYMENT_SECRET: SECRET,
  PH_PRIVACY_INTERVAL_MS: "50",
  PH_PGLITE_IN_MEMORY: "1",
};

export type PrivacySwitchboard = {
  switchboard: SwitchboardReactor;
  /** What Connect is pointed at: the switchboard behind the pausable proxy. */
  driveUrl: string;
  graphqlUrl: string;
  /** Hold every request from Connect until `resume`. */
  pause(): void;
  resume(): void;
  stop(): Promise<void>;
};

type Held = { req: IncomingMessage; res: ServerResponse };

// Held, never refused: a failed poll puts the sync channel into backoff.
function startProxy(): { server: Server; pause(): void; resume(): void } {
  let paused = false;
  const held: Held[] = [];
  const forward = ({ req, res }: Held) => {
    const upstream = request(
      {
        host: "127.0.0.1",
        port: SWITCHBOARD_PORT,
        method: req.method,
        path: req.url,
        headers: req.headers,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  };
  const server = createServer((req, res) => {
    if (paused) {
      held.push({ req, res });
      return;
    }
    forward({ req, res });
  });
  return {
    server,
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
      for (const entry of held.splice(0)) forward(entry);
    },
  };
}

export async function startPrivacySwitchboard(): Promise<PrivacySwitchboard> {
  const tempRoot = await mkdtemp(join(tmpdir(), "vetra-erasure-"));
  // The cwd copy would register vetra's package registry and local modules.
  const configFile = join(tempRoot, "powerhouse.config.json");
  await writeFile(configFile, "{}\n");

  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(ENV)) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }
  const restoreEnv = () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };

  // Imported after the env is set: PH_PGLITE_IN_MEMORY is read at load.
  const { startSwitchboard } =
    await import("@powerhousedao/switchboard/server");
  let switchboard: SwitchboardReactor;
  try {
    switchboard = await startSwitchboard({
      port: SWITCHBOARD_PORT,
      strictPort: true,
      mcp: false,
      workflows: { enabled: false },
      disableLocalPackages: true,
      configFile,
      // Signs the marker; Connect runs without authEnforcement and trusts it.
      identity: { keypairPath: join(tempRoot, "identity.json") },
      drive: {
        id: ERASURE_DRIVE_ID,
        slug: ERASURE_DRIVE_ID,
        global: { name: ERASURE_DRIVE_NAME, icon: "" },
        local: {
          availableOffline: true,
          listeners: [],
          sharingType: "public",
          triggers: [],
        },
      },
    });
  } catch (error) {
    restoreEnv();
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }

  const proxy = startProxy();
  await new Promise<void>((resolve, reject) => {
    proxy.server.once("error", reject);
    proxy.server.listen(PROXY_PORT, "127.0.0.1", resolve);
  });
  const proxyBase = `http://localhost:${PROXY_PORT}`;

  return {
    switchboard,
    driveUrl: `${proxyBase}/d/${ERASURE_DRIVE_ID}`,
    graphqlUrl: `${proxyBase}/graphql/r`,
    pause: () => proxy.pause(),
    resume: () => proxy.resume(),
    stop: async () => {
      proxy.resume();
      proxy.server.closeAllConnections();
      await new Promise<void>((resolve) => proxy.server.close(() => resolve()));
      try {
        await switchboard.shutdown();
      } finally {
        restoreEnv();
        await rm(tempRoot, { recursive: true, force: true });
      }
    },
  };
}
