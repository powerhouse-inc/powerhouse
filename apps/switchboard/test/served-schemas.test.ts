/**
 * Regenerate after an intended change, from the repository root. Removing the
 * goldens first drops those of endpoints no longer served:
 *
 *   rm -rf packages/reactor-api/test/graphql/goldens apps/switchboard/test/goldens && \
 *   UPDATE_GOLDENS=1 pnpm --workspace-concurrency=1 \
 *     --filter @powerhousedao/reactor-api --filter @powerhousedao/switchboard \
 *     exec vitest run served-schemas && pnpm exec oxfmt \
 *     packages/reactor-api/test/graphql/goldens apps/switchboard/test/goldens
 */
import {
  expectSchemaGolden,
  jsonGolden,
  recordServedSchemas,
  type ServedEndpoints,
} from "@powerhousedao/reactor-api/test";
import type { ILogger } from "document-model";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { startSwitchboard } from "../src/server.mjs";
import { bootSwitchboard } from "./boot-helpers.js";

const goldens = (file: string) =>
  fileURLToPath(new URL(`./goldens/${file}`, import.meta.url));

const SUBGRAPHS = [
  "packages",
  "privacy",
  "reactor-drive-nodes",
  "workflow-runtime",
];

const ADMIN = "0xadad00000000000000000000000000000000adad";
const SECRET = "switchboard-served-schemas-deployment-secret";

function stubLogger(): ILogger {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as ILogger;
}

const realFetch = globalThis.fetch;
let tempRoot: string;
let recorder: ReturnType<typeof recordServedSchemas> | undefined;
let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;
let served: ServedEndpoints;

beforeAll(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "switchboard-served-schemas-"));
  const configFile = join(tempRoot, "powerhouse.config.json");
  await writeFile(configFile, "{}");
  // The workflow runtime reads a hard-coded cloud piece catalog at boot.
  vi.stubGlobal(
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      return url.hostname === "127.0.0.1"
        ? realFetch(input, init)
        : Promise.reject(new Error(`${url.host} is off limits to this test`));
    },
  );
  recorder = recordServedSchemas();
  // Every switchboard subgraph on, from this config alone: no inherited env,
  // config file or user data. The registry URL only turns the packages
  // subgraph on, and the Renown URL keeps discovery off the network.
  switchboard = await bootSwitchboard(
    {
      server: { port: 0 },
      storage: {
        reactor: { url: join(tempRoot, "reactor") },
        readModel: { url: join(tempRoot, "read-model") },
        userDataDir: tempRoot,
      },
      auth: {
        enabled: true,
        admins: [ADMIN],
        renown: { url: "http://127.0.0.1:9" },
      },
      features: {
        workflows: true,
        mcp: false,
        privacy: { enabled: true, deploymentSecret: SECRET },
      },
      packages: { disableLocal: true, registryUrl: "http://127.0.0.1:9" },
      identity: { keypairPath: join(tempRoot, "identity.json") },
      configFile,
    },
    { logger: stubLogger() },
    {},
  );
  served = await recorder.read(
    (request) => realFetch(request),
    `http://127.0.0.1:${switchboard.port}`,
    SUBGRAPHS,
  );
}, 120_000);

afterAll(async () => {
  try {
    await switchboard?.shutdown();
  } finally {
    recorder?.restore();
    vi.unstubAllGlobals();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

describe("switchboard served schemas", () => {
  it.each(SUBGRAPHS)("serves /graphql/%s as its golden", async (name) => {
    const schema = served.subgraphs.get(name);
    expect(schema, `/graphql/${name} is not served`).toBeDefined();
    await expectSchemaGolden(schema!, goldens(`${name}.graphql`));
  });

  it("serves /graphql as supergraph.graphql", async () => {
    await expectSchemaGolden(served.supergraph, goldens("supergraph.graphql"));
  });

  it("binds the resolvers in resolvers.json", async () => {
    expect(served.resolvers).toEqual(
      await jsonGolden(goldens("resolvers.json"), served.resolvers),
    );
  });
});
