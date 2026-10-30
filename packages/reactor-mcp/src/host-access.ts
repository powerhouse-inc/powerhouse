import type {
  ConsistencyToken,
  IReactorClient,
  NewDocumentOptions,
  OperationFilter,
  PagedResults,
  PagingOptions,
  SearchFilter,
  ViewFilter,
} from "@powerhousedao/reactor";
import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import {
  DRIVE_DOCUMENT_TYPE,
  ReactorToolError,
  type ReactorToolClient,
  type ReactorToolWriteClient,
} from "./tools/index.js";

/** The host's access decisions for one caller, as its GraphQL API makes them; ids are canonical. */
export interface McpAccess {
  /** Policy-wide access (OPEN or a supreme admin): per-document checks are skipped. */
  readonly unrestricted: boolean;
  /** Whether the caller is authenticated; a refused create says which. */
  readonly authenticated: boolean;
  canRead(documentId: string): Promise<boolean>;
  canWrite(documentId: string): Promise<boolean>;
  canMutate(documentId: string, operationType: string): Promise<boolean>;
  canCreate(): boolean | Promise<boolean>;
  /** Called after the caller created a document, so the host records its owner. */
  created?(documentId: string): Promise<void>;
}

/** Resolves identifiers the way the host's GraphQL checks do. */
export type HostAccessIdentity = Pick<IReactorClient, "resolveIdOrSlug"> & {
  readonly write: Pick<IReactorClient["write"], "describe">;
};

type DeniedAction = { index: number; type: string; reason: string };

/** A batch the host's ACL refused, by action index; nothing in it was written. */
export class HostAccessDeniedError extends Error {
  readonly denied: DeniedAction[];

  constructor(denied: DeniedAction[]) {
    super(denied[0]?.reason ?? "Forbidden");
    this.name = "HostAccessDeniedError";
    this.denied = denied;
  }
}

const forbidden = (what: string) =>
  new ReactorToolError("FORBIDDEN", `Forbidden: you may not ${what}`);

type DriveNodes = { global?: { nodes?: { id: string }[] } };

/** The checks GraphQL's resolvers apply, for one caller. */
export class HostAccessGate {
  constructor(
    private readonly access: McpAccess,
    private readonly ids: HostAccessIdentity,
  ) {}

  get unrestricted(): boolean {
    return this.access.unrestricted;
  }

  // An unresolvable id is refused without saying whether it exists.
  private async canonical(
    identifier: string,
    side: "read" | "write",
    what: string,
    signal?: AbortSignal,
  ): Promise<string> {
    try {
      return side === "read"
        ? await this.ids.resolveIdOrSlug(identifier, undefined, signal)
        : (await this.ids.write.describe(identifier, undefined, signal))
            .documentId;
    } catch {
      throw forbidden(what);
    }
  }

  /** GraphQL's assertCanRead: the id to fetch, or FORBIDDEN. */
  async read(identifier: string, signal?: AbortSignal): Promise<string> {
    if (this.access.unrestricted) return identifier;
    const what = `read ${identifier}`;
    const id = await this.canonical(identifier, "read", what, signal);
    if (!(await this.access.canRead(id))) throw forbidden(what);
    return id;
  }

  /** GraphQL's assertCanWrite: the id to write, or FORBIDDEN. */
  async write(identifier: string, signal?: AbortSignal): Promise<string> {
    if (this.access.unrestricted) return identifier;
    const what = `write to ${identifier}`;
    const id = await this.canonical(identifier, "write", what, signal);
    if (!(await this.access.canWrite(id))) throw forbidden(what);
    return id;
  }

  /** GraphQL's assertCanExecuteOperations: canMutate per action type. */
  async mutate(
    identifier: string,
    actions: readonly Pick<Action, "type">[],
    signal?: AbortSignal,
  ): Promise<string> {
    if (this.access.unrestricted) return identifier;
    const id = await this.canonical(
      identifier,
      "write",
      `change ${identifier}`,
      signal,
    );
    const decisions = new Map<string, boolean>();
    for (const { type } of actions) {
      if (!decisions.has(type)) {
        decisions.set(type, await this.access.canMutate(id, type));
      }
    }
    const denied = actions.flatMap(({ type }, index): DeniedAction[] =>
      decisions.get(type)
        ? []
        : [{ index, type, reason: `Forbidden: you may not execute ${type}` }],
    );
    if (denied.length > 0) throw new HostAccessDeniedError(denied);
    return id;
  }

  /** GraphQL's create rule: write on the parent, else canCreate. */
  async create(parent?: string, signal?: AbortSignal): Promise<void> {
    if (parent) {
      await this.write(parent, signal);
      return;
    }
    if (this.access.unrestricted || (await this.access.canCreate())) return;
    throw new ReactorToolError(
      "FORBIDDEN",
      this.access.authenticated
        ? "Forbidden: you may not create documents"
        : "Authentication required to create documents",
    );
  }

  async created(documentId: string): Promise<void> {
    await this.access.created?.(documentId);
  }

  async readable<T>(items: readonly T[], idOf: (item: T) => string) {
    if (this.access.unrestricted) return [...items];
    const decisions = new Map<string, boolean>();
    const out: T[] = [];
    for (const item of items) {
      const id = idOf(item);
      let allowed = decisions.get(id);
      if (allowed === undefined) {
        allowed = await this.access.canRead(id);
        decisions.set(id, allowed);
      }
      if (allowed) out.push(item);
    }
    return out;
  }

  /** The readable part of a page; an emptied page moves on, so a listing does not stop early. */
  async readablePage<T>(
    page: PagedResults<T>,
    idOf: (item: T) => string,
  ): Promise<PagedResults<T>> {
    if (this.access.unrestricted) return page;
    const results = await this.readable(page.results, idOf);
    const next = page.next;
    if (results.length === 0 && next && page.results.length > 0) {
      return this.readablePage(await next(), idOf);
    }
    return {
      ...page,
      results,
      next: next && (async () => this.readablePage(await next(), idOf)),
    };
  }
}

const documentId = (document: PHDocument) => document.header.id;

type EvaluateActions = IReactorClient["write"]["evaluateActions"];

/** The tool client behind the host's ACL as GraphQL applies it. */
export class HostAccessClient implements ReactorToolClient {
  readonly write: ReactorToolWriteClient & {
    evaluateActions: EvaluateActions;
    /** Checked before deleteDocument changes anything. */
    authorizeDelete(id: string, signal?: AbortSignal): Promise<void>;
  };

  constructor(
    private readonly inner: ReactorToolClient & {
      readonly write: { evaluateActions: EvaluateActions };
    },
    private readonly gate: HostAccessGate,
  ) {
    const write = inner.write;
    this.write = {
      create: async (document, parentIdentifier, signal) => {
        await gate.create(parentIdentifier, signal);
        const handle = await write.create(document, parentIdentifier, signal);
        await handle.readable;
        await gate.created(handle.documentId);
        return handle;
      },
      createEmpty: async (documentType, options, signal) => {
        await gate.create(options?.parentIdentifier, signal);
        const handle = await write.createEmpty(documentType, options, signal);
        await handle.readable;
        await gate.created(handle.documentId);
        return handle;
      },
      execute: async (id, branch, actions, signal) =>
        write.execute(
          await gate.mutate(id, actions, signal),
          branch,
          actions,
          signal,
        ),
      deleteDocument: async (id, propagate, signal) =>
        write.deleteDocument(await gate.write(id, signal), propagate, signal),
      drives: {
        // GraphQL's createDocument under a drive: write on the drive.
        addFile: async (driveId, document, parentFolder, signal) => {
          const drive = await gate.write(driveId, signal);
          const handle = await write.drives.addFile(
            drive,
            document,
            parentFolder,
            signal,
          );
          await handle.readable;
          await gate.created(document.header.id);
          return handle;
        },
      },
      evaluateActions: async (id, branch, candidates, subject, signal) =>
        write.evaluateActions(
          await gate.read(id, signal),
          branch,
          candidates,
          subject,
          signal,
        ),
      authorizeDelete: (id, signal) => this.authorizeDelete(id, signal),
    };
  }

  // GraphQL's deleteDocument check, plus DELETE_NODE on each drive filing it,
  // up front so a refusal leaves every drive as it was.
  private async authorizeDelete(id: string, signal?: AbortSignal) {
    if (this.gate.unrestricted) return;
    const canonical = await this.gate.write(id, signal);
    const parents = await this.inner.getIncomingRelationships(
      canonical,
      "child",
      undefined,
      undefined,
      signal,
    );
    for (const parent of parents.results) {
      if (parent.header.documentType !== DRIVE_DOCUMENT_TYPE) continue;
      const nodes = (parent.state as DriveNodes).global?.nodes;
      if (Array.isArray(nodes) && !nodes.some((n) => n.id === canonical)) {
        continue;
      }
      try {
        await this.gate.mutate(parent.header.id, [{ type: "DELETE_NODE" }]);
      } catch {
        throw new ReactorToolError(
          "FORBIDDEN",
          `Document ${canonical} is filed in drive ${parent.header.id}, which you cannot change; it was not deleted`,
        );
      }
    }
  }

  async get<T extends PHDocument>(
    id: string,
    view?: ViewFilter,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ) {
    return this.inner.get<T>(
      await this.gate.read(id, signal),
      view,
      signal,
      consistencyToken,
    );
  }

  async resolveIdOrSlug(
    id: string,
    view?: ViewFilter,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ) {
    return this.inner.resolveIdOrSlug(
      await this.gate.read(id, signal),
      view,
      signal,
      consistencyToken,
    );
  }

  async find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ) {
    return this.gate.readablePage(
      await this.inner.find(search, view, paging, signal, consistencyToken),
      documentId,
    );
  }

  async getOperations(
    id: string,
    view?: ViewFilter,
    filter?: OperationFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ) {
    return this.inner.getOperations(
      await this.gate.read(id, signal),
      view,
      filter,
      paging,
      signal,
    );
  }

  async getOutgoingRelationships(
    id: string,
    type: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ) {
    return this.gate.readablePage(
      await this.inner.getOutgoingRelationships(
        await this.gate.read(id, signal),
        type,
        view,
        paging,
        signal,
        consistencyToken,
      ),
      documentId,
    );
  }

  async getIncomingRelationships(
    id: string,
    type: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ) {
    return this.gate.readablePage(
      await this.inner.getIncomingRelationships(
        await this.gate.read(id, signal),
        type,
        view,
        paging,
        signal,
        consistencyToken,
      ),
      documentId,
    );
  }

  async getOutgoingRelationshipEdges(
    id: string,
    type?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ) {
    return this.gate.readablePage(
      await this.inner.getOutgoingRelationshipEdges(
        await this.gate.read(id, signal),
        type,
        view,
        paging,
        signal,
        consistencyToken,
      ),
      (edge) => edge.targetId,
    );
  }

  async getIncomingRelationshipEdges(
    id: string,
    type?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ) {
    return this.gate.readablePage(
      await this.inner.getIncomingRelationshipEdges(
        await this.gate.read(id, signal),
        type,
        view,
        paging,
        signal,
        consistencyToken,
      ),
      (edge) => edge.sourceId,
    );
  }

  getDocumentModelModules(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ) {
    return this.inner.getDocumentModelModules(namespace, paging, signal);
  }

  getDocumentModelModule(documentType: string) {
    return this.inner.getDocumentModelModule(documentType);
  }

  getDocumentModelModuleForDocument(document: PHDocument) {
    return this.inner.getDocumentModelModuleForDocument(document);
  }

  newDocument<T extends PHDocument = PHDocument>(
    documentType: string,
    options?: NewDocumentOptions,
    signal?: AbortSignal,
  ) {
    return this.inner.newDocument<T>(documentType, options, signal);
  }
}
