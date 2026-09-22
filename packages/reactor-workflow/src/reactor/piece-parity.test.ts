// A piece must look the same through this reactor whether it arrived inside a
// package or from a registry.

// The published half is the catalog's JSON verbatim; the package half is
// projected by hand, so it is the half that silently loses a field.
import { buildDescriptor } from "../pieces/activepieces/descriptor.js";
import type { ApPiece } from "../pieces/activepieces/types.js";
import { actionsResult, detailResult } from "./local-catalog.js";

const PIECE = "@acme/piece-parity";
const VERSION = "1.0.0";

// Everything an author can put on an action or trigger that is data rather
// than behaviour.
const AUTHORED: ApPiece = {
  displayName: "Parity",
  description: "Declares the whole authoring surface",
  logoUrl: "https://example.com/logo.png",
  categories: ["PRODUCTIVITY"],
  actions: {
    summarise: {
      name: "summarise",
      displayName: "Summarise",
      description: "Returns a summary",
      requireAuth: true,
      audience: "both",
      props: {
        since: { displayName: "Since", type: "SHORT_TEXT", required: false },
      },
      outputSchema: { fields: [{ key: "total", label: "Total" }] },
      run: () => Promise.resolve(undefined),
    },
    // Agent-targeted, so it must sort below the human-facing one.
    atomise: {
      name: "atomise",
      displayName: "Atomise",
      description: "An atomic for agents",
      requireAuth: true,
      audience: "ai",
      props: {},
      run: () => Promise.resolve(undefined),
    },
  },
  triggers: {
    thing_happened: {
      name: "thing_happened",
      displayName: "Thing Happened",
      description: "Fires on a thing",
      type: "POLLING",
      testStrategy: "TEST_FUNCTION",
      requireAuth: true,
      props: {},
      sampleData: { id: "evt-1" },
      outputSchema: { fields: [{ key: "id", label: "Id" }] },
      handshakeConfiguration: {
        strategy: "HEADER_PRESENT",
        paramName: "x-hook",
      },
      run: () => Promise.resolve([]),
    },
  },
};

// Behaviour, which never crosses into a listing.
const HOOKS = new Set([
  "run",
  "test",
  "onEnable",
  "onDisable",
  "onStart",
  "onRenew",
  "onHandshake",
]);

function authoredDataKeys(block: Record<string, unknown>): string[] {
  return Object.keys(block).filter((key) => !HOOKS.has(key));
}

function blocks(
  kind: "actions" | "triggers",
): Record<string, Record<string, unknown>> {
  return AUTHORED[kind] as Record<string, Record<string, unknown>>;
}

function detail() {
  const descriptor = buildDescriptor(AUTHORED, {
    packageName: PIECE,
    version: VERSION,
  });
  return detailResult(descriptor, PIECE, VERSION) as {
    actions: Record<string, Record<string, unknown>>;
    triggers: Record<string, Record<string, unknown>>;
  };
}

describe("a package piece and a published one look the same", () => {
  it("keeps every data field an action declares", () => {
    const entry = detail().actions.summarise;

    for (const key of authoredDataKeys(blocks("actions").summarise)) {
      expect(entry, `the listing lost the action's "${key}"`).toHaveProperty(
        key,
      );
    }
  });

  it("keeps every data field a trigger declares", () => {
    const entry = detail().triggers.thing_happened;

    for (const key of authoredDataKeys(blocks("triggers").thing_happened)) {
      expect(entry, `the listing lost the trigger's "${key}"`).toHaveProperty(
        key,
      );
    }
    expect(entry.handshakeConfiguration).toMatchObject({
      strategy: "HEADER_PRESENT",
    });
  });

  // Agent-targeted atomics sort last in the published listing, so a package
  // piece declaring an audience has to be ordered by the same rule.
  it("orders actions by audience the way the published listing does", () => {
    const result = actionsResult(
      buildDescriptor(AUTHORED, { packageName: PIECE, version: VERSION }),
      PIECE,
      VERSION,
    );

    expect(result.actions.map((action) => action.name)).toEqual([
      "summarise",
      "atomise",
    ]);
    expect(result.actions.map((action) => action.audience)).toEqual([
      "both",
      "ai",
    ]);
  });
});
