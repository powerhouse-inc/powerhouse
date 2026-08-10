import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  Action,
  DocumentModelModule,
  Operation,
  PHBaseState,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  baseCreateDocument,
  createReducer,
  defaultBaseState,
  garbageCollect,
  generateId,
  groupDocumentType,
  initializeAuth,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

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

function action(type: string, scope: string, input: unknown): Action {
  return {
    id: generateId(),
    type,
    scope,
    timestampUtcMs: new Date().toISOString(),
    input,
  } as Action;
}

function signedBy<T extends Action>(anAction: T, address: string): T {
  return {
    ...anAction,
    context: {
      signer: {
        user: { address, networkId: "", chainId: 0 },
        app: { name: "test", key: "" },
        signatures: [],
      },
    },
  };
}

const MEMBER = "0xMember";
const ADMIN = "0xAdmin";

/**
 * The stage-5 exit criterion: a group-gated operation syncs to a replica that
 * does not hold the group document and fails closed there, until the group's
 * history arrives, after which both replicas agree.
 */
describe("group convergence across replicas", () => {
  let origin: IReactor;
  let receiver: IReactor;

  async function build(): Promise<IReactor> {
    return new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
        fakeGroupModule,
      ])
      .withExecutorConfig({
        featureFlags: {
          documentDecisions: true,
          authEnforcement: true,
          authGroups: true,
        },
      })
      .build();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    origin?.kill();
    receiver?.kill();
    vi.useRealTimers();
  });

  async function settle(reactor: IReactor, jobId: string): Promise<void> {
    await vi.waitUntil(async () => {
      const status = await reactor.getJobStatus(jobId);
      return (
        status.status === JobStatus.FAILED ||
        status.status === JobStatus.READ_READY
      );
    });
    const status = await reactor.getJobStatus(jobId);
    if (status.status === JobStatus.FAILED) {
      throw new Error(status.error?.message ?? "job failed");
    }
  }

  async function operations(
    reactor: IReactor,
    documentId: string,
    scope: string,
  ): Promise<Operation[]> {
    const result = await reactor.getOperations(documentId, {
      branch: "main",
      scopes: [scope],
    });
    return (result as Record<string, { results: Operation[] }>)[scope].results;
  }

  async function applied(
    reactor: IReactor,
    documentId: string,
    scope: string,
  ): Promise<Array<{ type: string; denied: boolean; hash: string }>> {
    const stored = await operations(reactor, documentId, scope);
    return garbageCollect(sortOperations([...stored])).map((operation) => ({
      type: operation.action.type,
      denied: operation.deniedReason !== undefined,
      hash: operation.hash,
    }));
  }

  it("fails closed without the group and converges when its history arrives", async () => {
    origin = await build();
    receiver = await build();

    // The origin holds a group with one member.
    const groupDoc = baseCreateDocument(
      groupCreateState,
      undefined,
      groupDocumentType,
    );
    const groupId = groupDoc.header.id;
    await settle(origin, (await origin.create(groupDoc)).id);

    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    await settle(
      origin,
      (
        await origin.execute(groupId, "main", [
          action("ADD_MEMBER", "global", { address: MEMBER }),
        ])
      ).id,
    );

    // A target document whose policy names the group, plus an operation the
    // member is allowed to make.
    const targetDoc = createDocModelDocument({ id: "conv-grouped-doc" });
    const targetId = targetDoc.header.id;
    await settle(origin, (await origin.create(targetDoc)).id);

    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    await settle(
      origin,
      (
        await origin.execute(targetId, "main", [
          initializeAuth({
            version: 1,
            grants: [
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
            ],
          }),
        ])
      ).id,
    );

    vi.setSystemTime(new Date("2026-01-01T00:00:03.000Z"));
    await settle(
      origin,
      (
        await origin.execute(targetId, "main", [
          signedBy(addModule({ id: "m1", name: "m1" }), MEMBER),
        ])
      ).id,
    );

    expect(await applied(origin, targetId, "global")).toMatchObject([
      { type: "ADD_MODULE", denied: false },
    ]);

    // The receiver gets the target document but not the group.
    const targetDocumentOps = await operations(origin, targetId, "document");
    await settle(
      receiver,
      (await receiver.load(targetId, "main", targetDocumentOps)).id,
    );
    const targetAuthOps = await operations(origin, targetId, "auth");
    await settle(
      receiver,
      (await receiver.load(targetId, "main", targetAuthOps)).id,
    );
    const targetGlobalOps = await operations(origin, targetId, "global");
    await settle(
      receiver,
      (await receiver.load(targetId, "main", targetGlobalOps)).id,
    );

    // Without the group's history the member is nobody: fail closed.
    expect(await applied(receiver, targetId, "global")).toMatchObject([
      { type: "ADD_MODULE", denied: true },
    ]);

    // The group's history arrives; the trigger re-evaluates the referencing
    // document and both replicas agree, hashes included.
    const groupDocumentOps = await operations(origin, groupId, "document");
    await settle(
      receiver,
      (await receiver.load(groupId, "main", groupDocumentOps)).id,
    );
    const groupGlobalOps = await operations(origin, groupId, "global");
    await settle(
      receiver,
      (await receiver.load(groupId, "main", groupGlobalOps)).id,
    );

    await vi.waitUntil(
      async () =>
        !(await applied(receiver, targetId, "global")).some(
          (operation) => operation.denied,
        ),
      { timeout: 10_000 },
    );

    expect(await applied(receiver, targetId, "global")).toEqual(
      await applied(origin, targetId, "global"),
    );
  });
});
