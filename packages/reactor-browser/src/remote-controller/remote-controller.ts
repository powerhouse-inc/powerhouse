import type {
  Action,
  DocumentOperations,
  Operation,
  PHBaseState,
  PHDocument,
  PHDocumentHeader,
} from "@powerhousedao/shared/document-model";
import type { PHDocumentController } from "document-model";
import { ActionTracker } from "./action-tracker.js";
import { RemoteClient } from "./remote-client.js";
import type {
  ConflictStrategy,
  DocumentChangeListener,
  IRemoteClient,
  IRemoteController,
  PropagationMode,
  PushResult,
  RemoteControllerOptions,
  RemoteDocumentChangeEvent,
  RemoteDocumentData,
  RemoteOperation,
  SyncStatus,
  TrackedAction,
} from "./types.js";
import {
  ConflictError,
  buildPulledDocument,
  convertRemoteOperations,
  extractRevisionMap,
  hasRevisionConflict,
  screamingSnakeToCamel,
} from "./utils.js";

/** Extract TState from a PHDocumentController subclass. */
type InferState<C> = C extends PHDocumentController<infer S> ? S : never;

/**
 * Extract action methods from a controller type.
 * These are the dynamically-added methods (not on the base PHDocumentController prototype).
 */
type ActionMethodsOf<C, TRemote> = {
  [K in Exclude<keyof C, keyof PHDocumentController<any>>]: C[K] extends (
    input: infer I,
  ) => unknown
    ? (input: I) => TRemote & ActionMethodsOf<C, TRemote>
    : C[K];
};

/** The full return type: RemoteDocumentController + action methods. */
export type RemoteDocumentControllerWith<C extends PHDocumentController<any>> =
  RemoteDocumentController<C> & ActionMethodsOf<C, RemoteDocumentController<C>>;

/**
 * A controller that wraps a PHDocumentController with remote push/pull capabilities.
 * Composes a local controller and adds GraphQL-based sync with a reactor server.
 */
export class RemoteDocumentController<
  TController extends PHDocumentController<any>,
> implements IRemoteController<InferState<TController>> {
  private inner: TController;
  private readonly remoteClient: IRemoteClient;
  private readonly tracker = new ActionTracker();
  private readonly options: RemoteControllerOptions;
  private documentId: string;
  private remoteRevision: Record<string, number> = {};
  private hasPulled = false;
  private pushScheduled = false;
  private pushQueue: Promise<void> = Promise.resolve();
  private listeners: DocumentChangeListener[] = [];

  private constructor(inner: TController, options: RemoteControllerOptions) {
    this.inner = inner;
    this.options = options;
    this.documentId = options.documentId ?? "";
    this.remoteClient = new RemoteClient(
      options.client,
      options.operationsPageSize,
    );

    this.setupActionInterceptors();
  }

  // --- State access (delegated to inner controller) ---

  get header(): PHDocumentHeader {
    return this.inner.header;
  }

  get state(): InferState<TController> {
    return this.inner.state as InferState<TController>;
  }

  get operations(): DocumentOperations {
    return this.inner.operations;
  }

  get document(): PHDocument<InferState<TController>> {
    return this.inner.document as PHDocument<InferState<TController>>;
  }

  get status(): SyncStatus {
    return {
      pendingActionCount: this.tracker.count,
      connected: this.documentId !== "",
      documentId: this.documentId,
      remoteRevision: { ...this.remoteRevision },
    };
  }

  /** Register a listener for document changes. Returns an unsubscribe function. */
  onChange(listener: DocumentChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(source: RemoteDocumentChangeEvent["source"]): void {
    if (this.listeners.length === 0) return;
    const event: RemoteDocumentChangeEvent = {
      source,
      document: this.document,
    };
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  // --- Remote operations ---

  /** Push all pending actions to remote, then pull latest state. */
  async push(): Promise<PushResult> {
    let tracked = this.tracker.flush();

    if (tracked.length === 0 && this.documentId !== "") {
      // Nothing to push, just pull (reuses the fetched document)
      const remoteDocument = await this.pull();
      return {
        remoteDocument,
        actionCount: 0,
        operations: [],
      };
    }

    try {
      await this.ensureRemoteDocument();

      // Conflict detection: check if remote has changed since last pull
      if (this.options.onConflict && tracked.length > 0) {
        tracked = await this.handleConflicts(tracked, this.options.onConflict);
      }
    } catch (error) {
      // Pre-push failure: restore actions so they can be retried
      this.tracker.restore(tracked);
      throw error;
    }

    let pushedActions: Action[] = [];

    try {
      if (tracked.length > 0) {
        const actions = await this.prepareActionsForPush(tracked);
        pushedActions = actions;

        await this.remoteClient.pushActions(
          this.documentId,
          actions,
          this.options.branch,
        );
      }
    } catch (error) {
      // Push failed: restore actions so they can be retried
      this.tracker.restore(tracked);
      throw error;
    }

    // Pull remote state to reconcile (remote is source of truth).
    // If this fails, actions were already pushed — do NOT restore them.
    const remoteDocument = await this.pull();

    return {
      remoteDocument,
      actionCount: tracked.length,
      operations: pushedActions,
    };
  }

  /** Delete the document on the remote. */
  async delete(propagate?: PropagationMode): Promise<boolean> {
    if (this.documentId === "") {
      throw new Error("Cannot delete: no document ID set");
    }
    const result = await this.remoteClient.deleteDocument(
      this.documentId,
      propagate,
    );
    return result;
  }

  /** Pull latest state from remote, replacing local document. Returns the remote document data. */
  async pull(): Promise<RemoteDocumentData> {
    if (this.documentId === "") {
      throw new Error("Cannot pull: no document ID set");
    }

    const { remoteDoc, operations } = await this.fetchDocumentAndOperations();

    // Get module from inner controller
    const initialDoc = this.inner.module.utils.createDocument();
    const pulledDocument = buildPulledDocument(
      remoteDoc,
      operations,
      initialDoc,
      this.options.branch ?? "main",
    );

    // Recreate inner controller with pulled document
    const ControllerClass = this.inner.constructor as new (
      doc?: PHDocument<PHBaseState>,
    ) => TController;
    this.inner = new ControllerClass(pulledDocument);

    // Re-setup interceptors on the new inner instance
    this.setupActionInterceptors();

    // Clear tracker (remote is source of truth)
    this.tracker.clear();

    // Update remote revision
    this.remoteRevision = extractRevisionMap(remoteDoc.revisionsList);

    this.notifyListeners("pull");

    return remoteDoc;
  }

  // --- Static factories ---

  /**
   * Pull an existing document from remote and create a controller for it.
   */
  static async pull<C extends PHDocumentController<any>>(
    ControllerClass: new (doc?: PHDocument<any>) => C,
    options: RemoteControllerOptions,
  ): Promise<RemoteDocumentControllerWith<C>> {
    // Create a temporary instance to access the module
    const temp = new ControllerClass();
    const remote = new RemoteDocumentController(temp, options);

    if (options.documentId) {
      await remote.pull();
    }

    return remote as RemoteDocumentControllerWith<C>;
  }

  /**
   * Wrap an existing controller instance with remote capabilities.
   * Pending local actions on the inner controller are NOT tracked
   * (only new actions through the remote controller are tracked).
   */
  static from<C extends PHDocumentController<any>>(
    controller: C,
    options: RemoteControllerOptions,
  ): RemoteDocumentControllerWith<C> {
    return new RemoteDocumentController(
      controller,
      options,
    ) as RemoteDocumentControllerWith<C>;
  }

  // --- Private methods ---

  /** Create the document on the remote if it doesn't exist yet. */
  private async ensureRemoteDocument(): Promise<void> {
    if (this.documentId !== "") return;
    const remoteDoc = await this.remoteClient.createEmptyDocument(
      this.inner.header.documentType,
      this.options.parentIdentifier,
    );
    this.documentId = remoteDoc.id;
  }

  /** Set up interceptors for all action methods on the inner controller. */
  private setupActionInterceptors(): void {
    // Get the module's action keys from the inner controller
    const module = (this.inner as Record<string, unknown>)["module"] as {
      actions: Record<string, unknown>;
    };

    for (const actionType in module.actions) {
      // Skip if it's a property on our own class
      if (actionType in RemoteDocumentController.prototype) {
        continue;
      }

      Object.defineProperty(this, actionType, {
        value: (input: unknown) => {
          // Snapshot operation counts per scope BEFORE applying
          const opCountsBefore: Record<string, number> = {};
          for (const scope in this.inner.operations) {
            opCountsBefore[scope] = this.inner.operations[scope].length;
          }

          // Apply locally via inner controller
          (
            this.inner as unknown as Record<string, (input: unknown) => unknown>
          )[actionType](input);

          // Find which scope got the new operation
          const newOp = this.findNewOperation(opCountsBefore);

          // Get prevOp in the SAME scope as the new operation
          const prevOp = newOp
            ? this.getLastOperationInScope(newOp.action.scope, newOp)
            : undefined;
          const prevOpHash = prevOp?.hash ?? "";
          const prevOpIndex = prevOp?.index ?? -1;

          if (!newOp) {
            // Action produced no operation (NOOP) — nothing to track
            return this;
          }

          // Track the action for push
          this.tracker.track(newOp.action, prevOpHash, prevOpIndex);
          this.notifyListeners("action");

          if (this.options.mode === "streaming") {
            this.schedulePush();
          }

          return this;
        },
        enumerable: true,
        configurable: true,
      });
    }
  }

  /**
   * Find the new operation added after applying an action,
   * by comparing current operation counts against a previous snapshot.
   */
  private findNewOperation(
    opCountsBefore: Record<string, number>,
  ): Operation | undefined {
    const ops = this.inner.operations;
    for (const scope in ops) {
      const scopeOps = ops[scope];
      const prevCount = opCountsBefore[scope] ?? 0;
      if (scopeOps.length > prevCount) {
        return scopeOps[scopeOps.length - 1];
      }
    }
    return undefined;
  }

  /**
   * Get the last operation in a specific scope, optionally excluding
   * a given operation (e.g. the one just added).
   */
  private getLastOperationInScope(
    scope: string,
    excludeOp?: Operation,
  ): Operation | undefined {
    const scopeOps = this.inner.operations[scope];
    if (scopeOps.length === 0) return undefined;
    for (let i = scopeOps.length - 1; i >= 0; i--) {
      if (scopeOps[i] !== excludeOp) return scopeOps[i];
    }
    return undefined;
  }

  /**
   * Detect and handle conflicts between local pending actions and remote state.
   * Returns the (possibly rebased) tracked actions to push.
   */
  private async handleConflicts(
    localTracked: TrackedAction[],
    strategy: ConflictStrategy,
  ): Promise<TrackedAction[]> {
    // Fetch current remote document to get latest revisions
    const remoteResult = await this.remoteClient.getDocument(
      this.documentId,
      this.options.branch,
    );
    if (!remoteResult) {
      throw new Error(`Document "${this.documentId}" not found on remote`);
    }

    const currentRevision = extractRevisionMap(
      remoteResult.document.revisionsList,
    );

    // Only check scopes that local actions touch
    const localScopes = new Set(localTracked.map((t) => t.action.scope));

    if (
      !hasRevisionConflict(currentRevision, this.remoteRevision, localScopes)
    ) {
      return localTracked;
    }

    // Fetch new remote operations for conflicting scopes in parallel,
    // using the correct sinceRevision for each scope.
    const conflictingScopes = [...localScopes].filter(
      (scope) =>
        (currentRevision[scope] ?? 0) > (this.remoteRevision[scope] ?? 0),
    );
    const { operationsByScope } = await this.remoteClient.getAllOperations(
      this.documentId,
      this.options.branch,
      this.remoteRevision,
      conflictingScopes,
    );
    const remoteOperations: Record<string, RemoteOperation[]> = {};
    for (const [scope, ops] of Object.entries(operationsByScope)) {
      remoteOperations[scope] = ops;
    }

    const conflictInfo = {
      remoteOperations,
      localActions: localTracked,
      knownRevision: { ...this.remoteRevision },
      currentRevision: { ...currentRevision },
    };

    if (strategy === "reject") {
      throw new ConflictError(conflictInfo);
    }

    if (strategy === "rebase") {
      return this.pullAndReplay(localTracked.map((t) => t.action));
    }

    // Custom merge handler (only possibility left after narrowing)
    const mergedActions = await strategy(conflictInfo);
    return this.pullAndReplay(mergedActions);
  }

  /**
   * Pull latest remote state and replay actions through interceptors.
   * Returns newly tracked actions with correct prevOpHash values.
   */
  private async pullAndReplay(actions: Action[]): Promise<TrackedAction[]> {
    await this.pull();

    for (const action of actions) {
      // Action types are SCREAMING_SNAKE_CASE but interceptors use camelCase
      const methodName = screamingSnakeToCamel(action.type);
      const method = (
        this as unknown as Record<string, (input: unknown) => unknown>
      )[methodName];
      if (typeof method === "function") {
        method.call(this, action.input);
      }
    }

    return this.tracker.flush();
  }

  /** Prepare actions for push, optionally signing them. */
  private async prepareActionsForPush(
    tracked: { action: Action; prevOpHash: string; prevOpIndex: number }[],
  ) {
    const actions: Action[] = [];

    for (const { action, prevOpHash, prevOpIndex } of tracked) {
      let prepared: Action = {
        ...action,
        context: {
          ...action.context,
          prevOpHash,
          prevOpIndex,
        },
      };

      if (this.options.signer) {
        prepared = await this.signAction(prepared);
      }

      actions.push(prepared);
    }

    return actions;
  }

  /** Sign an action using the configured signer, preserving existing signatures. */
  private async signAction(action: Action): Promise<Action> {
    const signer = this.options.signer!;
    const signature = await signer.signAction(action);
    const existingSignatures = action.context?.signer?.signatures ?? [];
    return {
      ...action,
      context: {
        ...action.context,
        signer: {
          user: signer.user!,
          app: signer.app!,
          signatures: [...existingSignatures, signature],
        },
      },
    };
  }

  /**
   * Fetch document and operations from the remote.
   *
   * On the first pull, uses the combined document+operations query.
   * On subsequent pulls, fetches only new operations per scope using
   * sinceRevision, then merges with existing local operations.
   * Falls back to a full fetch if the merge produces a count mismatch.
   */
  private async fetchDocumentAndOperations(): Promise<{
    remoteDoc: RemoteDocumentData;
    operations: DocumentOperations;
  }> {
    // Incremental fetch: use sinceRevision per scope
    if (this.hasPulled) {
      return this.incrementalFetch();
    }

    // Initial fetch: combined document + operations query
    const result = await this.remoteClient.getDocumentWithOperations(
      this.documentId,
      this.options.branch,
    );

    if (!result) {
      throw new Error(`Document "${this.documentId}" not found on remote`);
    }

    this.hasPulled = true;
    return {
      remoteDoc: result.document,
      operations: convertRemoteOperations(result.operations.operationsByScope),
    };
  }

  /**
   * Incremental fetch: fetches the document and only new operations per scope
   * using sinceRevision in a single request when possible.
   * Falls back to a full fetch on count mismatch.
   */
  private async incrementalFetch(): Promise<{
    remoteDoc: RemoteDocumentData;
    operations: DocumentOperations;
  }> {
    const scopes = Object.keys(this.remoteRevision);

    const result = await this.remoteClient.getDocumentWithOperations(
      this.documentId,
      this.options.branch,
      this.remoteRevision,
      scopes.length > 0 ? scopes : undefined,
    );

    if (!result) {
      throw new Error(`Document "${this.documentId}" not found on remote`);
    }

    const remoteDoc = result.document;
    const expectedRevision = extractRevisionMap(remoteDoc.revisionsList);

    const newOps = convertRemoteOperations(result.operations.operationsByScope);
    const merged = this.mergeOperations(this.inner.operations, newOps);

    // Validate: merged operation counts must match remote revisions
    if (this.hasExpectedOperationCounts(merged, expectedRevision)) {
      return { remoteDoc, operations: merged };
    }

    // Mismatch — do a full fetch
    return this.fullFetch(remoteDoc);
  }

  /**
   * Full fetch fallback: fetches all operations from the beginning.
   * Used when an incremental fetch produces a count mismatch.
   */
  private async fullFetch(remoteDoc: RemoteDocumentData): Promise<{
    remoteDoc: RemoteDocumentData;
    operations: DocumentOperations;
  }> {
    const { operationsByScope } = await this.remoteClient.getAllOperations(
      this.documentId,
      this.options.branch,
    );

    return {
      remoteDoc,
      operations: convertRemoteOperations(operationsByScope),
    };
  }

  /**
   * Validate that the merged operations match the expected revision per scope.
   * Each scope's operation count should equal its revision number.
   */
  private hasExpectedOperationCounts(
    operations: DocumentOperations,
    expectedRevision: Record<string, number>,
  ): boolean {
    for (const [scope, revision] of Object.entries(expectedRevision)) {
      const opCount = scope in operations ? operations[scope].length : 0;
      if (opCount !== revision) {
        return false;
      }
    }
    return true;
  }

  /**
   * Merge existing local operations with newly fetched operations.
   * Appends new operations to existing ones per scope.
   */
  private mergeOperations(
    existingOps: DocumentOperations,
    newOps: DocumentOperations,
  ): DocumentOperations {
    const merged: DocumentOperations = {};

    // Copy existing operations
    for (const [scope, ops] of Object.entries(existingOps)) {
      if (ops.length > 0) {
        merged[scope] = [...ops];
      }
    }

    // Append new operations per scope
    for (const [scope, ops] of Object.entries(newOps)) {
      if (ops.length > 0) {
        (merged[scope] ??= []).push(...ops);
      }
    }

    return merged;
  }

  /** Schedule a push via microtask (for streaming mode coalescing). */
  private schedulePush(): void {
    if (this.pushScheduled) return;
    this.pushScheduled = true;
    queueMicrotask(() => {
      this.pushScheduled = false;
      // Chain onto the push queue to prevent concurrent pushes
      this.pushQueue = this.pushQueue.then(async () => {
        try {
          await this.push();
        } catch (error: unknown) {
          // Actions remain in tracker for retry
          this.options.onPushError?.(error);
        }
      });
    });
  }
}
