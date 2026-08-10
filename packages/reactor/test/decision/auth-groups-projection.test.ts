import type {
  Grant,
  Operation,
  PHAuthState,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  AUTH_NO_GRANT_REASON,
  groupDocumentType,
  groupMembershipActionTypes,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { authGroupsDecisionModel } from "../../src/decision/auth-decision-model.js";
import type { DecisionTarget, StreamQuery } from "../../src/decision/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";

const target: DecisionTarget = { documentId: "doc-1", branch: "main" };

function grant(id: string, principal: Grant["principal"]): Grant {
  return {
    id,
    description: id,
    effect: "allow",
    principal,
    capability: { can: "execute", scope: "global" },
  };
}

function policy(...grants: Grant[]): PHAuthState {
  return { version: 1, grants };
}

const execGlobal = {
  verb: "execute" as const,
  scope: "global",
  operation: "SET_STATUS",
};

function fakeGroupModule() {
  const applied: string[] = [];
  const module = {
    version: 1,
    reducer: (document: PHDocument, action: { type: string }) => {
      applied.push(action.type);
      return {
        ...document,
        state: { ...document.state, global: { members: ["0xfolded"] } },
      } as PHDocument;
    },
    actions: {},
    utils: {},
    documentModel: { global: { id: groupDocumentType } },
  };
  return { module, applied };
}

function registryWith(module?: unknown): IDocumentModelRegistry {
  const registry = new DocumentModelRegistry();
  if (module !== undefined) {
    registry.registerModules(module as never);
  }
  return registry;
}

describe("authGroupsDecisionModel", () => {
  it("derives group queries from the folded grant list, pinning main/global", () => {
    const definition = authGroupsDecisionModel(registryWith())(target);
    const query = definition.projections.groups.query;
    expect(typeof query).toBe("function");

    const queries = (query as (model: unknown) => StreamQuery[])({
      auth: policy(
        grant("g1", { group: "phd-las" }),
        grant("g2", { address: "0x1" }),
        grant("g3", { group: "phd-admins" }),
      ),
    });

    expect(queries).toEqual([
      { documentId: "phd-las", branch: "main", scope: "global" },
      { documentId: "phd-admins", branch: "main", scope: "global" },
    ]);
  });

  it("derives no queries before the auth projection resolves", () => {
    const definition = authGroupsDecisionModel(registryWith())(target);
    const query = definition.projections.groups.query as (
      model: unknown,
    ) => StreamQuery[];
    expect(query({})).toEqual([]);
  });

  it("reads only membership actions from group streams", () => {
    const definition = authGroupsDecisionModel(registryWith())(target);
    expect(definition.projections.groups.decidingActions).toEqual([
      ...groupMembershipActionTypes,
    ]);
  });

  it("allows a group member and denies a non-member", () => {
    const definition = authGroupsDecisionModel(registryWith())(target);
    const model = {
      document: { isDeleted: false },
      auth: policy(grant("g1", { group: "phd-las" })),
      groups: { "phd-las": { members: ["0xAbC1"] } },
    } as never;

    expect(
      definition.decide(model, { address: "0XABC1" }, execGlobal, {
        scopeState: undefined,
      }),
    ).toEqual({ decision: "allow" });

    expect(
      definition.decide(model, { address: "0xother" }, execGlobal, {
        scopeState: undefined,
      }),
    ).toEqual({ decision: "deny", reason: AUTH_NO_GRANT_REASON });
  });

  it("fails closed for a group absent from the model", () => {
    const definition = authGroupsDecisionModel(registryWith())(target);
    const model = {
      document: { isDeleted: false },
      auth: policy(grant("g1", { group: "phd-unheld" })),
      groups: {},
    } as never;

    expect(
      definition.decide(model, { address: "0xabc1" }, execGlobal, {
        scopeState: undefined,
      }),
    ).toEqual({ decision: "deny", reason: AUTH_NO_GRANT_REASON });
  });

  it("folds group operations with the registered group reducer", () => {
    const { module, applied } = fakeGroupModule();
    const definition = authGroupsDecisionModel(registryWith(module))(target);

    const document = { state: { global: { members: [] } } } as never;
    const operation = { action: { type: "ADD_MEMBER" } } as Operation;
    const folded = definition.projections.groups.apply(document, operation);

    expect(applied).toEqual(["ADD_MEMBER"]);
    expect((folded.state as unknown as { global: unknown }).global).toEqual({
      members: ["0xfolded"],
    });
  });

  it("folds nothing when the group model is not registered", () => {
    const definition = authGroupsDecisionModel(registryWith())(target);

    const document = { state: { global: { members: [] } } } as never;
    const operation = { action: { type: "ADD_MEMBER" } } as Operation;
    const folded = definition.projections.groups.apply(document, operation);

    expect(folded).toBe(document);
  });
});
