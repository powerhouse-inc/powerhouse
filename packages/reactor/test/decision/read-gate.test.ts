import type {
  Grant,
  PHAuthState,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { resolveFeatureFlags } from "../../src/core/feature-flags.js";
import type { IReadGate } from "../../src/decision/read-gate.js";
import {
  ALWAYS_READABLE_SCOPES,
  BareReadGate,
  ModelReadGate,
  readDecisionModel,
} from "../../src/decision/read-gate.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import type { IDocumentView } from "../../src/storage/interfaces.js";

const RTO = "0xrto";
const OTHER = "0xother";
const MEMBER = "0xmember";

function policy(grants: Grant[]): PHAuthState {
  return { version: 1, grants };
}

const readGlobal = (principal: Grant["principal"]): Grant => ({
  id: "g-read",
  description: "read global",
  effect: "allow",
  principal,
  capability: { can: "read", scope: "global" },
});

/** The spec's g-rto-read: the RTO reads their own statement and nobody else's. */
const rtoReadsOwn: Grant = {
  id: "g-rto-read",
  description: "RTO reads their own statement",
  effect: "allow",
  principal: {
    match: {
      eq: [{ attr: "subject.address" }, { attr: "doc.global.rtoAddress" }],
    },
  },
  capability: { can: "read", scope: "global" },
};

type DocOptions = {
  id?: string;
  documentType?: string;
  auth?: PHAuthState;
  global?: Record<string, unknown>;
  local?: Record<string, unknown>;
};

function doc(options: DocOptions = {}): PHDocument {
  const state: Record<string, unknown> = {
    document: { isDeleted: false },
    auth: options.auth ?? { version: 0, grants: [] },
    global: options.global ?? {},
    local: options.local ?? {},
  };
  return {
    header: {
      id: options.id ?? "doc-1",
      documentType: options.documentType ?? "test/statement",
      branch: "main",
      revision: {},
    },
    state,
    initialState: state,
    operations: {},
    clipboard: [],
  } as unknown as PHDocument;
}

type MockView = IDocumentView & {
  get: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
};

/** Reports absence the way the read side does: a plain Error from `get`. */
function mockView(documents: Record<string, PHDocument> = {}): MockView {
  return {
    get: vi.fn().mockImplementation((documentId: string) => {
      const found = documents[documentId];
      if (!found) {
        return Promise.reject(new Error(`Document not found: ${documentId}`));
      }
      return Promise.resolve(found);
    }),
    exists: vi
      .fn()
      .mockImplementation((ids: string[]) =>
        Promise.resolve(ids.map((id) => documents[id] !== undefined)),
      ),
  } as unknown as MockView;
}

const emptyRegistry = {
  getModule: () => {
    throw new Error("no module registered");
  },
} as unknown as IDocumentModelRegistry;

function flags(partial: Partial<ReactorFeatureFlags>): ReactorFeatureFlags {
  return resolveFeatureFlags(partial);
}

function gate(
  partial: Partial<ReactorFeatureFlags>,
  view: IDocumentView,
  registry: IDocumentModelRegistry = emptyRegistry,
): ModelReadGate {
  const model = readDecisionModel(flags(partial), registry);
  if (!model) {
    throw new Error("expected a model");
  }
  return new ModelReadGate(model, view);
}

const allFlags: Partial<ReactorFeatureFlags> = {
  documentDecisions: true,
  authEnforcement: true,
  authGroups: true,
  authConditions: true,
};

/**
 * Which model reads enforce. Getting this wrong is the one mistake in the read
 * path that widens access rather than narrowing it, because the document-only
 * model ignores the auth scope: a read routed through it allows everything the
 * document is not deleted for.
 */
describe("the model reads enforce", () => {
  it("selects no model below authEnforcement", () => {
    expect(readDecisionModel(flags({}), emptyRegistry)).toBeUndefined();
    expect(
      readDecisionModel(flags({ documentDecisions: true }), emptyRegistry),
    ).toBeUndefined();
  });

  it("selects a model from authEnforcement up", () => {
    for (const partial of [
      { documentDecisions: true, authEnforcement: true },
      { documentDecisions: true, authEnforcement: true, authGroups: true },
      allFlags,
    ]) {
      expect(readDecisionModel(flags(partial), emptyRegistry)).toBeDefined();
    }
  });
});

describe("the bare read gate", () => {
  // Held through the interface, which is how every call site holds it.
  const bareGate: IReadGate = new BareReadGate();

  it("keeps the metadata scopes readable under a deny-all policy", async () => {
    const readable = await bareGate.scopePredicate(
      doc({ auth: policy([]) }),
      { address: OTHER },
      "main",
    );

    expect(readable("auth")).toBe(true);
    expect(readable("document")).toBe(true);
    expect(readable("global")).toBe(false);
  });

  it("never applies a conditional grant, so a match read grant withholds", async () => {
    const readable = await bareGate.scopePredicate(
      doc({ auth: policy([rtoReadsOwn]), global: { rtoAddress: RTO } }),
      { address: RTO },
      "main",
    );

    expect(readable("global")).toBe(false);
  });
});

describe("the model read gate", () => {
  it("serves every scope of an unpoliced document without reading anything", async () => {
    const view = mockView();
    const readable = await gate(allFlags, view).scopePredicate(
      doc(),
      { address: OTHER },
      "main",
    );

    expect(readable("global")).toBe(true);
    expect(readable("local")).toBe(true);
    expect(view.get).not.toHaveBeenCalled();
  });

  it("treats a legacy empty auth scope as unpoliced", async () => {
    const legacy = doc();
    (legacy.state as Record<string, unknown>).auth = {};

    const readable = await gate(allFlags, mockView()).scopePredicate(
      legacy,
      { address: OTHER },
      "main",
    );

    expect(readable("global")).toBe(true);
  });

  /**
   * A version with an empty grant list is a deny-all policy, not an absent one.
   * Keying the fast path on "no grants" would open every one of them.
   */
  it("denies under a policy that carries a version and no grants", async () => {
    const readable = await gate(allFlags, mockView()).scopePredicate(
      doc({ auth: policy([]) }),
      { address: OTHER },
      "main",
    );

    expect(readable("global")).toBe(false);
    expect(readable("auth")).toBe(true);
  });

  it("applies an address read grant", async () => {
    const readable = await gate(allFlags, mockView()).scopePredicate(
      doc({ auth: policy([readGlobal({ address: RTO })]) }),
      { address: RTO },
      "main",
    );
    expect(readable("global")).toBe(true);
    expect(readable("local")).toBe(false);

    const denied = await gate(allFlags, mockView()).scopePredicate(
      doc({ auth: policy([readGlobal({ address: RTO })]) }),
      { address: OTHER },
      "main",
    );
    expect(denied("global")).toBe(false);
  });

  it("keeps the metadata scopes readable under an unsupported policy version", async () => {
    const future: PHAuthState = { version: 99, grants: [] };
    const readable = await gate(allFlags, mockView()).scopePredicate(
      doc({ auth: future }),
      { address: OTHER },
      "main",
    );

    expect(readable("auth")).toBe(true);
    expect(readable("document")).toBe(true);
    expect(readable("global")).toBe(false);
  });

  it("does not let a deletion change a read decision", async () => {
    const deleted = doc({ auth: policy([readGlobal({ address: RTO })]) });
    (deleted.state as Record<string, unknown>).document = {
      isDeleted: true,
      deletedAtUtcIso: "2026-01-01T00:00:00.000Z",
    };

    const readable = await gate(allFlags, mockView()).scopePredicate(
      deleted,
      { address: RTO },
      "main",
    );

    expect(readable("global")).toBe(true);
    expect(readable("document")).toBe(true);
  });

  /** The worked toll statement's read grant, which is the stage's exit test. */
  describe("the RTO's match grant", () => {
    const statement = (rtoAddress: string, id: string) =>
      doc({ id, auth: policy([rtoReadsOwn]), global: { rtoAddress } });

    it("serves the RTO their own statement", async () => {
      const readable = await gate(allFlags, mockView()).scopePredicate(
        statement(RTO, "stmt-1"),
        { address: RTO },
        "main",
      );
      expect(readable("global")).toBe(true);
    });

    it("serves nobody else's", async () => {
      const readable = await gate(allFlags, mockView()).scopePredicate(
        statement(OTHER, "stmt-2"),
        { address: RTO },
        "main",
      );
      expect(readable("global")).toBe(false);
    });

    it("serves nothing to an anonymous subject", async () => {
      const readable = await gate(allFlags, mockView()).scopePredicate(
        statement(RTO, "stmt-1"),
        {},
        "main",
      );
      expect(readable("global")).toBe(false);
    });

    it("withholds while authConditions is off, because a match needs a context", async () => {
      const readable = await gate(
        { documentDecisions: true, authEnforcement: true, authGroups: true },
        mockView(),
      ).scopePredicate(statement(RTO, "stmt-1"), { address: RTO }, "main");
      expect(readable("global")).toBe(false);
    });
  });

  describe("a where clause on a read grant", () => {
    const conditional: Grant = {
      ...readGlobal({ anyone: true }),
      where: { eq: [{ attr: "doc.global.status" }, { lit: "OPEN" }] },
    };

    it("holds while the scope's own state satisfies it", async () => {
      const readable = await gate(allFlags, mockView()).scopePredicate(
        doc({ auth: policy([conditional]), global: { status: "OPEN" } }),
        { address: OTHER },
        "main",
      );
      expect(readable("global")).toBe(true);
    });

    it("stops holding when that state changes", async () => {
      const readable = await gate(allFlags, mockView()).scopePredicate(
        doc({ auth: policy([conditional]), global: { status: "CLOSED" } }),
        { address: OTHER },
        "main",
      );
      expect(readable("global")).toBe(false);
    });

    /**
     * A read carries no action, so a condition naming one can never hold. It
     * must withhold rather than resolve to something.
     */
    it("never holds when it reads the action input", async () => {
      const onInput: Grant = {
        ...readGlobal({ anyone: true }),
        where: { exists: { attr: "action.input.newStatus" } },
      };

      const readable = await gate(allFlags, mockView()).scopePredicate(
        doc({ auth: policy([onInput]) }),
        { address: OTHER },
        "main",
      );
      expect(readable("global")).toBe(false);
    });
  });

  /**
   * Conditions read only the executing scope, so a grant on one scope naming
   * another can never resolve. That holds for a read exactly as it does for an
   * execute, and the gate hands each scope its own state.
   */
  it("resolves a condition against the scope being read", async () => {
    const crossScope: Grant = {
      ...readGlobal({ anyone: true }),
      where: { eq: [{ attr: "doc.local.status" }, { lit: "OPEN" }] },
    };

    const readable = await gate(allFlags, mockView()).scopePredicate(
      doc({ auth: policy([crossScope]), local: { status: "OPEN" } }),
      { address: OTHER },
      "main",
    );

    expect(readable("global")).toBe(false);
  });

  it("fails closed on a group grant whose group this replica does not hold", async () => {
    const view = mockView();
    const readable = await gate(allFlags, view).scopePredicate(
      doc({ auth: policy([readGlobal({ group: "grp-1" })]) }),
      { address: MEMBER },
      "main",
    );

    expect(readable("global")).toBe(false);
    expect(view.get).toHaveBeenCalledWith(
      "grp-1",
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
    );
  });

  /**
   * Failing closed is right for a group this replica does not hold, and wrong
   * for a group it cannot reach right now. Silently denying on a transient
   * failure would make an outage look like a policy.
   */
  it("surfaces a transient failure reading a group rather than denying", async () => {
    const view = mockView();
    view.get.mockRejectedValue(new Error("connection terminated"));
    view.exists.mockResolvedValue([true]);

    await expect(
      gate(allFlags, view).scopePredicate(
        doc({ auth: policy([readGlobal({ group: "grp-1" })]) }),
        { address: MEMBER },
        "main",
      ),
    ).rejects.toThrow("connection terminated");
  });

  it("reads the target's own streams from the document it was handed", async () => {
    const view = mockView();
    await gate(allFlags, view).scopePredicate(
      doc({ auth: policy([readGlobal({ address: RTO })]) }),
      { address: RTO },
      "main",
    );

    expect(view.get).not.toHaveBeenCalled();
  });
});

describe("the always-readable scopes", () => {
  it("are the policy and the document metadata", () => {
    expect([...ALWAYS_READABLE_SCOPES].sort()).toEqual(["auth", "document"]);
  });
});
