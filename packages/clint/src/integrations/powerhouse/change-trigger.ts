/**
 * `createDocumentChangeTrigger` — typed helper that collapses the common
 * "subscribe to document changes, coalesce, load docs, narrow, call onChange"
 * pattern into a single definition.
 *
 * Supports watching one or multiple document types. When `documentId` is
 * provided, loads a single document (wrapped in an array). When omitted,
 * loads all matching documents via `client.find()`.
 *
 * The helper owns subscription setup, per-event filtering by documentType
 * (and optional literal documentId), the pending counter, initial
 * reconcile, document loading, and registry-driven type narrowing. Impl
 * code only writes the `onChange` handler (plus an optional `filter` and
 * an optional `documentId` resolver for impl-specific lookup).
 */
import type { DocumentRegistry, AnyRegistry } from "./types.js";
import type { Trigger, TriggerContext, WorkItem } from "../../core/types.js";

export interface DocumentChangeTriggerOptions<
  R extends DocumentRegistry,
  T extends keyof R & string,
  TConfig = Record<string, unknown>,
  TState extends { pending: number } = { pending: number },
> {
  /** Unique trigger id for logging/routing. */
  id: string;

  /** The document type(s) to watch. Must be key(s) in the registry. */
  documentType: T | T[];

  /**
   * The specific document id (or a function that resolves one from context).
   * When omitted, the helper loads ALL documents of the watched type(s)
   * via `client.find()` and passes the full array to `onChange`.
   *
   * When a function is provided, it's resolved lazily on each poll. Returning
   * `undefined` skips the tick.
   */
  documentId?:
    | string
    | ((
        ctx: TriggerContext<TState, TConfig, R>,
      ) => Promise<string | undefined>);

  /**
   * Fire once on startup before any event arrives — useful for reconciling
   * against the current document state. Default: true.
   */
  initialReconcile?: boolean;

  /**
   * Optional predicate: called per-document after loading, before onChange.
   * Return false to exclude a document from the batch. If all documents
   * are filtered out, onChange is not called.
   */
  filter?: (
    doc: R[T]["document"],
    ctx: TriggerContext<TState, TConfig, R>,
  ) => boolean | Promise<boolean>;

  /**
   * User's change handler. Receives an array of loaded, type-narrowed
   * documents and the full trigger context. Returns a work item for the
   * routine loop to execute (or null to skip).
   */
  onChange: (
    docs: Array<R[T]["document"]>,
    ctx: TriggerContext<TState, TConfig, R>,
  ) => Promise<WorkItem | null>;

  /**
   * Call `onChange` even when zero documents are found. Default: false.
   * Useful for triggers that need to perform work (e.g. bootstrapping from
   * disk) regardless of whether any documents exist yet.
   */
  callOnEmpty?: boolean;

  /**
   * Optional initial state for the trigger's private slot. Defaults to
   * `{ pending: 0 }`. When supplied, the shape MUST include a `pending:
   * number` field — the helper bumps and drains it internally.
   */
  state?: () => TState;
}

/**
 * Build a Trigger that listens for document change events on the event bus,
 * coalesces them, loads matching documents, narrows to the registered type,
 * and hands them to the user's onChange handler.
 *
 * Runtime behavior:
 *  1. `setup()` subscribes to `powerhouse:document:changed`. For each event,
 *     if any documentType matches (and, when `documentId` is a literal
 *     string, the id also matches), bump the pending counter.
 *  2. If `initialReconcile !== false`, `setup()` bumps pending once on
 *     startup so the first poll reconciles without waiting for an event.
 *  3. `poll()` returns null unless pending > 0. When pending > 0:
 *     - If `documentId` is set: load single doc, wrap in `[doc]`
 *     - If `documentId` is omitted: `find()` all docs of matching type(s)
 *     Applies `filter` per-doc, then calls `onChange(docs, ctx)`.
 *  4. pending is reset to 0 at the start of each poll drain — multiple
 *     events within a tick coalesce to one `onChange` call.
 */
export function createDocumentChangeTrigger<
  R extends DocumentRegistry = AnyRegistry,
  T extends keyof R & string = keyof R & string,
  TConfig = Record<string, unknown>,
  TState extends { pending: number } = { pending: number },
>(
  options: DocumentChangeTriggerOptions<R, T, TConfig, TState>,
): Trigger<TState, TConfig, R> {
  const initialReconcile = options.initialReconcile !== false;
  const types: T[] = Array.isArray(options.documentType)
    ? options.documentType
    : [options.documentType];

  return {
    id: options.id,
    type: "condition",
    state: options.state ?? (() => ({ pending: 0 }) as TState),

    async setup(ctx) {
      const log = ctx.context.log;
      const on = ctx.context.on;
      if (!on) {
        log?.debug(
          `[${options.id}] no event bus on CoreContext — poll-only mode`,
        );
        if (initialReconcile) ctx.state.pending = 1;
        return;
      }

      on("powerhouse:document:changed", (payload) => {
        const documents = payload.documents ?? [];
        const matches = documents.some((d) =>
          types.includes(d.header?.documentType as T),
        );
        if (!matches) return;

        if (typeof options.documentId === "string") {
          const ids = documents.map((d) => d.header?.id);
          if (!ids.includes(options.documentId)) return;
        }

        ctx.state.pending += 1;
        log?.debug(
          `[${options.id}] queued change (pending=${ctx.state.pending})`,
        );
      });

      if (initialReconcile) ctx.state.pending = 1;
    },

    async poll(ctx): Promise<WorkItem | null> {
      if (!ctx.state.pending) return null;
      ctx.state.pending = 0;

      const reactor = await ctx.reactor();
      if (!reactor) {
        ctx.context.log?.debug(
          `[${options.id}] no reactor available, skipping`,
        );
        return null;
      }

      let docs: Array<R[T]["document"]>;

      if (options.documentId) {
        // Single-doc path
        const docId =
          typeof options.documentId === "function"
            ? await options.documentId(ctx)
            : options.documentId;
        if (!docId) {
          ctx.context.log?.debug(
            `[${options.id}] no target document id resolved, skipping`,
          );
          return null;
        }
        const doc = await reactor.client.get<T>(docId);
        docs = [doc];
      } else {
        // Multi-doc path: find all matching documents.
        // The native Reactor SearchFilter uses `type` (singular string).
        // ph-clint's TypedReactorClient remaps to `documentTypes` (plural)
        // for type-safety, but the reactor ignores that field at runtime.
        // We pass `type` directly to the underlying IReactorClient.
        const allDocs: Array<R[T]["document"]> = [];
        for (const t of types) {
          const result = await reactor.client.find<T>({ type: t } as Parameters<
            typeof reactor.client.find<T>
          >[0]);
          const found = result?.results ?? [];
          allDocs.push(...(found as Array<R[T]["document"]>));
        }
        docs = allDocs;
        if (docs.length === 0 && !options.callOnEmpty) return null;
      }

      if (options.filter) {
        const filtered: Array<R[T]["document"]> = [];
        for (const doc of docs) {
          if (await options.filter(doc, ctx)) filtered.push(doc);
        }
        if (filtered.length === 0) return null;
        docs = filtered;
      }

      return options.onChange(docs, ctx);
    },
  };
}
