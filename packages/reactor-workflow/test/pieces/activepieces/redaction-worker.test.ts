// Redaction where it is strongest: in the child, before a credential can
// cross into the host at all. Local fixtures, no network.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PieceWorker,
  PieceWorkerError,
} from "../../src/activepieces/worker/host.js";
import type { PieceLogEntry } from "../../src/activepieces/worker/protocol.js";
import { ActivepiecesBlockExecutor } from "../../src/engine/blocks.js";
import { StaticConnectionResolver } from "../../src/engine/connections.js";
import { InMemorySecretProvider } from "../../src/engine/secrets.js";
import type { BlockExecution } from "../../src/engine/types.js";

const TOKEN = "ghp_9fA3kQ2xZ7rT1nP0bV6mL4sD8wJ5cH";

const LEAKY_FIXTURE = `
const app = {
  displayName: "Leaky Fixture",
  actions: {
    chatty: {
      name: "chatty",
      displayName: "Chatty",
      props: {},
      run: async (ctx) => {
        const token = ctx.auth.props.app_token;
        console.log("POST /v1/send Authorization: Bearer " + token);
        return { sent: true };
      },
    },
    boom: {
      name: "boom",
      displayName: "Boom",
      props: {},
      run: async (ctx) => {
        const error = new Error("401 for token " + ctx.auth.props.app_token);
        error.config = {
          url: "https://api.example.com/v1/items?api_key=abcd1234efgh",
          headers: {
            Authorization: "Bearer piece-own-token-9876",
            "content-type": "application/json",
          },
        };
        error.response = { status: 401, data: { message: "unauthorized" } };
        throw error;
      },
    },
  },
};
module.exports = { app };
`;

const connections = new StaticConnectionResolver(
  {
    leaky: {
      authType: "CUSTOM_AUTH",
      config: { base_url: "https://api.example.com" },
      secretRefs: [{ name: "app_token", ref: "vault://leaky" }],
    },
  },
  new InMemorySecretProvider({ "vault://leaky": TOKEN }),
);

let cacheDir = "";
let worker: PieceWorker;

function execution(actionName: string): BlockExecution {
  const blockType = `@test/leaky@1.0.0#${actionName}`;
  return {
    blockType,
    config: {},
    connectionId: "leaky",
    step: { id: "s1", key: "step", blockType } as BlockExecution["step"],
  };
}

describe("redaction in the piece worker", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "ap-redact-"));
    worker = new PieceWorker();
    const dir = join(cacheDir, "@test-leaky-1.0.0");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "@test/leaky",
        version: "1.0.0",
        main: "index.js",
      }),
    );
    await writeFile(join(dir, "index.js"), LEAKY_FIXTURE);
  });

  afterAll(async () => {
    worker.dispose();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("redacts a credential a piece logs about its own request", async () => {
    const logs: PieceLogEntry[] = [];
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      connections,
      onPieceLog: (entry) => logs.push(entry),
    });

    const result = await executor.execute(execution("chatty"));

    expect(result.output).toEqual({ sent: true });
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe(
      "POST /v1/send Authorization: [redacted:authorization]",
    );
    expect(logs[0].message).not.toContain(TOKEN);
  });

  it("strips the error before it crosses back to the host", async () => {
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      connections,
    });

    const error = await executor
      .execute(execution("boom"))
      .then(() => undefined, (thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(PieceWorkerError);
    const { serialized, message, stack } = error as PieceWorkerError;
    expect(serialized.message).toBe("401 for token [redacted:secret]");
    expect(serialized.properties.config).toEqual({
      url: "https://api.example.com/v1/items?api_key=[redacted:api_key]",
      headers: {
        Authorization: "[redacted:authorization]",
        "content-type": "application/json",
      },
    });
    // The status and the upstream message are what makes this debuggable.
    expect(serialized.properties.response).toEqual({
      status: 401,
      data: { message: "unauthorized" },
    });
    expect(`${message}${stack ?? ""}`).not.toContain(TOKEN);
  });
});
