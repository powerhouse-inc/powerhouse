import type {
  IInspectorAdmin,
  KeyframeCleanupRun,
  KeyframeReclaim,
} from "@powerhousedao/reactor";
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

const KEYFRAME_RUN: KeyframeCleanupRun = {
  id: "run-1",
  dryRun: true,
  state: "running",
  startedAtUtcMs: 1,
  finishedAtUtcMs: null,
  documentsTotal: 2,
  documentsSeen: 0,
  parked: false,
  totals: {
    streams: 0,
    rows: 0,
    bytes: 0,
    removableRows: 0,
    removableBytes: 0,
    removedRows: 0,
    removedBytes: 0,
  },
  types: [],
  reasons: [],
  topStreams: [],
  error: null,
};

const KEYFRAME_RECLAIM: KeyframeReclaim = {
  state: "unsupported",
  startedAtUtcMs: 1,
  finishedAtUtcMs: 1,
  tableBytesBefore: null,
  tableBytesAfter: null,
  durationMs: null,
  message: "by hand",
};

function levers(): IInspectorAdmin & {
  retryProcessor: ReturnType<typeof vi.fn>;
  rerunProcessor: ReturnType<typeof vi.fn>;
  setCatchUpPriority: ReturnType<typeof vi.fn>;
  startKeyframeCleanup: ReturnType<typeof vi.fn>;
  getKeyframeCleanup: ReturnType<typeof vi.fn>;
  cancelKeyframeCleanup: ReturnType<typeof vi.fn>;
  reclaimKeyframeSpace: ReturnType<typeof vi.fn>;
  getKeyframeReclaim: ReturnType<typeof vi.fn>;
} {
  const refuse = () => Promise.reject(new Error("not under test"));
  return {
    pauseQueue: refuse,
    resumeQueue: refuse,
    sweepCatchUp: refuse,
    rebuildKeyframes: refuse,
    rebuildSnapshots: refuse,
    startKeyframeCleanup: vi.fn().mockResolvedValue(KEYFRAME_RUN),
    getKeyframeCleanup: vi.fn().mockResolvedValue(null),
    cancelKeyframeCleanup: vi.fn().mockResolvedValue(undefined),
    reclaimKeyframeSpace: vi.fn().mockResolvedValue(KEYFRAME_RECLAIM),
    getKeyframeReclaim: vi.fn().mockResolvedValue(null),
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
const ACCESS = `{ inspectionAdmin { processors catchUpPriority keyframes } }`;
const START_CLEANUP = `mutation Start($dryRun: Boolean!) {
  inspectionStartKeyframeCleanup(dryRun: $dryRun) { id dryRun state totals { rows } }
}`;
const CLEANUP = `{ inspectionKeyframeCleanup { id } }`;
const CANCEL_CLEANUP = `mutation { inspectionCancelKeyframeCleanup }`;
const RECLAIM = `mutation { inspectionReclaimKeyframeSpace { state message } }`;
const RECLAIM_STATUS = `{ inspectionKeyframeReclaim { state } }`;
const PRIORITY = `mutation Priority($mode: String!, $level: Int) {
  inspectionSetCatchUpPriority(mode: $mode, level: $level)
}`;

describe("inspection-admin subgraph", () => {
  it("refuses every field to a caller the host does not list as an admin", async () => {
    const admin = levers();
    const schema = buildSchema(admin);
    for (const caller of [contextFor(), contextFor("0xsomeone")]) {
      for (const source of [
        ACCESS,
        RERUN,
        RETRY,
        PRIORITY,
        START_CLEANUP,
        CLEANUP,
        CANCEL_CLEANUP,
        RECLAIM,
        RECLAIM_STATUS,
      ]) {
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
            dryRun: false,
          },
        });
        expect(result.errors?.[0]?.extensions.code).toBe("FORBIDDEN");
      }
    }
    expect(admin.rerunProcessor).not.toHaveBeenCalled();
    expect(admin.retryProcessor).not.toHaveBeenCalled();
    expect(admin.setCatchUpPriority).not.toHaveBeenCalled();
    expect(admin.startKeyframeCleanup).not.toHaveBeenCalled();
    expect(admin.cancelKeyframeCleanup).not.toHaveBeenCalled();
    expect(admin.reclaimKeyframeSpace).not.toHaveBeenCalled();
  });

  it("serves the keyframe levers to a listed admin", async () => {
    const admin = levers();
    const schema = buildSchema(admin);
    const contextValue = contextFor(OPERATOR);

    const started = await graphql({
      schema,
      source: START_CLEANUP,
      contextValue,
      variableValues: { dryRun: true },
    });
    expect(started.errors).toBeUndefined();
    expect(started.data).toEqual({
      inspectionStartKeyframeCleanup: {
        id: "run-1",
        dryRun: true,
        state: "running",
        totals: { rows: 0 },
      },
    });
    expect(admin.startKeyframeCleanup).toHaveBeenCalledWith({ dryRun: true });

    const status = await graphql({ schema, source: CLEANUP, contextValue });
    expect(status.data).toEqual({ inspectionKeyframeCleanup: null });

    const cancelled = await graphql({
      schema,
      source: CANCEL_CLEANUP,
      contextValue,
    });
    expect(cancelled.data).toEqual({ inspectionCancelKeyframeCleanup: true });

    const reclaim = await graphql({ schema, source: RECLAIM, contextValue });
    expect(reclaim.data).toEqual({
      inspectionReclaimKeyframeSpace: {
        state: "unsupported",
        message: "by hand",
      },
    });
  });

  it("answers a refused clean-up as LEVER_REFUSED", async () => {
    const admin = levers();
    admin.startKeyframeCleanup.mockRejectedValue(
      new Error("A keyframe clean-up is already running"),
    );

    const result = await graphql({
      schema: buildSchema(admin),
      source: START_CLEANUP,
      contextValue: contextFor(OPERATOR),
      variableValues: { dryRun: false },
    });

    expect(result.errors?.[0]?.message).toBe(
      "A keyframe clean-up is already running",
    );
    expect(result.errors?.[0]?.extensions.code).toBe("LEVER_REFUSED");
  });

  it("pulls the levers for a listed admin, whatever the address's case", async () => {
    const admin = levers();
    const schema = buildSchema(admin);
    const ctx = contextFor(OPERATOR);

    const access = await graphql({ schema, source: ACCESS, contextValue: ctx });
    expect(access.data).toEqual({
      inspectionAdmin: {
        processors: true,
        catchUpPriority: true,
        keyframes: true,
      },
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
