import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  Action,
  DocumentModelModule,
  Grant,
  Operation,
  PHBaseState,
  PHDocument,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  AUTH_NO_GRANT_REASON,
  baseCreateDocument,
  createReducer,
  defaultBaseState,
  garbageCollect,
  generateActionId,
  generateId,
  groupDocumentType,
  initializeAuth,
  protocolVersionsFor,
  retract,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IReactor } from "../../src/core/types.js";
import { authGroupsDecisionModel } from "../../src/decision/auth-decision-model.js";
import { evaluateByPosition } from "../../src/decision/evaluation.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import { JobStatus } from "../../src/shared/types.js";
import {
  createBaseReducer3Document,
  createUndoV3ReactorBuilder,
  withBaseReducer3,
} from "../factories.js";
import { signedAs, TRUST_ANY_SIGNER } from "../utils/signed-as.js";

type GroupPHState = PHBaseState & {
  global: { members: string[] };
  local: Record<string, never>;
};

const groupStateReducer: StateReducer<GroupPHState> = (state, action) => {
  const input = action.input as { address: string };
  switch (action.type) {
    case "ADD_MEMBER":
      state.global.members.push(input.address);
      return state;
    case "REMOVE_MEMBER":
      state.global.members = state.global.members.filter(
        (member) => member.toLowerCase() !== input.address.toLowerCase(),
      );
      return state;
    default:
      return state;
  }
};

const groupCreateState = (state?: Partial<GroupPHState>): GroupPHState =>
  ({
    ...defaultBaseState(),
    global: { members: [], ...state?.global },
    local: {},
  }) as GroupPHState;

const fakeGroupModule = {
  version: 1,
  reducer: createReducer<GroupPHState>(groupStateReducer),
  actions: {},
  utils: {
    createDocument: (state?: Partial<GroupPHState>) =>
      baseCreateDocument(groupCreateState, state, groupDocumentType),
  },
  documentModel: {
    global: {
      id: groupDocumentType,
      name: "Reactor Group",
      extension: ".phrg",
      description: "test group model",
      author: { name: "test", website: "" },
      specifications: [],
    },
    local: {},
  },
} as unknown as DocumentModelModule;

const MEMBER = "0xMember";
const ADMIN = "0xAdmin";

function memberAction(type: string): Action {
  return {
    id: generateActionId(),
    type,
    scope: "global",
    timestampUtcMs: new Date().toISOString(),
    input: { address: MEMBER },
  } as Action;
}

function grantsFor(groupId: string): Grant[] {
  return [
    {
      id: "g-admin",
      description: "admin executes everything",
      effect: "allow",
      principal: { address: ADMIN },
      capability: { can: "execute", scope: "*" },
    },
    {
      id: "g-group",
      description: "group executes global",
      effect: "allow",
      principal: { group: groupId },
      capability: { can: "execute", scope: "global" },
    },
  ];
}

function groupDocument(baseReducer: 2 | 3): PHDocument {
  const document = baseCreateDocument(
    groupCreateState,
    undefined,
    groupDocumentType,
    protocolVersionsFor("legacy"),
  );
  return baseReducer === 3 ? withBaseReducer3(document) : document;
}

describe("group membership under RETRACT, in the positional walk", () => {
  const target = { documentId: "doc-1", branch: "main" };

  function at(seconds: number): string {
    return new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
  }

  function op(
    actionId: string,
    type: string,
    scope: string,
    seconds: number,
    index: number,
    input: unknown,
    signerAddress?: string,
  ): Operation {
    return {
      id: `op-${actionId}`,
      index,
      skip: 0,
      hash: "h",
      timestampUtcMs: at(seconds),
      action: {
        id: actionId,
        type,
        scope,
        timestampUtcMs: at(seconds),
        input,
        ...(signerAddress
          ? {
              context: {
                signer: {
                  user: { address: signerAddress, networkId: "", chainId: 0 },
                  app: { name: "test", key: "" },
                  signatures: [],
                },
              },
            }
          : {}),
      },
    } as never as Operation;
  }

  function stores(group: PHDocument, groupOperations: Operation[]) {
    const groupReads: Array<readonly string[] | undefined> = [];
    const operationStore = {
      getSince: (
        documentId: string,
        scope: string,
        _branch: string,
        _revision: number,
        filter?: { actionTypes?: readonly string[] },
      ): Promise<{ results: Operation[] }> => {
        const types = filter?.actionTypes;
        const only = (rows: Operation[]) =>
          types === undefined
            ? rows
            : rows.filter((row) => types.includes(row.action.type));
        if (documentId === "doc-1" && scope === "auth") {
          return Promise.resolve({
            results: only([
              op("init", "INITIALIZE_AUTH", "auth", 1, 0, {
                version: 1,
                grants: grantsFor(group.header.id),
              }),
            ]),
          });
        }
        if (documentId === group.header.id && scope === "global") {
          groupReads.push(types);
          return Promise.resolve({ results: only(groupOperations) });
        }
        return Promise.resolve({ results: [] });
      },
    } as never;

    const writeCache = {
      getState: (documentId: string): Promise<PHDocument> => {
        if (documentId === group.header.id) {
          return Promise.resolve(group);
        }
        return Promise.resolve({
          header: {
            id: documentId,
            documentType: "t",
            revision: {},
            sig: { publicKey: {} },
          },
          state: { document: {}, auth: { version: 0, grants: [] }, global: {} },
          operations: {},
          clipboard: [],
          initialState: {},
        } as never as PHDocument);
      },
    } as never;

    return { stores: { writeCache, operationStore }, groupReads };
  }

  function registry(): DocumentModelRegistry {
    const registry = new DocumentModelRegistry();
    registry.registerModules(fakeGroupModule);
    return registry;
  }

  const add = op("add", "ADD_MEMBER", "global", 2, 0, { address: MEMBER });
  const undo = op("undo", "RETRACT", "global", 4, 1, { target: "add" });
  const redo = op("redo", "RETRACT", "global", 6, 2, { target: "undo" });

  function writes(): Operation[] {
    return [
      op("w1", "SET_STATUS", "global", 3, 0, {}, MEMBER),
      op("w2", "SET_STATUS", "global", 5, 1, {}, MEMBER),
      op("w3", "SET_STATUS", "global", 7, 2, {}, MEMBER),
    ];
  }

  it("leaves a retracted add unapplied and applies it again on redo, on base-reducer 3", async () => {
    const { stores: s, groupReads } = stores(groupDocument(3), [
      add,
      undo,
      redo,
    ]);

    const evaluations = await evaluateByPosition(
      authGroupsDecisionModel(registry()),
      target,
      { scope: "global", operations: writes() },
      s,
    );

    expect(evaluations).toEqual([undefined, AUTH_NO_GRANT_REASON, undefined]);
    expect(groupReads).toEqual([undefined]);
  });

  it("removes a retracted member when a reshuffle's skip sits on a non-membership row", async () => {
    // A backdated SET_NAME rewinds the RETRACT and re-appends it.
    const { stores: s } = stores(groupDocument(3), [
      add,
      undo,
      { ...op("name", "SET_NAME", "global", 3, 2, { name: "n" }), skip: 1 },
      { ...undo, index: 3 },
    ]);

    const evaluations = await evaluateByPosition(
      authGroupsDecisionModel(registry()),
      target,
      {
        scope: "global",
        operations: [op("w", "SET_STATUS", "global", 5, 0, {}, MEMBER)],
      },
      s,
    );

    expect(evaluations).toEqual([AUTH_NO_GRANT_REASON]);
  });

  it("walks a group stream whose membership rows a reshuffle left out of timestamp order", async () => {
    const remove = op("remove", "REMOVE_MEMBER", "global", 3, 1, {
      address: MEMBER,
    });
    const { stores: s } = stores(groupDocument(3), [
      add,
      remove,
      { ...op("name", "SET_NAME", "global", 1, 2, { name: "n" }), skip: 2 },
      { ...add, index: 3 },
      { ...remove, index: 4 },
    ]);

    const evaluations = await evaluateByPosition(
      authGroupsDecisionModel(registry()),
      target,
      {
        scope: "global",
        operations: [op("w", "SET_STATUS", "global", 4, 0, {}, MEMBER)],
      },
      s,
    );

    expect(evaluations).toEqual([AUTH_NO_GRANT_REASON]);
  });

  it("keeps the add when the RETRACT naming it was refused", async () => {
    const { stores: s } = stores(groupDocument(3), [
      add,
      { ...undo, deniedReason: AUTH_NO_GRANT_REASON },
    ]);

    const evaluations = await evaluateByPosition(
      authGroupsDecisionModel(registry()),
      target,
      { scope: "global", operations: writes().slice(0, 2) },
      s,
    );

    expect(evaluations).toEqual([undefined, undefined]);
  });

  it("does not read a RETRACT on a base-reducer 2 group", async () => {
    const { stores: s, groupReads } = stores(groupDocument(2), [
      add,
      undo,
      redo,
    ]);

    const evaluations = await evaluateByPosition(
      authGroupsDecisionModel(registry()),
      target,
      { scope: "global", operations: writes() },
      s,
    );

    expect(evaluations).toEqual([undefined, undefined, undefined]);
    expect(groupReads).toEqual([["ADD_MEMBER", "REMOVE_MEMBER"]]);
  });
});

describe("group membership under RETRACT, through a reactor", () => {
  let reactor: IReactor;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    reactor = await createUndoV3ReactorBuilder({
      featureFlags: {
        documentDecisions: true,
        authEnforcement: true,
        authGroups: true,
      },
      modules: [driveDocumentModelModule, fakeGroupModule],
    })
      .withTrustPolicy(TRUST_ANY_SIGNER)
      .build();
  });

  afterEach(() => {
    reactor.kill();
    vi.useRealTimers();
  });

  function setTime(seconds: number): void {
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)));
  }

  async function settleOn(on: IReactor, jobId: string): Promise<void> {
    await vi.waitUntil(
      async () => {
        const { status } = await on.getJobStatus(jobId);
        return status === JobStatus.FAILED || status === JobStatus.READ_READY;
      },
      { timeout: 10_000 },
    );
    const status = await on.getJobStatus(jobId);
    if (status.status === JobStatus.FAILED) {
      throw new Error(status.error?.message ?? "job failed");
    }
  }

  async function settle(jobId: string): Promise<void> {
    await settleOn(reactor, jobId);
  }

  async function execute(
    documentId: string,
    action: Action,
    on: IReactor = reactor,
  ): Promise<void> {
    await settleOn(on, (await on.execute(documentId, "main", [action])).id);
  }

  async function appliedGlobal(
    documentId: string,
  ): Promise<Array<{ type: string; denied: boolean }>> {
    const result = await reactor.getOperations(documentId, {
      branch: "main",
      scopes: ["global"],
    });
    const stored = (result as Record<string, { results: Operation[] }>).global
      .results;
    return garbageCollect(sortOperations([...stored])).map((operation) => ({
      type: operation.action.type,
      denied: operation.deniedReason !== undefined,
    }));
  }

  /** A base-reducer 3 group, and a document whose policy names it. */
  async function setUp(): Promise<{
    groupId: string;
    targetId: string;
    addId: string;
  }> {
    const group = groupDocument(3);
    const groupId = group.header.id;
    await settle((await reactor.create(group)).id);

    setTime(1);
    const add = memberAction("ADD_MEMBER");
    await execute(groupId, add);

    const targetDoc = createBaseReducer3Document({ signaturePolicy: "legacy" });
    const targetId = targetDoc.header.id;
    await settle((await reactor.create(targetDoc)).id);
    expect(
      (await reactor.get(targetId)).header.protocolVersions?.["base-reducer"],
    ).toBe(3);
    expect(
      (await reactor.get(groupId)).header.protocolVersions?.["base-reducer"],
    ).toBe(3);

    setTime(2);
    await execute(
      targetId,
      initializeAuth({ version: 1, grants: grantsFor(groupId) }),
    );

    return { groupId, targetId, addId: add.id };
  }

  async function memberWrite(targetId: string, id: string) {
    return signedAs(addModule({ id, name: id }), MEMBER, targetId);
  }

  it("refuses a member whose add was retracted, and admits it again on redo", async () => {
    const { groupId, targetId, addId } = await setUp();

    setTime(3);
    await execute(targetId, await memberWrite(targetId, "m1"));

    setTime(4);
    const undo = retract(addId);
    await execute(groupId, undo);

    setTime(5);
    await expect(
      execute(targetId, await memberWrite(targetId, "m2")),
    ).rejects.toThrow(/Authorization denied/);

    setTime(6);
    await execute(groupId, retract(undo.id));

    setTime(7);
    await execute(targetId, await memberWrite(targetId, "m3"));

    expect(await appliedGlobal(targetId)).toEqual([
      { type: "ADD_MODULE", denied: false },
      { type: "ADD_MODULE", denied: false },
    ]);
  });

  // A load is decided by the positional walk, row by row.
  it("leaves a retracted add unapplied when loading the referencing history", async () => {
    const open = await createUndoV3ReactorBuilder({
      modules: [driveDocumentModelModule, fakeGroupModule],
    })
      .withTrustPolicy(TRUST_ANY_SIGNER)
      .build();

    const onOpen = (documentId: string, action: Action) =>
      execute(documentId, action, open);

    async function copy(documentId: string, scopes: string[]): Promise<void> {
      for (const scope of scopes) {
        const page = await open.getOperations(documentId, {
          branch: "main",
          scopes: [scope],
        });
        const rows = (page as Record<string, { results: Operation[] }>)[scope]
          .results;
        await settle((await reactor.load(documentId, "main", rows)).id);
      }
    }

    try {
      const group = groupDocument(3);
      const groupId = group.header.id;
      await settleOn(open, (await open.create(group)).id);
      const targetDoc = createBaseReducer3Document({
        signaturePolicy: "legacy",
      });
      const targetId = targetDoc.header.id;
      await settleOn(open, (await open.create(targetDoc)).id);
      expect(
        (await open.get(targetId)).header.protocolVersions?.["base-reducer"],
      ).toBe(3);
      expect(
        (await open.get(groupId)).header.protocolVersions?.["base-reducer"],
      ).toBe(3);

      setTime(1);
      const add = memberAction("ADD_MEMBER");
      await onOpen(groupId, add);
      setTime(2);
      await onOpen(
        targetId,
        initializeAuth({ version: 1, grants: grantsFor(groupId) }),
      );
      setTime(3);
      await onOpen(targetId, await memberWrite(targetId, "m1"));
      setTime(4);
      const undo = retract(add.id);
      await onOpen(groupId, undo);
      setTime(5);
      await onOpen(targetId, await memberWrite(targetId, "m2"));
      setTime(6);
      await onOpen(groupId, retract(undo.id));
      setTime(7);
      await onOpen(targetId, await memberWrite(targetId, "m3"));

      await copy(groupId, ["document", "global"]);
      await copy(targetId, ["document", "auth", "global"]);

      expect(await appliedGlobal(targetId)).toEqual([
        { type: "ADD_MODULE", denied: false },
        { type: "ADD_MODULE", denied: true },
        { type: "ADD_MODULE", denied: false },
      ]);
    } finally {
      open.kill();
    }
  });

  it("re-evaluates a referencing document on a RETRACT, and again on its redo", async () => {
    const { groupId, targetId, addId } = await setUp();

    setTime(3);
    await execute(targetId, await memberWrite(targetId, "m1"));
    expect(await appliedGlobal(targetId)).toEqual([
      { type: "ADD_MODULE", denied: false },
    ]);

    // A retraction timestamped before the member's write.
    vi.setSystemTime(new Date("2026-01-01T00:00:02.500Z"));
    const undo = retract(addId);
    await execute(groupId, undo);

    await vi.waitUntil(
      async () =>
        (await appliedGlobal(targetId)).some((operation) => operation.denied),
      { timeout: 10_000 },
    );
    expect(await appliedGlobal(targetId)).toEqual([
      { type: "ADD_MODULE", denied: true },
    ]);

    vi.setSystemTime(new Date("2026-01-01T00:00:02.700Z"));
    await execute(groupId, retract(undo.id));

    await vi.waitUntil(
      async () =>
        (await appliedGlobal(targetId)).every((operation) => !operation.denied),
      { timeout: 10_000 },
    );
    expect(await appliedGlobal(targetId)).toEqual([
      { type: "ADD_MODULE", denied: false },
    ]);
  });
});
