// The step form's runtime seam: a DesignTimeService plus the query cache its
// answers live in, provided by the editor shell (or a test harness).
import {
  keepPreviousData,
  QueryClient,
  useQueries,
  useQuery,
  type Query,
  type QueryKey,
} from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  BlockForm,
  BlockFormProp,
  BlockResolutionView,
  ConnectionSummary,
  DesignTimeService,
  LatestRun,
  StepTestOutcome,
  WebhookEndpoint,
} from "./forms.js";
import { parsePropList } from "./validation.js";
import { isSyncingError } from "../runtime-client.js";
import type { BlockRef } from "./blocks.js";
import {
  blockRefKey,
  RESOLVER_STALE_MS,
  runtimeKeys,
  SHARED_STALE_MS,
  type ResolverKeyInput,
} from "./query-keys.js";

interface DesignTimeContextValue {
  service?: DesignTimeService;
  queryClient: QueryClient;
  // Leads every query key; the runtime URL in the editor.
  scope: string;
}

const DesignTimeContext = createContext<DesignTimeContextValue | null>(null);

export function DesignTimeProvider(props: {
  service?: DesignTimeService;
  queryClient: QueryClient;
  scope: string;
  children: ReactNode;
}) {
  const { service, queryClient, scope } = props;
  const value = useMemo(
    () => ({ service, queryClient, scope }),
    [service, queryClient, scope],
  );
  return (
    <DesignTimeContext.Provider value={value}>
      {props.children}
    </DesignTimeContext.Provider>
  );
}

export function useDesignTime(): DesignTimeService | undefined {
  return useContext(DesignTimeContext)?.service;
}

// Outside a provider nothing loads; the private client only satisfies hooks.
function useDesignTimeScope(): DesignTimeContextValue {
  const context = useContext(DesignTimeContext);
  const [detached] = useState(() =>
    context ? null : { queryClient: new QueryClient(), scope: "" },
  );
  return context ?? detached!;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Null means "no form, fall back to JSON"; a refusal keeps its message.
export function useBlockForm(block: BlockRef): {
  form: BlockForm | null | "loading";
  error?: string;
} {
  const { service, queryClient, scope } = useDesignTimeScope();
  const query = useQuery(
    {
      queryKey: runtimeKeys.form(scope, block),
      queryFn: () => service!.getBlockForm(block),
      enabled: Boolean(service),
      staleTime: SHARED_STALE_MS,
    },
    queryClient,
  );
  if (!service) return { form: null };
  if (query.data !== undefined) return { form: query.data };
  if (query.status === "error") {
    return { form: null, error: messageOf(query.error) };
  }
  return { form: "loading" };
}

function formQuery(service: DesignTimeService, scope: string, block: BlockRef) {
  return {
    queryKey: runtimeKeys.form(scope, block),
    queryFn: () => service.getBlockForm(block),
    staleTime: SHARED_STALE_MS,
  };
}

// Fetches a block's form through the shared cache; null when none loads.
export function useBlockFormLoader(): (
  block: BlockRef,
) => Promise<BlockForm | null> {
  const { service, queryClient, scope } = useDesignTimeScope();
  return useMemo(
    () => async (block: BlockRef) => {
      if (!service) return null;
      try {
        return await queryClient.fetchQuery(formQuery(service, scope, block));
      } catch {
        return null;
      }
    },
    [service, queryClient, scope],
  );
}

// A block's form only if the cache already holds it; never fetches.
export function useCachedBlockForm(): (
  block: BlockRef,
) => BlockForm | null | undefined {
  const { queryClient, scope } = useDesignTimeScope();
  return useMemo(
    () => (block: BlockRef) =>
      queryClient.getQueryData<BlockForm | null>(
        runtimeKeys.form(scope, block),
      ),
    [queryClient, scope],
  );
}

// Warms a block's form, e.g. while its picker row is hovered.
export function useBlockFormPrefetch(): (block: BlockRef) => void {
  const { service, queryClient, scope } = useDesignTimeScope();
  return useMemo(
    () => (block: BlockRef) => {
      if (!service) return;
      void queryClient.prefetchQuery(formQuery(service, scope, block));
    },
    [service, queryClient, scope],
  );
}

// useBlockForm for many blocks at once, keyed by blockRefKey.
export function useBlockForms(
  blocks: readonly BlockRef[],
): ReadonlyMap<string, BlockForm | null | "loading"> {
  const { service, queryClient, scope } = useDesignTimeScope();
  const unique = [
    ...new Map(blocks.map((block) => [blockRefKey(block), block])).values(),
  ];
  const results = useQueries(
    {
      queries: unique.map((block) => ({
        queryKey: runtimeKeys.form(scope, block),
        queryFn: () => service!.getBlockForm(block),
        enabled: Boolean(service),
        staleTime: SHARED_STALE_MS,
      })),
    },
    queryClient,
  );
  const forms = new Map<string, BlockForm | null | "loading">();
  unique.forEach((block, index) => {
    const query = results[index];
    forms.set(
      blockRefKey(block),
      !service
        ? null
        : query.data !== undefined
          ? query.data
          : query.status === "error"
            ? null
            : "loading",
    );
  });
  return forms;
}

// Each block's declared ports, once its form has loaded.
export function useBlockPorts(
  blocks: readonly BlockRef[],
): (block: BlockRef) => readonly string[] | undefined {
  const forms = useBlockForms(blocks);
  return (block) => {
    const form = forms.get(blockRefKey(block));
    return form && form !== "loading" ? form.ports : undefined;
  };
}

export type LoadState<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; result: T }
  | { kind: "error"; message: string };

function keyHash(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// A just-bound reactor connection the runtime doesn't hold yet reads as forbidden.
// A just-made document the Switchboard doesn't hold yet; never a sign-in.
const SYNC_REFUSAL = /forbidden|document\b.*not found|was not found/i;
const SYNC_RETRIES_MAX = 4;

function retryWhileSyncing(input: ResolverKeyInput) {
  if (!input.reactorConnectionId) return {};
  return {
    retry: (failures: number, error: unknown) =>
      failures < SYNC_RETRIES_MAX && SYNC_REFUSAL.test(messageOf(error)),
    retryDelay: 1000,
  };
}

// The first value passes straight through; later changes settle after `ms`.
function useSettled<T>(value: T, ms: number): T {
  const hash = keyHash(value);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });
  const [settled, setSettled] = useState({ hash, value });
  useEffect(() => {
    if (hash === settled.hash) return;
    const timer = setTimeout(
      () => setSettled({ hash, value: latest.current }),
      ms,
    );
    return () => clearTimeout(timer);
  }, [hash, settled.hash, ms]);
  return settled.value;
}

// A DROPDOWN's options or a DYNAMIC prop's fields, cached per resolver key;
// a changed key re-resolves after `debounceMs`. `reload` is the manual retry.
export function useResolvedProp<T>(options: {
  kind: "options" | "dynamic";
  input: ResolverKeyInput;
  load: (() => Promise<unknown>) | undefined;
  parse: (raw: unknown) => T;
  debounceMs: number;
}): { state: LoadState<T>; reload: () => void; syncing: boolean } {
  const { queryClient, scope } = useDesignTimeScope();
  const input = useSettled(options.input, options.debounceMs);
  const loadRef = useRef(options);
  useEffect(() => {
    loadRef.current = options;
  });
  const enabled = Boolean(options.load);
  const query = useQuery(
    {
      queryKey: runtimeKeys[options.kind](scope, input),
      queryFn: async () => {
        const current = loadRef.current;
        if (!current.load) throw new Error("No resolver");
        return current.parse(await current.load());
      },
      enabled,
      staleTime: RESOLVER_STALE_MS,
      ...retryWhileSyncing(input),
    },
    queryClient,
  );
  const reload = () => void query.refetch();
  // Retrying a refusal that reads as a document still syncing.
  const syncing = query.isFetching && query.failureCount > 0;
  if (!enabled) return { state: { kind: "idle" }, reload, syncing: false };
  if (query.isFetching) return { state: { kind: "loading" }, reload, syncing };
  if (query.status === "error") {
    return {
      state: { kind: "error", message: messageOf(query.error) },
      reload,
      syncing,
    };
  }
  if (query.status === "success") {
    return { state: { kind: "ready", result: query.data }, reload, syncing };
  }
  return { state: { kind: "loading" }, reload, syncing };
}

// refreshOnSearch: the resolver re-runs with what the author types, debounced.
// The previous answer stays up until the new one lands.
export function useOptionSearch<T>(options: {
  input: ResolverKeyInput;
  query: string;
  load: ((searchValue: string) => Promise<unknown>) | undefined;
  parse: (raw: unknown) => T;
  debounceMs: number;
}): T | null {
  const { queryClient, scope } = useDesignTimeScope();
  const typed = options.query.trim() === "" ? "" : options.query;
  const settled = useSettled(typed, options.debounceMs);
  const loadRef = useRef(options);
  useEffect(() => {
    loadRef.current = options;
  });
  const query = useQuery(
    {
      queryKey: runtimeKeys.options(scope, {
        ...options.input,
        searchValue: settled,
      }),
      queryFn: async () => {
        const current = loadRef.current;
        if (!current.load) throw new Error("No resolver");
        return current.parse(await current.load(settled));
      },
      enabled: Boolean(options.load) && settled !== "" && typed !== "",
      staleTime: RESOLVER_STALE_MS,
      ...retryWhileSyncing(options.input),
      placeholderData: keepPreviousData,
    },
    queryClient,
  );
  return typed === "" ? null : (query.data ?? null);
}

// DYNAMIC fields already resolved for `input`, straight from the cache.
export function getResolvedDynamicProps(
  queryClient: QueryClient,
  scope: string,
  input: ResolverKeyInput,
): BlockFormProp[] | undefined {
  return queryClient.getQueryData<BlockFormProp[]>(
    runtimeKeys.dynamic(scope, input) as unknown as QueryKey,
  );
}

// Resolves a DYNAMIC prop into the cache the form reads, so the canvas can
// check a step without its panel open.
export function useDynamicPrefetch(): (
  input: ResolverKeyInput,
  config: Record<string, unknown>,
) => void {
  const { service, queryClient, scope } = useDesignTimeScope();
  return useMemo(
    () => (input: ResolverKeyInput, config: Record<string, unknown>) => {
      if (!service) return;
      void queryClient.prefetchQuery({
        queryKey: runtimeKeys.dynamic(scope, input),
        queryFn: () =>
          service
            .loadOptions(
              input.block,
              input.propName,
              config,
              input.connectionId ?? undefined,
              undefined,
              input.reactorConnectionId ?? undefined,
            )
            .then(parsePropList),
        staleTime: RESOLVER_STALE_MS,
        ...retryWhileSyncing(input),
      });
    },
    [service, queryClient, scope],
  );
}

// A cache lookup for DYNAMIC fields, read when the caller asks.
export function useDynamicCache(): (
  input: ResolverKeyInput,
) => BlockFormProp[] | undefined {
  const { queryClient, scope } = useDesignTimeScope();
  return useMemo(
    () => (input: ResolverKeyInput) =>
      getResolvedDynamicProps(queryClient, scope, input),
    [queryClient, scope],
  );
}

// A cache lookup for DYNAMIC fields that re-renders as resolver answers land.
export function useDynamicLookup(): (
  input: ResolverKeyInput,
) => BlockFormProp[] | undefined {
  const { queryClient, scope } = useDesignTimeScope();
  const [version, setVersion] = useState(0);
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== "updated") return;
        const key = (event.query as Query).queryKey;
        if (key[0] === scope && key[1] === "dynamic") setVersion((v) => v + 1);
      }),
    [queryClient, scope],
  );
  // A fresh function per landed answer, so dependents recompute.
  return useMemo(
    () => (input: ResolverKeyInput) =>
      version >= 0
        ? getResolvedDynamicProps(queryClient, scope, input)
        : undefined,
    [queryClient, scope, version],
  );
}

// One journaled run, e.g. the trigger's last test; undefined while unknown.
export function useRunById(
  runId: string | null | undefined,
): LatestRun | null | undefined {
  const { service, queryClient, scope } = useDesignTimeScope();
  const fetchRun = service?.fetchRun;
  const query = useQuery(
    {
      queryKey: runtimeKeys.run(scope, runId ?? ""),
      queryFn: () => fetchRun!(runId!),
      enabled: Boolean(fetchRun && runId),
      staleTime: Infinity,
    },
    queryClient,
  );
  if (!runId) return null;
  return query.data;
}

export type LatestRunState =
  | { kind: "loading" }
  | { kind: "ready"; run: LatestRun | null };

// The workflow's most recent run; null when the service can't say.
export function useLatestRun(enabled = true): LatestRunState | null {
  const { service, queryClient, scope } = useDesignTimeScope();
  const active = enabled && Boolean(service?.latestRun);
  const query = useQuery(
    {
      queryKey: runtimeKeys.latestRun(scope, service?.workflowId ?? ""),
      queryFn: () => service!.latestRun!(),
      enabled: active,
      staleTime: 0,
    },
    queryClient,
  );
  if (!active) return null;
  if (query.status === "pending") return { kind: "loading" };
  return { kind: "ready", run: query.data ?? null };
}

// The runtime already waits for the document; these cover a slower sync.
const SYNC_RETRIES = 5;
const SYNC_RETRY_MS = 2_000;

export type EndpointState =
  | { kind: "loading" }
  | { kind: "syncing" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ready"; endpoint: WebhookEndpoint };

// Never kept: the runtime mints the endpoint on first ask, and `armed`
// follows the workflow's status.
export function useWebhookEndpoint(enabled: boolean): EndpointState {
  const { service, queryClient, scope } = useDesignTimeScope();
  const active = enabled && Boolean(service?.webhookEndpoint);
  const query = useQuery(
    {
      queryKey: runtimeKeys.webhook(scope, service?.workflowId ?? ""),
      queryFn: () => service!.webhookEndpoint!(),
      enabled: active,
      staleTime: 0,
      gcTime: 0,
      // A new workflow may not have reached the runtime yet.
      retry: (failures, error) =>
        isSyncingError(error) && failures < SYNC_RETRIES,
      retryDelay: SYNC_RETRY_MS,
    },
    queryClient,
  );
  if (query.status === "pending" && isSyncingError(query.failureReason)) {
    return { kind: "syncing" };
  }
  if (query.status === "error") {
    return { kind: "error", message: messageOf(query.error) };
  }
  if (query.status === "pending") return { kind: "loading" };
  return query.data
    ? { kind: "ready", endpoint: query.data }
    : { kind: "empty" };
}

// Connection documents for the picker. Never kept: the server scopes the
// listing to the caller.
export function useConnectionList(): {
  connections: ConnectionSummary[];
  refetch: () => void;
  // Drops every connection listing for this runtime.
  invalidate: () => void;
  // Fetches afresh into the cache; creating a connection polls this.
  fetchNow: () => Promise<ConnectionSummary[]>;
} {
  const { service, queryClient, scope } = useDesignTimeScope();
  const list = service?.listConnections;
  const options = {
    queryKey: runtimeKeys.connections(scope, service?.connectionScope ?? null),
    queryFn: () => list!(),
    staleTime: 0,
    gcTime: 0,
  };
  const query = useQuery({ ...options, enabled: Boolean(list) }, queryClient);
  return {
    connections: query.data ?? [],
    refetch: () => {
      if (list) void query.refetch();
    },
    invalidate: () =>
      void queryClient.invalidateQueries({
        queryKey: runtimeKeys.connections(scope),
      }),
    fetchNow: () =>
      list
        ? queryClient.fetchQuery({ ...options, staleTime: 0 })
        : Promise.resolve([]),
  };
}

// A step test is a new run and a new sample for the output trees.
export function useTestStepRunner():
  | ((stepId: string) => Promise<StepTestOutcome>)
  | undefined {
  const { service, queryClient, scope } = useDesignTimeScope();
  const test = service?.testStep;
  if (!test) return undefined;
  return (stepId) =>
    test(stepId).finally(() => {
      for (const queryKey of [
        runtimeKeys.allRuns(scope),
        [scope, "latestRun"],
        runtimeKeys.outputTrees(scope),
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    });
}

// Runs the trigger's test hook; its samples can change the output trees.
export function useTestTrigger(): (() => Promise<unknown>) | undefined {
  const { service, queryClient, scope } = useDesignTimeScope();
  const test = service?.testTrigger;
  if (!test) return undefined;
  return () =>
    test().finally(
      () =>
        void queryClient.invalidateQueries({
          queryKey: runtimeKeys.outputTrees(scope),
        }),
    );
}

class DraftNotSynced extends Error {}

// Retries while the runtime still reads an older draft than the editor holds.
const DRAFT_SYNC_RETRIES = 10;

/**
 * The piece version each draft block runs, trigger first; `blocks` is the
 * draft in that order. Empty outside a runtime, or until the runtime answers.
 */
export function useBlockResolutions(
  workflowId: string,
  blocks: readonly { id: string; block: BlockRef }[],
): BlockResolutionView[] {
  const { service, queryClient, scope } = useDesignTimeScope();
  const fetchResolutions = service?.blockResolutions;
  const expected = blocks.map(
    (entry) => `${entry.id}=${blockRefKey(entry.block)}`,
  );
  const query = useQuery(
    {
      queryKey: runtimeKeys.blockResolutions(
        scope,
        workflowId,
        blocks.map((entry) => entry.block),
      ),
      queryFn: async () => {
        const resolutions = await fetchResolutions!();
        const answered = resolutions.map(
          (resolution) => `${resolution.stepId}=${blockRefKey(resolution)}`,
        );
        if (keyHash(answered) !== keyHash(expected)) {
          throw new DraftNotSynced();
        }
        return resolutions;
      },
      enabled: Boolean(fetchResolutions && workflowId),
      retry: (count, error) =>
        error instanceof DraftNotSynced && count < DRAFT_SYNC_RETRIES,
      retryDelay: 300,
      placeholderData: keepPreviousData,
      staleTime: 0,
    },
    queryClient,
  );
  return query.data ?? EMPTY_RESOLUTIONS;
}

const EMPTY_RESOLUTIONS: BlockResolutionView[] = [];
