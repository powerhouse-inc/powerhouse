import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnHost, type SpawnedHost } from "@powerhousedao/host-core";
import { afterEach, describe, expect, it } from "vitest";

// The project's .env points the read model at a dead Postgres: boot needs PH_NO_DOTENV.

const here = path.dirname(fileURLToPath(import.meta.url));
const PH_CLI_DIR = path.resolve(here, "..");
const SCAFFOLD_CONFIG = path.resolve(
  here,
  "../../../packages/host-core/test/fixtures/hosts/scaffold/powerhouse.config.json",
);
const HOST_NAME = "spawn-e2e-switchboard";

async function ephemeralPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function makeProject(port: number): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-spawn-e2e-"));
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "spawn-e2e", type: "module", private: true }),
  );
  mkdirSync(path.join(dir, "node_modules", "@powerhousedao"), {
    recursive: true,
  });
  symlinkSync(
    PH_CLI_DIR,
    path.join(dir, "node_modules", "@powerhousedao", "ph-cli"),
    "dir",
  );
  copyFileSync(SCAFFOLD_CONFIG, path.join(dir, "powerhouse.config.json"));
  writeFileSync(
    path.join(dir, ".env"),
    "PH_SWITCHBOARD_DATABASE_URL=postgres://127.0.0.1:1/x\n",
  );
  mkdirSync(path.join(dir, "hosts", "sb"), { recursive: true });
  writeFileSync(
    path.join(dir, "hosts", "sb", "host.js"),
    `// @ts-check
export default {
  name: "${HOST_NAME}",
  runner: {
    module: "@powerhousedao/ph-cli/runners/switchboard",
    port: ${port},
  },
  reactor: {
    backends: {
      main: {
        kind: "in-process",
        storage: { kind: "path", dataDir: "\${userData}/.ph/reactor-storage" },
      },
    },
  },
};
`,
  );
  return dir;
}

describe.skipIf(process.platform === "win32")("spawnHost (real ph-cli)", () => {
  const temporary: string[] = [];
  let host: SpawnedHost | undefined;

  afterEach(async () => {
    await host?.stop();
    host = undefined;
    for (const dir of temporary.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("boots a switchboard in an isolated data dir, ignoring the project's .env", async () => {
    const projectRoot = makeProject(await ephemeralPort());
    const dataDir = mkdtempSync(path.join(tmpdir(), "ph-spawn-e2e-data-"));
    temporary.push(projectRoot, dataDir);

    host = await spawnHost({
      projectRoot,
      host: "sb",
      dataDir,
      readyTimeoutMs: 150_000,
    });
    expect(host.record.host).toBe(HOST_NAME);
    expect(existsSync(path.join(projectRoot, ".ph"))).toBe(false);
    expect(existsSync(path.join(dataDir, ".ph", "reactor-storage"))).toBe(true);

    const outputs = host.outputs as { endpoints: { graphql: string } };
    const res = await fetch(outputs.endpoints.graphql, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { __typename: "Query" } });

    const exit = await host.stop();
    expect(exit.forced).toBe(false);
    expect(exit.code).toBe(0);
    expect(
      existsSync(path.join(dataDir, ".ph", "run", `${HOST_NAME}.json`)),
    ).toBe(false);
  }, 240_000);
});
