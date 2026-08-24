import type {
  AuthGroups,
  AuthRequest,
  AuthSubject,
  Grant,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  assertAuthAdministrationRetained,
  evaluateCondition,
  evaluateGrantStack,
  MAX_AUTH_GRANTS,
  MAX_CONDITION_DEPTH,
  MAX_CONDITION_NODES,
} from "@powerhousedao/shared/document-model";
import { groupDocumentType } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { bench, describe } from "vitest";
import type { IWriteCache } from "../src/cache/write/interfaces.js";
import {
  BareReadGate,
  ModelReadGate,
  readDecisionModel,
} from "../src/decision/read-gate.js";
import type { IDocumentView } from "../src/storage/interfaces.js";
import { decideAtHead } from "../src/decision/registered-model.js";
import { selectDecisionModel } from "../src/decision/registered-model.js";
import type { DecisionTarget } from "../src/decision/types.js";
import { resolveFeatureFlags } from "../src/core/feature-flags.js";
import { DocumentModelRegistry } from "../src/registry/implementation.js";
import {
  adversarialAdminGrants,
  AUTH_LEVELS,
  BENCH_OUTSIDER_ADDRESS,
  BENCH_WRITER_ADDRESS,
  buildAuthState,
  buildGrants,
  conditionTree,
  flagsFor,
  groupMembers,
  MINIMAL_SHAPE,
  policiedAt,
  type AuthLevel,
  type PolicyShape,
} from "./fixtures/auth-policies.js";

const DOC_ID = "bench-doc";
const DOC_TYPE = "powerhouse/document-model";
const BRANCH = "main";
const TARGET: DecisionTarget = { documentId: DOC_ID, branch: BRANCH };

const WRITER: AuthSubject = { address: BENCH_WRITER_ADDRESS, key: "bench-app" };
const OUTSIDER: AuthSubject = {
  address: BENCH_OUTSIDER_ADDRESS,
  key: "other-app",
};
const EXECUTE_GLOBAL: AuthRequest = {
  verb: "execute",
  scope: "global",
  operation: "SET_MODEL_NAME",
};

function shape(overrides: Partial<PolicyShape>): PolicyShape {
  return { ...MINIMAL_SHAPE, ...overrides };
}

// ---------------------------------------------------------------------------
// Block 1: the policy evaluator, with no reactor and no storage.
//
// This is the only tier that can resolve the grant scan itself. It answers
// whether auth is a CPU cost at all, which decides how to read every wall-clock
// number the coarser tiers produce.
// ---------------------------------------------------------------------------

describe("auth policy evaluation (pure CPU)", () => {
  const oneGrant = buildGrants(shape({ grantCount: 2 }));
  const tenGrants = buildGrants(shape({ grantCount: 10 }));
  const capGrants = buildGrants(shape({ grantCount: MAX_AUTH_GRANTS }));
  const capGrantsMatchFirst = buildGrants(
    shape({ grantCount: MAX_AUTH_GRANTS, matchPosition: "first" }),
  );

  bench("evaluateGrantStack: 2 grants", () => {
    evaluateGrantStack(oneGrant, WRITER, EXECUTE_GLOBAL);
  });

  bench("evaluateGrantStack: 10 grants", () => {
    evaluateGrantStack(tenGrants, WRITER, EXECUTE_GLOBAL);
  });

  bench("evaluateGrantStack: 100 grants (cap), match last", () => {
    evaluateGrantStack(capGrants, WRITER, EXECUTE_GLOBAL);
  });

  // Last-applicable-grant-wins means the scan cannot stop early. Against the
  // match-last case this pair prices what an early exit would have saved.
  bench("evaluateGrantStack: 100 grants (cap), match first", () => {
    evaluateGrantStack(capGrantsMatchFirst, WRITER, EXECUTE_GLOBAL);
  });

  // A denial walks the whole stack too, and is the path a gated deployment
  // takes most often once a policy is real.
  bench("evaluateGrantStack: 100 grants (cap), denied", () => {
    evaluateGrantStack(capGrants, OUTSIDER, EXECUTE_GLOBAL);
  });

  describe("group principals", () => {
    const groupGrants = buildGrants(
      shape({ grantCount: 10, groupIds: ["group-1"] }),
    );
    const smallRoster: AuthGroups = {
      "group-1": { members: groupMembers(10, true) },
    };
    const largeRoster: AuthGroups = {
      "group-1": { members: groupMembers(1000, true) },
    };
    const missingRoster: AuthGroups = {};

    bench("10 grants, group of 10 members", () => {
      evaluateGrantStack(groupGrants, WRITER, EXECUTE_GLOBAL, smallRoster);
    });

    // Membership is a linear scan that lowercases every member it visits.
    bench("10 grants, group of 1000 members", () => {
      evaluateGrantStack(groupGrants, WRITER, EXECUTE_GLOBAL, largeRoster);
    });

    // A group the map does not hold fails closed, which is also the cheapest
    // possible group outcome: the control for the two above.
    bench("10 grants, group absent from the map", () => {
      evaluateGrantStack(groupGrants, WRITER, EXECUTE_GLOBAL, missingRoster);
    });
  });

  describe("conditions", () => {
    const context = { scopeState: { name: "bench" }, actionInput: {} };
    const leafCondition = conditionTree(1, MAX_CONDITION_NODES);
    const wideCondition = conditionTree(2, MAX_CONDITION_NODES);
    const deepCondition = conditionTree(
      MAX_CONDITION_DEPTH,
      MAX_CONDITION_NODES,
    );

    bench("evaluateCondition: single comparison", () => {
      evaluateCondition(leafCondition, WRITER, EXECUTE_GLOBAL, context);
    });

    // `and` and `or` do not short-circuit, so a wide tree pays for every node.
    bench("evaluateCondition: 100 nodes, depth 2", () => {
      evaluateCondition(wideCondition, WRITER, EXECUTE_GLOBAL, context);
    });

    bench("evaluateCondition: max depth 10", () => {
      evaluateCondition(deepCondition, WRITER, EXECUTE_GLOBAL, context);
    });

    // The worst policy the language admits: every grant carries a maximal
    // `where`, so the stack scan multiplies by the condition cost.
    const worstCase = buildGrants(
      shape({ grantCount: MAX_AUTH_GRANTS, where: wideCondition }),
    );

    bench("evaluateGrantStack: 100 grants x 100 condition nodes", () => {
      evaluateGrantStack(
        worstCase,
        WRITER,
        EXECUTE_GLOBAL,
        undefined,
        context,
      );
    });

    // Below authConditions the same policy skips every conditional grant
    // without evaluating it. The delta against the cell above is what the
    // authConditions flag costs at equal policy size.
    bench("evaluateGrantStack: 100 conditional grants, no context", () => {
      evaluateGrantStack(worstCase, WRITER, EXECUTE_GLOBAL);
    });
  });

  // Retention fires on every write to the auth scope. Its cost turns entirely
  // on where administration sits: the search stops at the first candidate grant
  // that still resolves to allow, so a policy administered from the top settles
  // in one scan and one administered from the bottom scans the stack per grant.
  // Both stacks below are installable, so the spread between them is a real
  // range a deployment can land in rather than a synthetic worst case.
  describe("auth scope write validation", () => {
    const tenTop = buildGrants(shape({ grantCount: 10 }));
    const hundredTop = buildGrants(shape({ grantCount: MAX_AUTH_GRANTS }));
    const tenBottom = adversarialAdminGrants(10);
    const hundredBottom = adversarialAdminGrants(MAX_AUTH_GRANTS);

    bench("retention: 10 grants, administered from the top", () => {
      assertAuthAdministrationRetained(
        undefined,
        tenTop,
        tenTop,
        "bench-writer",
      );
    });

    bench("retention: 100 grants, administered from the top", () => {
      assertAuthAdministrationRetained(
        undefined,
        hundredTop,
        hundredTop,
        "bench-writer",
      );
    });

    bench("retention: 10 grants, administered from the bottom", () => {
      assertAuthAdministrationRetained(
        undefined,
        tenBottom,
        tenBottom,
        "bench-sole-admin",
      );
    });

    bench("retention: 100 grants, administered from the bottom", () => {
      assertAuthAdministrationRetained(
        undefined,
        hundredBottom,
        hundredBottom,
        "bench-sole-admin",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Block 2: the admission gate, with storage stubbed.
//
// `decideAtHead` builds the model from whatever the stream reader returns, so a
// stub that answers instantly isolates model assembly and the decision from the
// reads they would otherwise wait on. The read cost itself belongs to the meso
// tier, against a real store.
// ---------------------------------------------------------------------------

type StubbedCache = IWriteCache & { reads: number };

function documentFor(level: AuthLevel, policyShape: PolicyShape): PHDocument {
  const auth = policiedAt(level)
    ? buildAuthState(policyShape)
    : { version: 0, grants: [] };

  return {
    header: {
      protocolVersions: { "base-reducer": 2 },
      id: DOC_ID,
      documentType: DOC_TYPE,
      revision: { document: 1, global: 1, auth: 1 },
    },
    operations: { document: [], global: [], auth: [] },
    state: {
      global: { name: "bench" },
      local: {},
      document: { isDeleted: false, version: 1 },
      auth,
    },
  } as unknown as PHDocument;
}

function groupDocumentFor(groupId: string, memberCount: number): PHDocument {
  return {
    header: {
      protocolVersions: { "base-reducer": 2 },
      id: groupId,
      documentType: groupDocumentType,
      revision: { global: 1 },
    },
    operations: { global: [] },
    state: { global: { members: groupMembers(memberCount, true) } },
  } as unknown as PHDocument;
}

/**
 * A group whose own policy withholds its membership scope.
 *
 * Serving is only consulted when the group's own policy does not already grant
 * the read, so a group left unpoliced short-circuits before the referencer walk
 * and measures nothing. This is the shape that reaches it.
 */
function policiedGroupDocumentFor(
  groupId: string,
  memberCount: number,
): PHDocument {
  const document = groupDocumentFor(groupId, memberCount);
  return {
    ...document,
    header: {
      ...document.header,
      revision: { global: 1, auth: 1, document: 1 },
    },
    operations: { global: [], auth: [], document: [] },
    state: {
      ...document.state,
      auth: buildAuthState(shape({ grantCount: 4 })),
      document: { isDeleted: false, version: 1 },
    },
  } as unknown as PHDocument;
}

/**
 * A stream reader that answers from memory and counts its reads, so a bench can
 * assert the fan-out it believes it is measuring.
 */
function stubCache(main: PHDocument, groups: PHDocument[]): StubbedCache {
  const byId = new Map<string, PHDocument>();
  byId.set(main.header.id, main);
  for (const group of groups) {
    byId.set(group.header.id, group);
  }

  const cache = {
    reads: 0,
    getState(documentId: string): Promise<PHDocument> {
      cache.reads++;
      const document = byId.get(documentId);
      if (document === undefined) {
        return Promise.reject(new Error(`no stub for ${documentId}`));
      }
      return Promise.resolve(document);
    },
    putState() {},
    invalidate() {},
    clear() {},
    startup() {
      return Promise.resolve();
    },
    shutdown() {
      return Promise.resolve();
    },
  } as unknown as StubbedCache;

  return cache;
}

function registryWithDocumentModel(): DocumentModelRegistry {
  const registry = new DocumentModelRegistry();
  registry.registerModules(documentModelDocumentModelModule as never);
  return registry;
}

describe("admission gate vs no-gate baseline (decideAtHead)", () => {
  const registry = registryWithDocumentModel();
  const policyShape = shape({ grantCount: MAX_AUTH_GRANTS });

  // Below authEnforcement the registered model is the document model, which
  // reads no auth scope at all: these two rows are a control showing the gate
  // ignores the policy, not a measurement of the interim in-memory check. That
  // check lives in the executor and is priced by the pure-CPU block above and
  // the end-to-end block below.
  for (const level of AUTH_LEVELS) {
    const flags = resolveFeatureFlags(flagsFor(level));
    const model = selectDecisionModel(flags, registry);
    const document = documentFor(level, policyShape);
    const cache = stubCache(document, []);
    const conditions = flags.authConditions ? { actionInput: {} } : undefined;

    bench(`${level}: 100 grants`, async () => {
      await decideAtHead(
        model,
        cache,
        TARGET,
        WRITER,
        EXECUTE_GLOBAL,
        undefined,
        conditions,
      );
    });
  }

  describe("group fan-out at L3", () => {
    const flags = resolveFeatureFlags(flagsFor("L3_AUTH_GROUPS"));
    const model = selectDecisionModel(flags, registry);

    for (const groupCount of [1, 2, 5]) {
      const groupIds: string[] = [];
      for (let index = 0; index < groupCount; index++) {
        groupIds.push(`group-${index}`);
      }
      const withGroups = shape({ grantCount: 10, groupIds });
      const document = documentFor("L3_AUTH_GROUPS", withGroups);
      const groupDocuments = groupIds.map((id) => groupDocumentFor(id, 50));
      const cache = stubCache(document, groupDocuments);

      bench(`${groupCount} distinct group(s)`, async () => {
        await decideAtHead(model, cache, TARGET, WRITER, EXECUTE_GLOBAL);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Block 3: the read gate.
//
// Reads are gated on the ReactorClient, which runs in the host process. Nothing
// here is absorbed by the executor's worker pool, so this cost lands on the
// event loop that prior baselines already found pinned. The gate is invoked per
// result, so a listing multiplies whatever a single call costs.
// ---------------------------------------------------------------------------

/** A read side that holds nothing, for a gate that should not reach it. */
function emptyDocumentView(): IDocumentView {
  return {
    get(): Promise<never> {
      return Promise.reject(new Error("document not found"));
    },
  } as unknown as IDocumentView;
}

/**
 * A read side whose every document carries a policy that denies the benchmark's
 * outsider. Serving a roster asks each referencer's policy in turn, so denying
 * throughout is what drives the walk to its bound instead of stopping at the
 * first allow.
 *
 * The group itself has to be present too: probing a referencer rebuilds that
 * referencer's model, which reads every group its grants name. A view without
 * the group raises rather than reporting absence, and the whole read fails.
 */
function documentViewDenyingAll(
  referencers: string[],
  group: PHDocument,
): IDocumentView {
  const byId = new Map<string, PHDocument>();
  byId.set(group.header.id, group);
  for (const id of referencers) {
    const document = documentFor(
      "L3_AUTH_GROUPS",
      shape({ grantCount: 10, groupIds: ["group-1"] }),
    );
    byId.set(id, {
      ...document,
      header: { ...document.header, id },
    } as PHDocument);
  }

  return {
    get(documentId: string): Promise<PHDocument> {
      const document = byId.get(documentId);
      return document === undefined
        ? Promise.reject(new Error("document not found"))
        : Promise.resolve(document);
    },
  } as unknown as IDocumentView;
}

/** An operation index that reports a fixed referencer set for any group. */
function groupReferencerIndex(referencers: string[]) {
  return {
    getGroupReferencers(): Promise<string[]> {
      return Promise.resolve(referencers);
    },
  };
}

describe("read gate (scopePredicate)", () => {
  const registry = registryWithDocumentModel();
  const enforcementFlags = resolveFeatureFlags(flagsFor("L2_AUTH_ENFORCEMENT"));
  const groupFlags = resolveFeatureFlags(flagsFor("L3_AUTH_GROUPS"));

  const READ_SCOPES = ["global", "local", "auth", "document"];

  function exercise(predicate: (scope: string) => boolean): void {
    for (const scope of READ_SCOPES) {
      predicate(scope);
    }
  }

  const uninitialized = documentFor("L0_CLEAN", MINIMAL_SHAPE);
  const policied = documentFor(
    "L2_AUTH_ENFORCEMENT",
    shape({ grantCount: MAX_AUTH_GRANTS }),
  );

  // Below authEnforcement reads never build a model: the policy is evaluated on
  // its own, with no I/O at all. This is the baseline every row below is a
  // multiple of.
  const bare = new BareReadGate();

  bench("BareReadGate: policied document", async () => {
    exercise(await bare.scopePredicate(policied, WRITER));
  });

  const modelGate = new ModelReadGate(
    readDecisionModel(enforcementFlags, registry) as never,
    emptyDocumentView(),
    false,
  );

  // An uninitialized policy short-circuits before anything is built. It is the
  // common case on a deployment that has just turned enforcement on, and it is
  // why a benchmark that forgets to install a policy reports auth as free.
  bench("ModelReadGate: uninitialized policy (fast path)", async () => {
    exercise(await modelGate.scopePredicate(uninitialized, WRITER, BRANCH));
  });

  bench("ModelReadGate: 100 grants", async () => {
    exercise(await modelGate.scopePredicate(policied, WRITER, BRANCH));
  });

  bench("ModelReadGate: 100 grants, denied subject", async () => {
    exercise(await modelGate.scopePredicate(policied, OUTSIDER, BRANCH));
  });

  // Reading a group document walks the documents that reference it to decide
  // whether the reader belongs to the policy's audience. The walk is bounded at
  // MAX_EXAMINED_REFERENCERS and runs at a fixed concurrency, so a widely
  // shared roster is the read path's worst case by a wide margin.
  describe("group roster serving", () => {
    const groupDocument = policiedGroupDocumentFor("group-1", 50);

    for (const referencerCount of [1, 10, MAX_AUTH_GRANTS]) {
      const referencers: string[] = [];
      for (let index = 0; index < referencerCount; index++) {
        referencers.push(`referencer-${index}`);
      }

      // Every referencer denies, which is what forces the walk to its bound.
      const gate = new ModelReadGate(
        readDecisionModel(groupFlags, registry) as never,
        documentViewDenyingAll(referencers, groupDocument),
        true,
        groupReferencerIndex(referencers) as never,
      );

      bench(`${referencerCount} referencer(s), reader outside the audience`, async () => {
        exercise(await gate.scopePredicate(groupDocument, OUTSIDER, BRANCH));
      });
    }
  });
});
