// Descriptor building over the worker boundary, on offline fixture bundles:
// the piece module's top-level code runs in the worker, not in this process.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PieceWorker,
  PieceWorkerError,
  PieceWorkerTimeoutError,
} from "../../../src/pieces/activepieces/worker/host.js";
import type { ConnectorDescriptor } from "../../../src/pieces/activepieces/descriptor.js";

const FIXTURES = {
  full: `
const app = {
  displayName: "Full Fixture",
  description: "A fixture piece",
  logoUrl: "https://example.com/logo.png",
  categories: ["PRODUCTIVITY"],
  minimumSupportedRelease: "0.30.0",
  auth: { type: "CUSTOM_AUTH", displayName: "Credentials", required: true },
  actions: {
    create_card: {
      name: "create_card",
      displayName: "Create Card",
      description: "Creates a card",
      requireAuth: true,
      props: {
        title: {
          displayName: "Title",
          type: "SHORT_TEXT",
          required: true,
          defaultValue: "untitled",
        },
        board: {
          displayName: "Board",
          type: "DROPDOWN",
          required: true,
          refreshers: ["auth"],
          options: () => Promise.resolve({ options: [] }),
        },
      },
      run: async () => undefined,
    },
  },
  triggers: {
    new_card: {
      name: "new_card",
      displayName: "New Card",
      type: "POLLING",
      testStrategy: "SIMULATION",
      requireAuth: true,
      props: {},
      sampleData: { id: 1 },
      run: async () => [],
    },
  },
};
module.exports = { app };
`,
  // Reads the host env at module scope: "leaked" would mean the bundle was
  // loaded in the reactor process.
  env: `
const app = {
  displayName: process.env.PH_SECRETS_MASTER_KEY ? "leaked" : "isolated",
  actions: {},
  triggers: {},
};
module.exports = { app };
`,
  throws: `
throw new Error("fixture: exploded at module load");
`,
  hang: `
const app = { displayName: "Hang Fixture", actions: {} };
await new Promise(() => {});
module.exports = { app };
`,
} as const;

type FixtureName = keyof typeof FIXTURES;

let cacheDir = "";
let worker: PieceWorker;

function bundleDir(name: FixtureName): string {
  return join(cacheDir, name);
}

function describeFixture(name: FixtureName): Promise<ConnectorDescriptor> {
  return worker
    .describePiece({
      bundleDir: bundleDir(name),
      packageName: `@activepieces/piece-${name}`,
      version: "1.0.0",
    })
    .then((result) => result.output as ConnectorDescriptor);
}

describe("PieceWorker.describePiece", () => {
  beforeAll(async () => {
    process.env.PH_SECRETS_MASTER_KEY = "host-only-master-key";
    cacheDir = await mkdtemp(join(tmpdir(), "ap-worker-describe-"));
    for (const name of Object.keys(FIXTURES) as FixtureName[]) {
      const dir = bundleDir(name);
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          name,
          version: "1.0.0",
          main: "index.js",
          // The hang fixture uses top-level await, which needs ESM.
          ...(name === "hang" ? { type: "module" } : {}),
        }),
      );
      await writeFile(join(dir, "index.js"), FIXTURES[name]);
    }
    worker = new PieceWorker();
  });

  afterAll(async () => {
    worker.dispose();
    delete process.env.PH_SECRETS_MASTER_KEY;
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("builds the descriptor inside the worker", async () => {
    const descriptor = await describeFixture("full");

    expect(descriptor).toEqual({
      id: "activepieces:@activepieces/piece-full",
      source: {
        packageName: "@activepieces/piece-full",
        version: "1.0.0",
      },
      displayName: "Full Fixture",
      description: "A fixture piece",
      logoUrl: "https://example.com/logo.png",
      categories: ["PRODUCTIVITY"],
      minimumSupportedRelease: "0.30.0",
      auth: {
        type: "CUSTOM_AUTH",
        displayName: "Credentials",
        required: true,
      },
      actions: [
        {
          name: "create_card",
          displayName: "Create Card",
          description: "Creates a card",
          requireAuth: true,
          props: [
            {
              name: "title",
              displayName: "Title",
              type: "SHORT_TEXT",
              required: true,
              defaultValue: "untitled",
              hasDynamicResolver: false,
            },
            {
              name: "board",
              displayName: "Board",
              type: "DROPDOWN",
              required: true,
              hasDynamicResolver: true,
              dynamicResolverId:
                "activepieces:@activepieces/piece-full#create_card.board",
              refreshers: ["auth"],
            },
          ],
        },
      ],
      triggers: [
        {
          name: "new_card",
          displayName: "New Card",
          strategy: "POLLING",
          testStrategy: "SIMULATION",
          requireAuth: true,
          props: [],
          hasSampleData: true,
        },
      ],
    });
  });

  it("keeps host env out of the module's top-level code", async () => {
    const descriptor = await describeFixture("env");

    expect(descriptor.displayName).toBe("isolated");
  });

  it("serializes a bundle that throws at module load", async () => {
    const error: unknown = await describeFixture("throws").then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(PieceWorkerError);
    expect((error as PieceWorkerError).serialized.message).toBe(
      "fixture: exploded at module load",
    );
  });

  it("kills a bundle that hangs at module load and replaces the worker", async () => {
    const error: unknown = await worker
      .describePiece(
        {
          bundleDir: bundleDir("hang"),
          packageName: "@activepieces/piece-hang",
          version: "1.0.0",
        },
        { timeoutMs: 500 },
      )
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(PieceWorkerTimeoutError);

    const descriptor = await describeFixture("full");
    expect(descriptor).toMatchObject({ displayName: "Full Fixture" });
  }, 15_000);
});
