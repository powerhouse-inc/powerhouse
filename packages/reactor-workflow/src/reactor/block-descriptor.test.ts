// blockDescriptor over offline fixture pieces: the bundle is loaded in the
// piece worker, so no piece module ever runs in this process.
import { ensurePieceBundle } from "@powerhousedao/reactor-connectors";
import type * as ReactorConnectors from "@powerhousedao/reactor-connectors";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Bundle loads are redirected to a fixture cache (same layout as the real
// one) so no test ever reaches the Activepieces cloud.
vi.mock("@powerhousedao/reactor-connectors", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactorConnectors>();
  return { ...actual, ensurePieceBundle: vi.fn() };
});

import { BUNDLE_CACHE_DIR } from "./lib.js";
import { workflowRuntime } from "./service.js";

const PIECES = {
  card: { name: "@activepieces/piece-card", version: "1.0.0" },
  env: { name: "@activepieces/piece-env", version: "1.0.0" },
  broken: { name: "@activepieces/piece-broken", version: "1.0.0" },
} as const;

const FIXTURE_BUNDLES: Record<keyof typeof PIECES, string> = {
  card: `
const app = {
  displayName: "Card Fixture",
  logoUrl: "https://example.com/card.png",
  auth: { type: "CUSTOM_AUTH", displayName: "Credentials", required: true },
  actions: {
    create_card: {
      name: "create_card",
      displayName: "Create Card",
      description: "Creates a card",
      requireAuth: true,
      props: {
        title: { displayName: "Title", type: "SHORT_TEXT", required: true },
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
      requireAuth: true,
      props: {},
      sampleData: { id: 1 },
      run: async () => [],
    },
  },
};
module.exports = { app };
`,
  // Reads the reactor's own env at module scope; "leaked" would mean the
  // bundle was loaded in this process.
  env: `
const app = {
  displayName: process.env.PH_SECRETS_MASTER_KEY ? "leaked" : "isolated",
  actions: {
    probe: {
      name: "probe",
      displayName: "Probe",
      props: {},
      run: async () => undefined,
    },
  },
  triggers: {},
};
module.exports = { app };
`,
  broken: `
throw new Error("fixture: exploded at module load");
`,
};

let cacheDir = "";

function fixtureDir(piece: (typeof PIECES)[keyof typeof PIECES]): string {
  return join(cacheDir, `${piece.name.replace("/", "-")}-${piece.version}`);
}

async function writeFixtureBundle(
  piece: (typeof PIECES)[keyof typeof PIECES],
  code: string,
): Promise<void> {
  const dir = fixtureDir(piece);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: piece.name,
      version: piece.version,
      main: "index.js",
    }),
  );
  await writeFile(join(dir, "index.js"), code);
}

describe("WorkflowRuntimeService.blockDescriptor", () => {
  beforeAll(async () => {
    process.env.PH_SECRETS_MASTER_KEY =
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    cacheDir = await mkdtemp(join(tmpdir(), "ap-block-descriptor-"));
    for (const key of Object.keys(PIECES) as Array<keyof typeof PIECES>) {
      await writeFixtureBundle(PIECES[key], FIXTURE_BUNDLES[key]);
    }

    vi.mocked(ensurePieceBundle).mockImplementation(
      ({ name, version, cacheDir: requestedCacheDir }) => {
        void requestedCacheDir;
        const dir = join(cacheDir, `${name.replace("/", "-")}-${version}`);
        if (!existsSync(join(dir, "package.json"))) {
          return Promise.reject(
            new Error(
              `Offline descriptor test: no fixture bundle for ${name}@${version}`,
            ),
          );
        }
        return Promise.resolve({
          dir,
          source: "cache",
          dependencies: {},
          installed: false,
        });
      },
    );
  });

  afterAll(async () => {
    delete process.env.PH_SECRETS_MASTER_KEY;
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("returns the action descriptor for a piece block", async () => {
    const descriptor = await workflowRuntime.blockDescriptor(
      `${PIECES.card.name}@${PIECES.card.version}#create_card`,
    );

    expect(descriptor).toEqual({
      displayName: "Card Fixture",
      logoUrl: "https://example.com/card.png",
      auth: {
        type: "CUSTOM_AUTH",
        displayName: "Credentials",
        required: true,
      },
      action: {
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
            hasDynamicResolver: false,
          },
          {
            name: "board",
            displayName: "Board",
            type: "DROPDOWN",
            required: true,
            hasDynamicResolver: true,
            dynamicResolverId: `activepieces:${PIECES.card.name}#create_card.board`,
            refreshers: ["auth"],
          },
        ],
      },
    });
    expect(ensurePieceBundle).toHaveBeenCalledWith({
      name: PIECES.card.name,
      version: PIECES.card.version,
      cacheDir: BUNDLE_CACHE_DIR,
    });
  });

  it("returns the trigger descriptor under a trigger key", async () => {
    const descriptor = await workflowRuntime.blockDescriptor(
      `${PIECES.card.name}@${PIECES.card.version}#trigger:new_card`,
    );

    expect(descriptor).toMatchObject({
      displayName: "Card Fixture",
      trigger: {
        name: "new_card",
        displayName: "New Card",
        strategy: "POLLING",
        requireAuth: true,
        props: [],
        hasSampleData: true,
      },
    });
  });

  it("serves a repeat descriptor from cache without re-resolving the bundle", async () => {
    const blockType = `${PIECES.card.name}@${PIECES.card.version}#create_card`;
    await workflowRuntime.blockDescriptor(blockType);
    vi.mocked(ensurePieceBundle).mockClear();

    const descriptor = await workflowRuntime.blockDescriptor(blockType);

    expect(descriptor).toMatchObject({ displayName: "Card Fixture" });
    expect(ensurePieceBundle).not.toHaveBeenCalled();
  });

  // The piece module's top-level code must not see the reactor's environment;
  // a fixture that reads the master key would report "leaked" if it ran here.
  it("builds the descriptor outside the reactor process", async () => {
    const descriptor = await workflowRuntime.blockDescriptor(
      `${PIECES.env.name}@${PIECES.env.version}#probe`,
    );

    expect(descriptor).toMatchObject({ displayName: "isolated" });
  });

  it("surfaces a bundle that throws at module load as a clean error", async () => {
    await expect(
      workflowRuntime.blockDescriptor(
        `${PIECES.broken.name}@${PIECES.broken.version}#anything`,
      ),
    ).rejects.toThrow("fixture: exploded at module load");
  });

  it("keeps the bundle resolution error wording", async () => {
    await expect(
      workflowRuntime.blockDescriptor("@activepieces/piece-absent@9.9.9#nope"),
    ).rejects.toThrow(
      "Offline descriptor test: no fixture bundle for @activepieces/piece-absent@9.9.9",
    );
  });

  it("returns null for a block type that is not a piece", async () => {
    expect(await workflowRuntime.blockDescriptor("core#manual")).toBeNull();
  });
});
