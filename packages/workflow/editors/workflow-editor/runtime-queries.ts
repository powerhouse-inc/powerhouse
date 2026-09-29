// Query options over a RuntimeClient. Keys come from ui/query-keys, so the
// editor's hooks and these factories address the same cache entries.
import {
  infiniteQueryOptions,
  mutationOptions,
  QueryClient,
  queryOptions,
  useMutation,
} from "@tanstack/react-query";
import type { BlockRef } from "@powerhousedao/pieces-framework/block-type";
import type {
  RunPage,
  RunRecord,
  RunsScope,
  RuntimeClient,
  StepTestResult,
} from "./runtime-client.js";
import { realRuns, TEST_TRIGGER_KIND } from "./run-kinds.js";
import { runtimeKeys, SHARED_STALE_MS } from "./ui/query-keys.js";

export function createRuntimeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // Callers surface failures themselves, with their own retry buttons.
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export const catalogQuery = (client: RuntimeClient) =>
  queryOptions({
    queryKey: runtimeKeys.catalog(client.url),
    queryFn: () => client.fetchPieceCatalog(),
    staleTime: SHARED_STALE_MS,
  });

export const blockFormQuery = (client: RuntimeClient, block: BlockRef) =>
  queryOptions({
    queryKey: runtimeKeys.form(client.url, block),
    queryFn: () => client.getBlockForm(block),
    staleTime: SHARED_STALE_MS,
  });

export const pieceActionsQuery = (client: RuntimeClient, packageName: string) =>
  queryOptions({
    queryKey: runtimeKeys.pieceActions(client.url, packageName),
    queryFn: () => client.fetchPieceActions(packageName),
    staleTime: SHARED_STALE_MS,
  });

export const pieceTriggersQuery = (
  client: RuntimeClient,
  packageName: string,
) =>
  queryOptions({
    queryKey: runtimeKeys.pieceTriggers(client.url, packageName),
    queryFn: () => client.fetchPieceTriggers(packageName),
    staleTime: SHARED_STALE_MS,
  });

// Kept until a test trigger could have changed the sample it derives from.
export const outputTreeQuery = (
  client: RuntimeClient,
  block: BlockRef,
  config: unknown,
) =>
  queryOptions({
    queryKey: runtimeKeys.outputTree(client.url, block, config),
    queryFn: () => client.fetchBlockOutputTree(block, config),
    staleTime: Infinity,
  });

// A given test's sample never changes; the key moves on with lastTest.
export const stepOutputTreeQuery = (
  client: RuntimeClient,
  workflowId: string,
  stepId: string,
  testedAt: string | null,
) =>
  queryOptions({
    queryKey: runtimeKeys.stepOutputTree(
      client.url,
      workflowId,
      stepId,
      testedAt,
    ),
    queryFn: () => client.fetchStepOutputTree(workflowId, stepId),
    staleTime: Infinity,
  });

// Test runs are left out: they belong to the trigger's test, not the history.
const REAL_RUNS = [TEST_TRIGGER_KIND];

export const runsQuery = (client: RuntimeClient, scope: RunsScope) =>
  queryOptions({
    queryKey: runtimeKeys.runs(client.url, scope),
    queryFn: () =>
      client
        .fetchRuns({ ...scope, excludeTriggerKinds: REAL_RUNS })
        .then(realRuns),
    staleTime: 0,
  });

// Tests are left out by the runtime, so the newest row is the latest real run.
export const LATEST_RUN_WINDOW = 1;

// The runs views' listing, a page at a time, without step input and output.
export const runPagesQuery = (client: RuntimeClient, scope: RunsScope) =>
  infiniteQueryOptions({
    queryKey: runtimeKeys.runPages(client.url, scope),
    queryFn: ({ pageParam }) =>
      client.fetchRunsPage(
        { ...scope, excludeTriggerKinds: REAL_RUNS },
        pageParam,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page: RunPage) =>
      page.hasNextPage && page.cursor ? page.cursor : undefined,
    staleTime: 0,
  });

// Pages flattened, once each: a run that starts moves up past a page break.
export function runsOfPages(pages: readonly RunPage[]): RunRecord[] {
  const seen = new Set<string>();
  return realRuns(pages.flatMap((page) => page.items)).filter((run) => {
    if (seen.has(run.id)) return false;
    seen.add(run.id);
    return true;
  });
}

const FINISHED = new Set(["SUCCEEDED", "FAILED"]);

export const runQuery = (client: RuntimeClient, runId: string) =>
  queryOptions({
    queryKey: runtimeKeys.run(client.url, runId),
    queryFn: () => client.fetchRun(runId),
    // A finished run never changes.
    staleTime: (query) =>
      query.state.data && FINISHED.has(query.state.data.status) ? Infinity : 0,
  });

export const connectionsQuery = (client: RuntimeClient) =>
  queryOptions({
    queryKey: runtimeKeys.connections(client.url),
    queryFn: () => client.fetchConnections(),
    staleTime: 0,
  });

export const secretStatQuery = (client: RuntimeClient, ref: string) =>
  queryOptions({
    queryKey: runtimeKeys.secret(client.url, ref),
    queryFn: () => client.fetchSecretStat(ref),
    staleTime: 0,
  });

export interface TestStepVariables {
  workflowId: string;
  stepId: string;
}

// A step test is a new run and a new sample for the output trees.
export const testStepMutation = (
  client: RuntimeClient,
  queryClient: QueryClient,
) =>
  mutationOptions<StepTestResult, Error, TestStepVariables>({
    mutationFn: ({ workflowId, stepId }) => client.testStep(workflowId, stepId),
    onSettled: () =>
      Promise.all(
        [
          runtimeKeys.allRuns(client.url),
          [client.url, "latestRun"],
          runtimeKeys.outputTrees(client.url),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });

export function useTestStep(client: RuntimeClient, queryClient: QueryClient) {
  return useMutation(testStepMutation(client, queryClient), queryClient);
}
