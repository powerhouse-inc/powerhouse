// Query keys for runtime data. Every key starts with the runtime URL (the
// "scope"), so two runtimes never share an entry.
import type { BlockRef } from "@powerhousedao/pieces-framework/block-type";

// A block as a key part: every field, the version included.
export function blockPart(block: BlockRef) {
  return [block.pieceName, block.pieceVersion, block.kind, block.name] as const;
}

// The same, as one string for a Map key.
export function blockRefKey(block: BlockRef): string {
  return blockPart(block).join(" ");
}

export type RuntimeQueryKind =
  | "catalog"
  | "form"
  | "pieceActions"
  | "pieceTriggers"
  | "searchBlocks"
  | "outputTree"
  | "options"
  | "dynamic"
  | "connections"
  | "webhook"
  | "latestRun"
  | "runs"
  | "run"
  | "secret"
  | "blockResolutions"
  | "reactorAccess"
  | "reactorDenial";

export interface ResolverKeyInput {
  block: BlockRef;
  propName: string;
  // Values of the prop's refreshers, in declaration order.
  refreshers: unknown[];
  connectionId?: string | null;
  searchValue?: string | null;
  reactorConnectionId?: string | null;
}

function resolverKey(
  scope: string,
  kind: "options" | "dynamic",
  input: ResolverKeyInput,
) {
  return [
    scope,
    kind,
    blockPart(input.block),
    input.propName,
    input.refreshers,
    input.connectionId ?? null,
    input.searchValue ?? null,
    input.reactorConnectionId ?? null,
  ] as const;
}

export const runtimeKeys = {
  all: (scope: string) => [scope] as const,
  catalog: (scope: string) => [scope, "catalog"] as const,
  form: (scope: string, block: BlockRef) =>
    [scope, "form", blockPart(block)] as const,
  pieceActions: (scope: string, packageName: string) =>
    [scope, "pieceActions", packageName] as const,
  pieceTriggers: (scope: string, packageName: string) =>
    [scope, "pieceTriggers", packageName] as const,
  searchBlocks: (scope: string, query: string, limit: number) =>
    [scope, "searchBlocks", query, limit] as const,
  outputTrees: (scope: string) => [scope, "outputTree"] as const,
  outputTree: (scope: string, block: BlockRef, config: unknown) =>
    [scope, "outputTree", blockPart(block), config ?? {}] as const,
  // Keyed by the test it reads, so a new test is a new entry.
  stepOutputTree: (
    scope: string,
    workflowId: string,
    stepId: string,
    testedAt: string | null,
  ) => [scope, "outputTree", "step", workflowId, stepId, testedAt] as const,
  options: (scope: string, input: ResolverKeyInput) =>
    resolverKey(scope, "options", input),
  dynamic: (scope: string, input: ResolverKeyInput) =>
    resolverKey(scope, "dynamic", input),
  // `filter` tells apart listings a caller narrows, e.g. to one drive.
  connections: (scope: string, filter?: string | null) =>
    filter === undefined
      ? ([scope, "connections"] as const)
      : ([scope, "connections", filter] as const),
  webhook: (scope: string, workflowId: string) =>
    [scope, "webhook", workflowId] as const,
  latestRun: (scope: string, workflowId: string) =>
    [scope, "latestRun", workflowId] as const,
  allRuns: (scope: string) => [scope, "runs"] as const,
  runs: (
    scope: string,
    runsScope: { workflowId?: string; driveId?: string; limit?: number },
  ) =>
    [
      scope,
      "runs",
      {
        workflowId: runsScope.workflowId ?? null,
        driveId: runsScope.driveId ?? null,
        limit: runsScope.limit ?? null,
      },
    ] as const,
  // Under allRuns, so every invalidation of the listing reaches the pages.
  runPages: (
    scope: string,
    runsScope: { workflowId?: string; driveId?: string; limit?: number },
  ) =>
    [
      scope,
      "runs",
      "pages",
      {
        workflowId: runsScope.workflowId ?? null,
        driveId: runsScope.driveId ?? null,
        limit: runsScope.limit ?? null,
      },
    ] as const,
  run: (scope: string, runId: string) => [scope, "run", runId] as const,
  // Per viewer: the identity is only served to a signed-in caller.
  reactorAccess: (scope: string, viewer: string | null) =>
    [scope, "reactorAccess", viewer] as const,
  reactorDenial: (scope: string, workflowId: string) =>
    [scope, "reactorDenial", workflowId] as const,
  secret: (scope: string, ref: string) => [scope, "secret", ref] as const,
  allBlockResolutions: (scope: string, workflowId: string) =>
    [scope, "blockResolutions", workflowId] as const,
  // `blocks` is the draft's, trigger first, so an edit is a new entry.
  blockResolutions: (
    scope: string,
    workflowId: string,
    blocks: readonly BlockRef[],
  ) => [scope, "blockResolutions", workflowId, blocks.map(blockPart)] as const,
};

export function queryKind(key: readonly unknown[]): string | undefined {
  return typeof key[1] === "string" ? key[1] : undefined;
}

// Piece metadata that is the same for every caller of one runtime.
export const SHARED_STALE_MS = 30 * 60_000;
// Resolver answers depend on the caller's connection; kept briefly.
export const RESOLVER_STALE_MS = 5 * 60_000;
