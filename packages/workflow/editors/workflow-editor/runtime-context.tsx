// One runtime client and query cache per editor instance. Hooks pass the
// client explicitly, leaving the host's QueryClientProvider alone.
import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createRuntimeClient,
  type RunsScope,
  type RuntimeClient,
  type SecretStat,
} from "./runtime-client.js";
import {
  openIdbCacheStore,
  persistRuntimeQueries,
  type RuntimeCacheStore,
} from "./runtime-persist.js";
import {
  catalogQuery,
  createRuntimeQueryClient,
  pieceActionsQuery,
  pieceTriggersQuery,
  runsQuery,
  secretStatQuery,
} from "./runtime-queries.js";
import {
  PieceSourceProvider,
  type PieceCatalogSource,
} from "./ui/piece-source.js";
import { runtimeKeys } from "./ui/query-keys.js";
import { useWorkflowRuntimeUrl } from "./use-runtime-url.js";

export interface RuntimeContextValue {
  client: RuntimeClient;
  queryClient: QueryClient;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

// The block selector's catalog seam, answered from this editor's cache.
function runtimePieceSource(
  client: RuntimeClient,
  queryClient: QueryClient,
): PieceCatalogSource {
  return {
    loadCatalog: () => queryClient.fetchQuery(catalogQuery(client)),
    reloadCatalog: () =>
      queryClient.fetchQuery({ ...catalogQuery(client), staleTime: 0 }),
    loadActions: (packageName) =>
      queryClient.fetchQuery(pieceActionsQuery(client, packageName)),
    loadTriggers: (packageName) =>
      queryClient.fetchQuery(pieceTriggersQuery(client, packageName)),
    // Uncached: the index answers "indexing" until it is built.
    searchBlocks: (query, limit) => client.searchBlocks(query, limit),
  };
}

export function RuntimeProvider(props: {
  url: string;
  children: ReactNode;
  // The browser cache; defaults to IndexedDB, null turns it off.
  store?: RuntimeCacheStore | null;
}) {
  const { url } = props;
  const [queryClient] = useState(createRuntimeQueryClient);
  const [store] = useState(() =>
    props.store === undefined ? openIdbCacheStore() : props.store,
  );
  const client = useMemo(() => createRuntimeClient(url), [url]);

  useEffect(
    () => persistRuntimeQueries(queryClient, url, store).dispose,
    [queryClient, url, store],
  );

  const value = useMemo(() => ({ client, queryClient }), [client, queryClient]);
  const pieceSource = useMemo(
    () => runtimePieceSource(client, queryClient),
    [client, queryClient],
  );
  return (
    <RuntimeContext.Provider value={value}>
      <PieceSourceProvider value={pieceSource}>
        {props.children}
      </PieceSourceProvider>
    </RuntimeContext.Provider>
  );
}

// Resolves the selected drive's runtime URL and provides a client for it.
export function WorkflowRuntimeProvider(props: { children: ReactNode }) {
  const url = useWorkflowRuntimeUrl();
  return <RuntimeProvider url={url}>{props.children}</RuntimeProvider>;
}

export function useRuntime(): RuntimeContextValue {
  const context = useContext(RuntimeContext);
  if (!context) throw new Error("useRuntime needs a RuntimeProvider");
  return context;
}

export function usePieceCatalog() {
  const { client, queryClient } = useRuntime();
  return useQuery(catalogQuery(client), queryClient);
}

// Polled while `active`; inactive feeds hold no subscription.
export function useRunsQuery(
  scope: RunsScope,
  options: { active?: boolean; pollMs?: number } = {},
) {
  const { client, queryClient } = useRuntime();
  return useQuery(
    {
      ...runsQuery(client, scope),
      enabled: options.active ?? true,
      refetchInterval: options.pollMs ?? false,
    },
    queryClient,
  );
}

// Undefined while the stat loads; null when the ref doesn't resolve.
export function useSecretStat(
  ref: string,
  enabled: boolean,
): SecretStat | null | undefined {
  const { client, queryClient } = useRuntime();
  const query = useQuery(
    { ...secretStatQuery(client, ref), enabled, gcTime: 0 },
    queryClient,
  );
  if (!enabled) return null;
  if (query.status === "pending") return undefined;
  return query.status === "error" ? null : query.data;
}

// Writes that change runtime state, each dropping the queries it affects.
export function useRuntimeActions() {
  const { client, queryClient } = useRuntime();
  return useMemo(() => {
    const invalidate = (queryKey: readonly unknown[]) =>
      void queryClient.invalidateQueries({ queryKey });
    const runsChanged = () => {
      invalidate(runtimeKeys.allRuns(client.url));
      invalidate([client.url, "latestRun"]);
    };
    const secretSaved = (stat: SecretStat) => {
      queryClient.setQueryData(runtimeKeys.secret(client.url, stat.ref), stat);
      return stat;
    };
    return {
      fireWorkflow: (workflowId: string, payload?: unknown) =>
        client.fireWorkflow(workflowId, payload).finally(runsChanged),
      rerunRun: (runId: string) => client.rerunRun(runId).finally(runsChanged),
      createSecret: (value: string, label?: string) =>
        client.createSecret(value, label).then(secretSaved),
      rotateSecret: (ref: string, value: string) =>
        client.rotateSecret(ref, value).then(secretSaved),
      checkConnection: (connectionId: string) =>
        client
          .checkConnection(connectionId)
          .finally(() => invalidate(runtimeKeys.connections(client.url))),
      connectionsChanged: () => invalidate(runtimeKeys.connections(client.url)),
    };
  }, [client, queryClient]);
}
