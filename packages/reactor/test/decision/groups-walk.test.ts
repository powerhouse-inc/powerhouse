import type {
  Grant,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  AUTH_NO_GRANT_REASON,
  groupDocumentType,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { authGroupsDecisionModel } from "../../src/decision/auth-decision-model.js";
import { evaluateByPosition } from "../../src/decision/evaluation.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import { DocumentNotFoundError } from "../../src/shared/errors.js";

const target = { documentId: "doc-1", branch: "main" };

function at(seconds: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
}

function op(
  id: string,
  type: string,
  scope: string,
  seconds: number,
  index: number,
  input: unknown,
  signerAddress?: string,
): Operation {
  return {
    id: `op-${id}`,
    index,
    skip: 0,
    hash: "h",
    timestampUtcMs: at(seconds),
    action: {
      id,
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

const groupGrant: Grant = {
  id: "g-las",
  description: "las executes global",
  effect: "allow",
  principal: { group: "g-1" },
  capability: { can: "execute", scope: "global" },
};

// Keeps the creator-less genesis legal: administration stays reachable.
const adminGrant: Grant = {
  id: "g-admin",
  description: "admin executes everything",
  effect: "allow",
  principal: { address: "0xadmin" },
  capability: { can: "execute", scope: "*" },
};

const initializeAuthOp = op("init", "INITIALIZE_AUTH", "auth", 1, 0, {
  version: 1,
  grants: [adminGrant, groupGrant],
});

const addMemberOp = op("add", "ADD_MEMBER", "global", 2, 0, {
  address: "0xAbC1",
});
const removeMemberOp = op("remove", "REMOVE_MEMBER", "global", 4, 1, {
  address: "0xabc1",
});

function groupRegistry(): DocumentModelRegistry {
  const registry = new DocumentModelRegistry();
  registry.registerModules({
    version: 1,
    reducer: (
      document: PHDocument,
      action: { type: string; input: unknown },
    ) => {
      const state = document.state as unknown as {
        global: { members: string[] };
      };
      const address = (action.input as { address: string }).address;
      const members =
        action.type === "ADD_MEMBER"
          ? [...state.global.members, address]
          : state.global.members.filter(
              (member) => member.toLowerCase() !== address.toLowerCase(),
            );
      return {
        ...document,
        state: { ...state, global: { members } },
      } as never as PHDocument;
    },
    actions: {},
    utils: {},
    documentModel: { global: { id: groupDocumentType } },
  } as never);
  return registry;
}

function baseDoc(documentId: string, state: Record<string, unknown>) {
  return {
    header: {
      id: documentId,
      documentType: "t",
      revision: {},
      sig: { publicKey: {} },
    },
    state,
    operations: {},
    clipboard: [],
    initialState: {},
  } as never as PHDocument;
}

function makeStores(options: { holdGroup: boolean }) {
  const operationStore = {
    getSince: (
      documentId: string,
      scope: string,
    ): Promise<{ results: Operation[] }> => {
      if (documentId === "doc-1" && scope === "auth") {
        return Promise.resolve({ results: [initializeAuthOp] });
      }
      if (documentId === "g-1" && scope === "global") {
        return Promise.resolve({ results: [addMemberOp, removeMemberOp] });
      }
      return Promise.resolve({ results: [] });
    },
  } as never;

  const writeCache = {
    getState: (documentId: string): Promise<PHDocument> => {
      if (documentId === "doc-1") {
        return Promise.resolve(
          baseDoc("doc-1", {
            document: {},
            auth: { version: 0, grants: [] },
            global: {},
          }),
        );
      }
      if (documentId === "g-1" && options.holdGroup) {
        return Promise.resolve(baseDoc("g-1", { global: { members: [] } }));
      }
      return Promise.reject(new DocumentNotFoundError(documentId));
    },
  } as never;

  return { writeCache, operationStore };
}

describe("groups in the positional walk", () => {
  it("judges membership at each operation's position", async () => {
    const evaluations = await evaluateByPosition(
      authGroupsDecisionModel(groupRegistry()),
      target,
      {
        scope: "global",
        operations: [
          // While a member (added at t=2, removed at t=4).
          op("s1", "SET_STATUS", "global", 3, 0, {}, "0xABC1"),
          // After removal.
          op("s2", "SET_STATUS", "global", 5, 1, {}, "0xABC1"),
        ],
      },
      makeStores({ holdGroup: true }),
    );

    expect(evaluations).toEqual([undefined, AUTH_NO_GRANT_REASON]);
  });

  it("fails closed for a group document this replica does not hold", async () => {
    const evaluations = await evaluateByPosition(
      authGroupsDecisionModel(groupRegistry()),
      target,
      {
        scope: "global",
        operations: [op("s1", "SET_STATUS", "global", 3, 0, {}, "0xABC1")],
      },
      makeStores({ holdGroup: false }),
    );

    expect(evaluations).toEqual([AUTH_NO_GRANT_REASON]);
  });

  it("leaves the admin unaffected by group streams", async () => {
    const evaluations = await evaluateByPosition(
      authGroupsDecisionModel(groupRegistry()),
      target,
      {
        scope: "global",
        operations: [op("s1", "SET_STATUS", "global", 5, 0, {}, "0xadmin")],
      },
      makeStores({ holdGroup: true }),
    );

    expect(evaluations).toEqual([undefined]);
  });
});
