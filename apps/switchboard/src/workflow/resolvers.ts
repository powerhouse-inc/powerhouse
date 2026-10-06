import type {
  Context,
  IAuthorizationService,
} from "@powerhousedao/reactor-api";
import type {
  RunRow,
  StepExecutionRow,
  WorkflowRuntimeService,
} from "@powerhousedao/reactor-workflow";
import {
  GraphQLError,
  Kind,
  type GraphQLResolveInfo,
  type SelectionSetNode,
} from "graphql";

interface FireArgs {
  workflowId: string;
  payload?: unknown;
}

interface PieceArgs {
  packageName: string;
  version?: string | null;
}

type BlockRef = Parameters<WorkflowRuntimeService["blockDescriptor"]>[0];

interface BlockInput {
  pieceName: string;
  pieceVersion: string;
  name: string;
  kind: string;
}

function blockRef(input: BlockInput): BlockRef {
  if (input.kind !== "action" && input.kind !== "trigger") {
    throw new GraphQLError(
      `A block's kind is "action" or "trigger", got "${input.kind}"`,
    );
  }
  return {
    pieceName: input.pieceName,
    pieceVersion: input.pieceVersion,
    name: input.name,
    kind: input.kind,
  };
}

interface RunsArgs {
  workflowId?: string;
  driveId?: string;
  limit?: number;
  excludeTriggerKinds?: string[];
}

interface RunsPageArgs {
  workflowId?: string;
  driveId?: string;
  excludeTriggerKinds?: string[];
  paging?: { limit?: number | null; cursor?: string | null } | null;
}

// A cursor the runtime did not issue is the caller's error, not ours.
async function cursorAware<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof Error && error.name === "InvalidRunCursorError") {
      throw new GraphQLError(error.message, {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    throw error;
  }
}

// Whether a runs query reads any step's input or output, so a listing that
// doesn't can skip those blobs. Fragments count as asking for them.
function selectsStepData(
  selections: readonly SelectionSetNode[],
  path: string[],
): boolean {
  let level = selections;
  for (const name of [...path, "steps"]) {
    const next: SelectionSetNode[] = [];
    for (const set of level) {
      for (const selection of set.selections) {
        if (selection.kind !== Kind.FIELD) return true;
        if (selection.name.value === name && selection.selectionSet) {
          next.push(selection.selectionSet);
        }
      }
    }
    if (next.length === 0) return false;
    level = next;
  }
  return level.some((set) =>
    set.selections.some(
      (selection) =>
        selection.kind !== Kind.FIELD ||
        selection.name.value === "input" ||
        selection.name.value === "output",
    ),
  );
}

// With no resolve info (a direct call) the full shape is served.
function readsStepData(
  info: GraphQLResolveInfo | undefined,
  path: string[],
): boolean {
  if (!info) return true;
  const selections = info.fieldNodes.flatMap((node) =>
    node.selectionSet ? [node.selectionSet] : [],
  );
  return selectsStepData(selections, path);
}

// A secret belongs to the reactor, not to any one document, so writing one is
// an administrator's call — the gate the package mutations already use.
function requireAdmin(
  authorizationService: IAuthorizationService,
  ctx: Context,
): void {
  if (!authorizationService.isSupremeAdmin(ctx.user?.address)) {
    throw new GraphQLError("Admin access required");
  }
}

// The runtime's retryable "not synced here yet", tagged for clients.
async function syncAware<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof Error && error.name === "WorkflowSyncingError") {
      throw new GraphQLError(error.message, {
        extensions: { code: "WORKFLOW_SYNCING", retryable: true },
      });
    }
    throw error;
  }
}

function parseJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function toStepRecord(row: StepExecutionRow) {
  return {
    stepId: row.step_id,
    stepKey: row.step_key,
    pieceName: row.piece_name,
    blockName: row.block_name,
    status: row.status,
    input: parseJson(row.input),
    output: parseJson(row.output),
    port: row.port,
    error: row.error,
    errorName: row.error_name,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    pieceVersion: row.piece_version,
    pieceSource: row.piece_source,
    versionMatch: row.version_match,
    versionNote: row.version_note,
  };
}

function toRunRecord(row: RunRow, steps: StepExecutionRow[]) {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    workflowVersion: row.workflow_version,
    triggerKind: row.trigger_kind,
    triggerPayload: parseJson(row.trigger_payload),
    status: row.status,
    error: row.error,
    errorName: row.error_name,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    rerunOf: row.rerun_of,
    warnings: row.warnings,
    warningNotes: parseJson(row.warning_notes) ?? [],
    steps: steps.map(toStepRecord),
  };
}

export type ReadAssertion = (
  documentId: string,
  ctx: Context,
) => Promise<unknown>;

/** Who the host signs as: the principal a target document must grant. */
export interface ReactorIdentity {
  address: string | null;
  key: string;
}

/** What the editor needs to decide on sign-in and grants (ADR 0005 §8). */
export interface ReactorAccessInfo {
  authEnforcement: boolean;
  authConditions: boolean;
  identity: ReactorIdentity | null;
}

// Strict when the host does not say.
const UNKNOWN_ACCESS: ReactorAccessInfo = {
  authEnforcement: true,
  authConditions: false,
  identity: null,
};

function signedIn(ctx: Context): boolean {
  return Boolean(ctx.user?.address);
}

export interface OAuthRouting {
  // Absolute, or a bare path when the host's public origin is unknown.
  callbackUrl: string;
}

function isAbsolute(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

// The redirect a sign-in uses: the host's own when it knows its origin,
// otherwise the caller's, provided it names this host's callback path.
function redirectUriFor(
  routing: OAuthRouting | undefined,
  requested: string | null | undefined,
): string {
  if (!routing) throw new GraphQLError("This host serves no OAuth2 callback");
  if (isAbsolute(routing.callbackUrl)) return routing.callbackUrl;
  if (!requested) {
    throw new GraphQLError(
      "This host does not know its public URL; pass redirectUri",
    );
  }
  let url: URL;
  try {
    url = new URL(requested);
  } catch {
    throw new GraphQLError(`"${requested}" is not a URL`);
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.pathname !== routing.callbackUrl ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new GraphQLError(
      `redirectUri must be this host's ${routing.callbackUrl}`,
    );
  }
  return url.href;
}

// Only back to the page that asked: its Origin header is the browser's.
function returnUrlFor(
  requested: string | null | undefined,
  ctx: Context,
): string | undefined {
  if (!requested) return undefined;
  const origin = ctx.headers.origin;
  let url: URL | undefined;
  try {
    url = new URL(requested);
  } catch {
    url = undefined;
  }
  if (!url || !origin || url.origin !== origin) {
    throw new GraphQLError("returnUrl must be on the requesting page's origin");
  }
  return url.href;
}

export const getResolvers = (
  runtime: WorkflowRuntimeService,
  authorizationService: IAuthorizationService,
  oauth?: OAuthRouting,
  access: ReactorAccessInfo = UNKNOWN_ACCESS,
  // The subgraph's own read gate; fields that need it refuse without one.
  assertCanRead?: ReadAssertion,
): Record<string, unknown> => {
  return {
    Query: {
      workflowRuntime: () => ({}),
    },
    WorkflowRuntimeQueries: {
      health: () => "ok",
      authEnforcement: () => access.authEnforcement,
      reactorIdentity: (_parent: unknown, _args: unknown, ctx: Context) =>
        signedIn(ctx) ? access.identity : null,
      authConditions: (_parent: unknown, _args: unknown, ctx: Context) =>
        signedIn(ctx) ? access.authConditions : null,
      reactorAccessDenial: async (
        _parent: unknown,
        args: { workflowId: string },
        ctx: Context,
      ) => {
        if (!assertCanRead) throw new GraphQLError("No read check configured");
        await assertCanRead(args.workflowId, ctx);
        return runtime.reactorAccessDenial(args.workflowId) ?? null;
      },
      blockDescriptor: (_parent: unknown, args: { block: BlockInput }) =>
        runtime.blockDescriptor(blockRef(args.block)),
      blockOptions: (
        _parent: unknown,
        args: {
          block: BlockInput;
          propName: string;
          input?: unknown;
          connectionId?: string | null;
          searchValue?: string | null;
          reactorConnectionId?: string | null;
        },
        ctx: Context,
      ) =>
        runtime.blockOptions(
          blockRef(args.block),
          args.propName,
          args.input,
          args.connectionId ?? undefined,
          ctx,
          args.searchValue ?? undefined,
          args.reactorConnectionId ?? undefined,
        ),
      pieceCatalog: () => runtime.pieceCatalog(),
      pieceActions: (_parent: unknown, args: PieceArgs) =>
        runtime.pieceActions(args.packageName, args.version ?? undefined),
      pieceTriggers: (_parent: unknown, args: PieceArgs) =>
        runtime.pieceTriggers(args.packageName, args.version ?? undefined),
      blockOutputTree: (
        _parent: unknown,
        args: { block: BlockInput; config?: unknown },
      ) => runtime.blockOutputTree(blockRef(args.block), args.config),
      stepOutputTree: (
        _parent: unknown,
        args: { workflowId: string; stepId: string },
        ctx: Context,
      ) => runtime.stepOutputTree(args.workflowId, args.stepId, ctx),
      blockResolutions: (
        _parent: unknown,
        args: { workflowId: string },
        ctx: Context,
      ) => runtime.blockResolutions(args.workflowId, ctx),
      pieceDetail: (_parent: unknown, args: PieceArgs) =>
        runtime.pieceDetail(args.packageName, args.version ?? undefined),
      searchBlocks: (
        _parent: unknown,
        args: { query: string; limit?: number | null },
      ) => runtime.searchBlocks(args.query, args.limit ?? undefined),
      connections: (_parent: unknown, _args: unknown, ctx: Context) =>
        runtime.connections(ctx),
      webhookEndpoint: (
        _parent: unknown,
        args: { workflowId: string; driveId?: string | null },
        ctx: Context,
      ) =>
        syncAware(() =>
          runtime.webhookEndpoint(args.workflowId, ctx, {
            driveId: args.driveId ?? undefined,
          }),
        ),
      secret: async (_parent: unknown, args: { ref: string }) => {
        try {
          return await (await runtime.secrets()).stat(args.ref);
        } catch {
          // Unknown or malformed ref reads as "no such secret".
          return null;
        }
      },
      secrets: async () => (await runtime.secrets()).list(),
      oauthRedirectUri: () => oauth?.callbackUrl ?? null,
      oauthAttempt: (_parent: unknown, args: { state: string }, ctx: Context) =>
        runtime.oauthAttempt(args.state, ctx),
      triggerStates: async (_parent: unknown, _args: unknown, ctx: Context) =>
        (await runtime.triggerStates(ctx)).map((row) => ({
          workflowId: row.workflow_id,
          pieceName: row.piece_name,
          triggerName: row.trigger_name,
          status: row.status,
          intervalMs: row.interval_ms,
          nextPollAt: row.next_poll_at,
          lastPollAt: row.last_poll_at,
          lastError: row.last_error,
          consecutiveFailures: row.consecutive_failures,
          nextRenewAt: row.next_renew_at,
          renewError: row.renew_error,
          renewFailures: row.renew_failures,
          pieceVersion: row.piece_version,
          pieceSource: row.piece_source,
          versionMatch: row.version_match,
          versionNote: row.version_note,
        })),
      runs: async (
        _parent: unknown,
        args: RunsArgs,
        ctx: Context,
        info?: GraphQLResolveInfo,
      ) =>
        (
          await runtime.runs(
            { ...args, withStepData: readsStepData(info, []) },
            ctx,
          )
        ).map((record) => toRunRecord(record.row, record.steps)),
      runsPage: async (
        _parent: unknown,
        args: RunsPageArgs,
        ctx: Context,
        info?: GraphQLResolveInfo,
      ) => {
        const { paging, ...scope } = args;
        const page = await cursorAware(() =>
          runtime.runsPage(
            {
              ...scope,
              limit: paging?.limit ?? undefined,
              cursor: paging?.cursor ?? null,
              withStepData: readsStepData(info, ["items"]),
            },
            ctx,
          ),
        );
        return {
          items: page.records.map((record) =>
            toRunRecord(record.row, record.steps),
          ),
          hasNextPage: page.hasNextPage,
          hasPreviousPage: Boolean(paging?.cursor),
          cursor: page.cursor,
        };
      },
      run: async (_parent: unknown, args: { id: string }, ctx: Context) => {
        const record = await runtime.run(args.id, ctx);
        return record ? toRunRecord(record.row, record.steps) : null;
      },
    },
    Mutation: {
      workflowRuntime: () => ({}),
    },
    WorkflowRuntimeMutations: {
      fire: (_parent: unknown, args: FireArgs, ctx: Context) =>
        runtime.fire(args.workflowId, args.payload, "manual", undefined, ctx),
      testTrigger: (
        _parent: unknown,
        args: {
          workflowId: string;
          payload?: unknown;
          timeoutSeconds?: number | null;
          driveId?: string | null;
        },
        ctx: Context,
      ) =>
        syncAware(() =>
          runtime.testTrigger(args.workflowId, ctx, {
            ...(args.payload !== undefined ? { payload: args.payload } : {}),
            ...(typeof args.timeoutSeconds === "number"
              ? { timeoutMs: args.timeoutSeconds * 1000 }
              : {}),
            driveId: args.driveId ?? undefined,
          }),
        ),
      cancelTriggerTest: (
        _parent: unknown,
        args: { workflowId: string },
        ctx: Context,
      ) => runtime.cancelTriggerTestFor(args.workflowId, ctx),
      testStep: (
        _parent: unknown,
        args: { workflowId: string; stepId: string; driveId?: string | null },
        ctx: Context,
      ) =>
        syncAware(() =>
          runtime.testStep(args.workflowId, args.stepId, ctx, {
            driveId: args.driveId ?? undefined,
          }),
        ),
      rerun: (_parent: unknown, args: { runId: string }, ctx: Context) =>
        runtime.rerun(args.runId, ctx),
      createSecret: async (
        _parent: unknown,
        args: { value: string; label?: string | null },
        ctx: Context,
      ) => {
        requireAdmin(authorizationService, ctx);
        return (await runtime.secrets()).create({
          value: args.value,
          label: args.label ?? undefined,
        });
      },
      rotateSecret: async (
        _parent: unknown,
        args: { ref: string; value: string },
        ctx: Context,
      ) => {
        requireAdmin(authorizationService, ctx);
        return (await runtime.secrets()).rotate(args.ref, args.value);
      },
      deleteSecret: async (
        _parent: unknown,
        args: { ref: string },
        ctx: Context,
      ) => {
        requireAdmin(authorizationService, ctx);
        await (await runtime.secrets()).delete(args.ref);
        return true;
      },
      checkConnection: (
        _parent: unknown,
        args: { connectionId: string },
        ctx: Context,
      ) => runtime.checkConnection(args.connectionId, ctx),
      // Signing in mints a secret, so it takes what createSecret takes.
      startOAuth: (
        _parent: unknown,
        args: {
          connectionId: string;
          redirectUri?: string | null;
          returnUrl?: string | null;
        },
        ctx: Context,
      ) => {
        requireAdmin(authorizationService, ctx);
        const returnUrl = returnUrlFor(args.returnUrl, ctx);
        return runtime.startOAuth(args.connectionId, ctx, {
          redirectUri: redirectUriFor(oauth, args.redirectUri),
          ...(returnUrl ? { returnUrl } : {}),
        });
      },
    },
  };
};
