// blockDescriptor over fixture pieces served by a local npm and CDN: the bundle
// is loaded in the piece worker, so no piece module ever runs in this process.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startPieceSources,
  type PieceSources,
} from "../../test/helpers/piece-sources.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { CORE_PIECE_VERSION } from "../pieces/index.js";

const runtime = testRuntime();

const PIECES = {
  card: { name: "@activepieces/piece-card", version: "1.0.0" },
  env: { name: "@activepieces/piece-env", version: "1.0.0" },
  broken: { name: "@activepieces/piece-broken", version: "1.0.0" },
} as const;

function block(
  piece: keyof typeof PIECES,
  name: string,
  kind: "action" | "trigger" = "action",
) {
  const { name: pieceName, version: pieceVersion } = PIECES[piece];
  return { pieceName, pieceVersion, kind, name };
}

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
  displayName: process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY ? "leaked" : "isolated",
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

let sources: PieceSources;

describe("WorkflowRuntimeService.blockDescriptor", () => {
  beforeAll(async () => {
    process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY =
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    sources = await startPieceSources({
      npm: (Object.keys(PIECES) as Array<keyof typeof PIECES>).map((key) => ({
        ...PIECES[key],
        code: FIXTURE_BUNDLES[key],
      })),
    });
  });

  afterAll(async () => {
    delete process.env.PH_WORKFLOWS_SECRETS_MASTER_KEY;
    await sources.stop();
  });

  it("returns the action descriptor for a piece block", async () => {
    const descriptor = await runtime.blockDescriptor(
      block("card", "create_card"),
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
        ports: ["next", "error"],
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
    // An Activepieces piece: listed by its npm packument, fetched from the CDN.
    expect(sources.requests).toContain(
      `/cdn/${PIECES.card.name.replace("/", "-")}-${PIECES.card.version}.tgz`,
    );
  });

  it("returns the trigger descriptor under a trigger key", async () => {
    const descriptor = await runtime.blockDescriptor(
      block("card", "new_card", "trigger"),
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
    const card = block("card", "create_card");
    await runtime.blockDescriptor(card);
    const asked = sources.requests.length;

    const descriptor = await runtime.blockDescriptor(card);

    expect(descriptor).toMatchObject({ displayName: "Card Fixture" });
    expect(sources.requests).toHaveLength(asked);
  });

  // The piece module's top-level code must not see the reactor's environment;
  // a fixture that reads the master key would report "leaked" if it ran here.
  it("builds the descriptor outside the reactor process", async () => {
    const descriptor = await runtime.blockDescriptor(block("env", "probe"));

    expect(descriptor).toMatchObject({ displayName: "isolated" });
  });

  it("surfaces a bundle that throws at module load as a clean error", async () => {
    await expect(
      runtime.blockDescriptor(block("broken", "anything")),
    ).rejects.toThrow("fixture: exploded at module load");
  });

  it("answers null for a piece no source has", async () => {
    expect(
      await runtime.blockDescriptor({
        pieceName: "@activepieces/piece-absent",
        pieceVersion: "9.9.9",
        kind: "action" as const,
        name: "nope",
      }),
    ).toBeNull();
  });

  it("returns null for a block its piece does not have", async () => {
    expect(
      await runtime.blockDescriptor({
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        kind: "action" as const,
        name: "nonsense",
      }),
    ).toBeNull();
  });
});
