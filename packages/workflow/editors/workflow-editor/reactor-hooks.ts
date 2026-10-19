// Reactor access over the runtime client: enforcement, sign-in, who runs act
// as, and granting the Switchboard on documents (ADR 0005 §8, §9).
import {
  dispatchActions,
  useDid,
  useReactorClient,
  useRenownAuth,
} from "@powerhousedao/reactor-browser";
import {
  setGrant,
  type Grant,
  type PHAuthState,
} from "@powerhousedao/shared/document-model";
import { useQuery } from "@tanstack/react-query";
import type { ReactorAccessInfo } from "./runtime-client.js";
import { useRuntime } from "./runtime-context.js";
import { runtimeKeys } from "./ui/query-keys.js";
import { signInRequired, type GrantSubject } from "./ui/reactor-access.js";
import { publisherOf, type PublishOperation } from "./ui/reactor-view.js";

// Undefined until the runtime answers, or when it cannot be asked.
export function useReactorAccess(): ReactorAccessInfo | undefined {
  const { client, queryClient } = useRuntime();
  const { address } = useRenownAuth();
  const query = useQuery(
    {
      queryKey: runtimeKeys.reactorAccess(client.url, address ?? null),
      queryFn: () => client.fetchReactorAccess(),
      staleTime: 5 * 60_000,
    },
    queryClient,
  );
  return query.data;
}

export interface SignInGate {
  // Enforcement is on and nobody is signed in.
  required: boolean;
  signedIn: boolean;
  pending: boolean;
  login: () => void;
  access: ReactorAccessInfo | undefined;
  subject: GrantSubject;
}

export function useSignInGate(): SignInGate {
  const access = useReactorAccess();
  const auth = useRenownAuth();
  const did = useDid();
  const signedIn = auth.status === "authorized" && Boolean(auth.address);
  return {
    required: signInRequired(access, signedIn),
    signedIn,
    pending: auth.pending || auth.status === "checking",
    login: () => auth.login(),
    access,
    subject: {
      ...(auth.address ? { address: auth.address } : {}),
      ...(did ? { key: did } : {}),
    },
  };
}

// Each document's auth scope as this Connect holds it; null when it holds
// none. Undefined while loading.
export function useDocumentAuths(
  ids: readonly string[],
): ReadonlyMap<string, PHAuthState | null> | undefined {
  const { client: runtime, queryClient } = useRuntime();
  const reactor = useReactorClient();
  const query = useQuery(
    {
      queryKey: [runtime.url, "documentAuth", [...ids].sort()],
      queryFn: async () =>
        new Map(
          await Promise.all(
            ids.map(async (id): Promise<[string, PHAuthState | null]> => {
              try {
                const document = await reactor!.get(id);
                return [id, document.state.auth];
              } catch {
                return [id, null];
              }
            }),
          ),
        ),
      enabled: ids.length > 0 && Boolean(reactor),
      staleTime: 0,
      gcTime: 0,
    },
    queryClient,
  );
  if (ids.length === 0) return new Map();
  if (!reactor) return new Map(ids.map((id) => [id, null]));
  return query.data;
}

export interface GrantOutcome {
  id: string;
  error?: string;
}

// Adds `grants` to each document's auth scope through Connect's reactor.
export async function grantOnDocuments(
  ids: readonly string[],
  grants: readonly Grant[],
): Promise<GrantOutcome[]> {
  return Promise.all(
    ids.map(async (id): Promise<GrantOutcome> => {
      let failure: string | undefined;
      try {
        const result = await dispatchActions(
          grants.map((grant) => setGrant({ grant })),
          id,
          (errors) => {
            failure = errors[0]?.message ?? "The grant was refused";
          },
        );
        if (!result && !failure) failure = "The grant was not applied";
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
      return failure ? { id, error: failure } : { id };
    }),
  );
}

// Why the runtime would not arm the workflow's reactor access; polled, since
// it follows publishes the runtime sees after the editor does.
export function useReactorAccessDenial(
  workflowId: string | undefined,
  refresh: string,
): string | null {
  const { client, queryClient } = useRuntime();
  const query = useQuery(
    {
      queryKey: [
        ...runtimeKeys.reactorDenial(client.url, workflowId ?? ""),
        refresh,
      ],
      queryFn: () => client.fetchReactorAccessDenial(workflowId!),
      enabled: Boolean(workflowId),
      refetchInterval: 15_000,
      staleTime: 0,
    },
    queryClient,
  );
  return query.data ?? null;
}

// The latest publish's signer, from Connect's copy of the workflow: null for
// an unsigned publish, undefined before the first or while loading.
export function usePublisher(
  workflowId: string | undefined,
  // Only refreshes the answer; undefined looks it up all the same.
  publishedVersion?: number | null,
): { publisher: string | null | undefined; loading: boolean } {
  const { client: runtime, queryClient } = useRuntime();
  const reactor = useReactorClient();
  const query = useQuery(
    {
      queryKey: [runtime.url, "publisher", workflowId, publishedVersion ?? 0],
      queryFn: async () => {
        const operations: PublishOperation[] = [];
        let page = await reactor!.getOperations(
          workflowId!,
          { scopes: ["global"] },
          { actionTypes: ["PUBLISH_WORKFLOW"] },
        );
        for (;;) {
          operations.push(...(page.results as PublishOperation[]));
          if (!page.next || page.results.length === 0) break;
          try {
            page = await page.next();
          } catch {
            // Past the last page.
            break;
          }
        }
        // "" stands for no publish, since undefined isn't cached.
        const found = publisherOf(operations);
        return found === undefined ? "" : found;
      },
      enabled: Boolean(workflowId && reactor),
      staleTime: Infinity,
    },
    queryClient,
  );
  if (query.status === "error") return { publisher: undefined, loading: false };
  if (query.status === "pending") {
    return { publisher: undefined, loading: Boolean(workflowId && reactor) };
  }
  return {
    publisher: query.data === "" ? undefined : query.data,
    loading: false,
  };
}
