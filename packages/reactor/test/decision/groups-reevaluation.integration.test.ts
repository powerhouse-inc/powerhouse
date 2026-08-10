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

/** Just enough of a group model for the reactor to fold membership streams. */
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

describe("group membership re-evaluation across documents", () => {
  let reactor: IReactor;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    reactor = await new ReactorBuilder()
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
  });

  afterEach(() => {
    reactor?.kill();
    vi.useRealTimers();
  });

  async function settle(jobId: string): Promise<void> {
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

  it("a membership removal denies later operations on a referencing document", async () => {
    // The group holds one member.
    const groupDoc = baseCreateDocument(
      groupCreateState,
      undefined,
      groupDocumentType,
    );
    const groupId = groupDoc.header.id;
    await settle((await reactor.create(groupDoc)).id);

    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    await settle(
      (
        await reactor.execute(groupId, "main", [
          action("ADD_MEMBER", "global", { address: MEMBER }),
        ])
      ).id,
    );

    // The target document's policy names the group.
    const targetDoc = createDocModelDocument({ id: "grouped-doc" });
    const targetId = targetDoc.header.id;
    await settle((await reactor.create(targetDoc)).id);

    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    await settle(
      (
        await reactor.execute(targetId, "main", [
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

    // Admitted while the signer is a member.
    vi.setSystemTime(new Date("2026-01-01T00:00:03.000Z"));
    await settle(
      (
        await reactor.execute(targetId, "main", [
          signedBy(addModule({ id: "m1", name: "m1" }), MEMBER),
        ])
      ).id,
    );

    expect(await appliedGlobal(targetId)).toEqual([
      { type: "ADD_MODULE", denied: false },
    ]);

    // A removal timestamped before that operation arrives on the group.
    vi.setSystemTime(new Date("2026-01-01T00:00:02.500Z"));
    await settle(
      (
        await reactor.execute(groupId, "main", [
          action("REMOVE_MEMBER", "global", { address: MEMBER }),
        ])
      ).id,
    );

    // The trigger re-evaluates the referencing document in its own job.
    await vi.waitUntil(
      async () =>
        (await appliedGlobal(targetId)).some((operation) => operation.denied),
      { timeout: 10_000 },
    );

    expect(await appliedGlobal(targetId)).toEqual([
      { type: "ADD_MODULE", denied: true },
    ]);
  });

  it("a removal later than everything referencing it denies nothing", async () => {
    const groupDoc = baseCreateDocument(
      groupCreateState,
      undefined,
      groupDocumentType,
    );
    const groupId = groupDoc.header.id;
    await settle((await reactor.create(groupDoc)).id);

    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    await settle(
      (
        await reactor.execute(groupId, "main", [
          action("ADD_MEMBER", "global", { address: MEMBER }),
        ])
      ).id,
    );

    const targetDoc = createDocModelDocument({ id: "grouped-doc-2" });
    const targetId = targetDoc.header.id;
    await settle((await reactor.create(targetDoc)).id);

    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    await settle(
      (
        await reactor.execute(targetId, "main", [
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
      (
        await reactor.execute(targetId, "main", [
          signedBy(addModule({ id: "m1", name: "m1" }), MEMBER),
        ])
      ).id,
    );

    // The removal sorts after the member's operation, so nothing flips.
    vi.setSystemTime(new Date("2026-01-01T00:00:04.000Z"));
    const removalJob = await reactor.execute(groupId, "main", [
      action("REMOVE_MEMBER", "global", { address: MEMBER }),
    ]);
    await settle(removalJob.id);

    // Give any wrongly-enqueued pass time to run before asserting.
    await new Promise((resolve) => {
      vi.useRealTimers();
      setTimeout(resolve, 250);
    });

    expect(await appliedGlobal(targetId)).toEqual([
      { type: "ADD_MODULE", denied: false },
    ]);
  });
});
