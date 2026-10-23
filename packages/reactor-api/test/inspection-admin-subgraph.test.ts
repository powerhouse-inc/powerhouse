import type { IInspectorAdmin } from "@powerhousedao/reactor";
import type * as GraphQL from "graphql";
import type { GraphQLSchema } from "graphql";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { coreSubgraphClasses } from "../src/config.js";
import {
  InspectionAdminSubgraph,
  InspectionSubgraph,
  type IReactorInspectionSource,
} from "../src/graphql/inspection/index.js";
import type { SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import { createSchema } from "../src/utils/create-schema.js";
import { contextFor } from "./utils/read-gate-fixture.js";

// The CommonJS graphql realm, the one @apollo/subgraph builds schemas in.
const { graphql } = createRequire(import.meta.url)("graphql") as typeof GraphQL;

const OPERATOR = "0xOperator";

function levers(): IInspectorAdmin & {
  retryProcessor: ReturnType<typeof vi.fn>;
  rerunProcessor: ReturnType<typeof vi.fn>;
  setCatchUpPriority: ReturnType<typeof vi.fn>;
} {
  const refuse = () => Promise.reject(new Error("not under test"));
  return {
    pauseQueue: refuse,
    resumeQueue: refuse,
    sweepCatchUp: refuse,
    rebuildKeyframes: refuse,
    rebuildSnapshots: refuse,
    retryProcessor: vi.fn().mockResolvedValue(undefined),
    rerunProcessor: vi.fn().mockResolvedValue(undefined),
    setCatchUpPriority: vi.fn().mockResolvedValue(undefined),
  };
}

class QuickAnswer extends InspectionAdminSubgraph {
  protected override answerWindowMs = 20;
}

function buildSchema(admin: IInspectorAdmin): GraphQLSchema {
  const subgraph = new QuickAnswer({
    authorizationService: createAuthorizationService({
      admins: [OPERATOR.toLowerCase()],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    }),
    inspection: { admin } as unknown as IReactorInspectionSource,
  } as unknown as SubgraphArgs);
  return createSchema([], subgraph.resolvers, subgraph.typeDefs);
}

const RERUN = `mutation Rerun($id: String!, $clear: Boolean!, $from: Float!) {
  inspectionRerunProcessor(processorId: $id, clear: $clear, fromOrdinal: $from)
}`;
const RETRY = `mutation Retry($id: String!) { inspectionRetryProcessor(processorId: $id) }`;
const ACCESS = `{ inspectionAdmin { processors catchUpPriority } }`;
const PRIORITY = `mutation Priority($mode: String!, $level: Int) {
  inspectionSetCatchUpPriority(mode: $mode, level: $level)
}`;

describe("inspection-admin subgraph", () => {
  it("refuses every field to a caller the host does not list as an admin", async () => {
    const admin = levers();
    const schema = buildSchema(admin);
    for (const caller of [contextFor(), contextFor("0xsomeone")]) {
      for (const source of [ACCESS, RERUN, RETRY, PRIORITY]) {
        const result = await graphql({
          schema,
          source,
          contextValue: caller,
          variableValues: {
            id: "p",
            clear: false,
            from: 0,
            mode: "fixed",
            level: 7,
          },
        });
        expect(result.errors?.[0]?.extensions.code).toBe("FORBIDDEN");
      }
    }
    expect(admin.rerunProcessor).not.toHaveBeenCalled();
    expect(admin.retryProcessor).not.toHaveBeenCalled();
    expect(admin.setCatchUpPriority).not.toHaveBeenCalled();
  });

  it("pulls the levers for a listed admin, whatever the address's case", async () => {
    const admin = levers();
    const schema = buildSchema(admin);
    const ctx = contextFor(OPERATOR);

    const access = await graphql({ schema, source: ACCESS, contextValue: ctx });
    expect(access.data).toEqual({
      inspectionAdmin: { processors: true, catchUpPriority: true },
    });

    const rerun = await graphql({
      schema,
      source: RERUN,
      contextValue: ctx,
      variableValues: { id: "factory:drive:0", clear: false, from: 12 },
    });
    expect(rerun.errors).toBeUndefined();
    expect(admin.rerunProcessor).toHaveBeenCalledWith("factory:drive:0", {
      clear: false,
      fromOrdinal: 12,
    });

    const retry = await graphql({
      schema,
      source: RETRY,
      contextValue: ctx,
      variableValues: { id: "factory:drive:1" },
    });
    expect(retry.data).toEqual({ inspectionRetryProcessor: true });
    expect(admin.retryProcessor).toHaveBeenCalledWith("factory:drive:1");
  });

  it("sets the catch-up priority for a listed admin", async () => {
    const admin = levers();
    const schema = buildSchema(admin);
    const ctx = contextFor(OPERATOR);

    const fixed = await graphql({
      schema,
      source: PRIORITY,
      contextValue: ctx,
      variableValues: { mode: "fixed", level: 0 },
    });
    expect(fixed.data).toEqual({ inspectionSetCatchUpPriority: true });
    expect(admin.setCatchUpPriority).toHaveBeenLastCalledWith({
      mode: "fixed",
      level: 0,
    });

    const dynamic = await graphql({
      schema,
      source: PRIORITY,
      contextValue: ctx,
      variableValues: { mode: "dynamic" },
    });
    expect(dynamic.errors).toBeUndefined();
    expect(admin.setCatchUpPriority).toHaveBeenLastCalledWith({
      mode: "dynamic",
    });
  });

  it.each([
    [{ mode: "fixed", level: 8 }, "level from 0 to 7"],
    [{ mode: "fixed", level: -1 }, "level from 0 to 7"],
    [{ mode: "fixed" }, "level from 0 to 7"],
    [{ mode: "dynamic", level: 3 }, "takes no level"],
    [{ mode: "turbo", level: 3 }, '"fixed" or "dynamic"'],
  ])("refuses the priority %j as bad input", async (variables, message) => {
    const admin = levers();
    const result = await graphql({
      schema: buildSchema(admin),
      source: PRIORITY,
      contextValue: contextFor(OPERATOR),
      variableValues: variables,
    });
    expect(result.errors?.[0]?.extensions.code).toBe("BAD_USER_INPUT");
    expect(result.errors?.[0]?.message).toContain(message);
    expect(admin.setCatchUpPriority).not.toHaveBeenCalled();
  });

  it("returns a lever's refusal to the admin", async () => {
    const admin = levers();
    admin.rerunProcessor.mockRejectedValue(
      new Error("can replay from ordinal 0 to 3, not 4"),
    );
    const result = await graphql({
      schema: buildSchema(admin),
      source: RERUN,
      contextValue: contextFor(OPERATOR),
      variableValues: { id: "p", clear: false, from: 4 },
    });

    expect(result.errors?.[0]?.message).toBe(
      "can replay from ordinal 0 to 3, not 4",
    );
    expect(result.errors?.[0]?.extensions.code).toBe("LEVER_REFUSED");
  });

  it("answers that a long rerun started, without waiting it out", async () => {
    const admin = levers();
    let finish!: () => void;
    admin.rerunProcessor.mockReturnValue(
      new Promise<void>((resolve) => (finish = resolve)),
    );

    const result = await graphql({
      schema: buildSchema(admin),
      source: RERUN,
      contextValue: contextFor(OPERATOR),
      variableValues: { id: "p", clear: true, from: 0 },
    });

    expect(result.data).toEqual({ inspectionRerunProcessor: true });
    finish();
  });

  it("is not built for a source without levers", () => {
    expect(
      () =>
        new InspectionAdminSubgraph({
          inspection: { admin: undefined },
        } as unknown as SubgraphArgs),
    ).toThrow("did not enable them");
  });

  it("is registered only beside inspection, and only when enabled", () => {
    const registered = (inspection: boolean, inspectionAdmin: boolean) =>
      coreSubgraphClasses({
        inspection,
        inspectionAdmin,
        documentPermissions: false,
      });

    expect(registered(true, true)).toContain(InspectionAdminSubgraph);
    expect(registered(true, false)).not.toContain(InspectionAdminSubgraph);
    expect(registered(false, true)).not.toContain(InspectionAdminSubgraph);
    expect(registered(true, false)).toContain(InspectionSubgraph);
  });
});
