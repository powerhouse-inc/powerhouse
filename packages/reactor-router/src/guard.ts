import type { IReactorClient } from "@powerhousedao/reactor";
import { WrongBackendError } from "./errors.js";

/** Anything callable on a client, with no claim about its argument types. */
type ClientMethod = (...args: unknown[]) => unknown;

/**
 * Whether this reactor owns the document an operation names, and what to call
 * its collection in a refusal.
 */
export type OwnershipGuardOptions = {
  /** The backend's own name, as the router knows it. */
  readonly backendName: string;
  /**
   * Whether this reactor owns the identifier.
   *
   * Defaults to "it serves the document, or its id is taken here" -- the two
   * questions `IReactorClient` can answer today. The second clause matters: a
   * soft-deleted document is not served but operations on it still belong here,
   * and a guard without it would refuse every delete-adjacent operation and
   * have the router chase a document no backend admits to.
   */
  readonly owns?: (identifier: string) => Promise<boolean>;
  /**
   * The collection id to name in a refusal, when this host can map a document
   * to one. Absent, the refusal names the document only -- which is enough: the
   * router re-probes rather than trusting the fields.
   */
  readonly collectionOf?: (identifier: string) => string;
};

/**
 * Which argument of a guarded method names the document whose ownership
 * decides whether this backend may serve the call.
 *
 * Reads are deliberately ABSENT. The guard is a WRITE-path validator:
 *
 * - a read on a reactor that lacks the document already fails, or answers
 *   empty, which is the truthful answer and what the router's read recovery
 *   acts on;
 * - the router's fan-in reads REQUIRE non-owners to answer. A relationship read
 *   asks every backend about a source document only one of them holds, and a
 *   guard that refused those would turn a working merge into an all-fail.
 *
 * Creation is absent for the same reason reactor-api's drive middleware
 * bypasses `createDocument`: the document does not exist yet, so ownership is
 * not yet a question -- placement is, and that is the router's to decide.
 */
const GUARDED_DOCUMENT_ARG: ReadonlyMap<string, number> = new Map([
  ["execute", 0],
  ["executeAsync", 0],
  ["rename", 0],
  ["setPreferredEditor", 0],
  ["upgradeDocument", 0],
  ["deleteDocument", 0],
  ["addRelationship", 0],
  ["updateRelationship", 0],
  ["removeRelationship", 0],
  ["moveRelationship", 0],
  ["createDocumentInDrive", 0],
]);

/** Guarded `drives` methods and the argument naming the drive or node. */
const GUARDED_DRIVE_ARG: ReadonlyMap<string, number> = new Map([
  ["addFile", 0],
  ["addFolder", 0],
  ["removeNode", 0],
  ["renameNode", 0],
  ["moveNode", 0],
  ["copyNode", 0],
  ["setPreferredEditorOnNode", 0],
]);

/** Methods whose first argument is a LIST of document identifiers. */
const GUARDED_IDENTIFIER_LIST: ReadonlySet<string> = new Set([
  "deleteDocuments",
]);

/** Methods carrying a batch request whose jobs each name a document. */
const GUARDED_BATCH: ReadonlySet<string> = new Set([
  "executeBatch",
  "loadBatch",
]);

/**
 * Wraps a reactor's client so that it VALIDATES OWNERSHIP and refuses an
 * operation aimed at a document it does not hold, with a structured
 * {@link WrongBackendError}.
 *
 * This is the backend half of the advisory routing contract, and the reason the
 * router half can be optimistic: "backends validate ownership and return
 * structured misroute errors; correctness never depends on the router" (plan
 * agreed decision 4). It ships here, next to the router, because the two halves
 * are one design -- and because no reactor validates this today, which is the
 * documented gap. A host that puts its reactors behind a router should wrap
 * each one with this; a reactor that grows its own ownership check later
 * replaces it without the router changing.
 *
 * A `Proxy` here, where the routing client is a class: this behaviour IS
 * uniform -- look the method up in one table, validate, forward -- so a Proxy
 * is the whole implementation rather than a table plus an implementation.
 * Methods with no entry are forwarded untouched and unwrapped.
 */
export function withOwnershipGuard(
  client: IReactorClient,
  options: OwnershipGuardOptions,
): IReactorClient {
  const owns =
    options.owns ??
    (async (identifier: string): Promise<boolean> => {
      const served = await client.isServed(identifier).catch(() => false);
      if (served) {
        return true;
      }
      return client.isDocumentIdTaken(identifier).catch(() => false);
    });

  const refuse = (identifier: string, operation: string): never => {
    throw new WrongBackendError({
      collectionId: options.collectionOf?.(identifier) ?? "",
      documentId: identifier,
      rejectedBy: options.backendName,
      operation,
    });
  };

  const assertOwned = async (
    identifier: string,
    operation: string,
  ): Promise<void> => {
    if (identifier === "") {
      return;
    }
    const owned = await owns(identifier);
    if (!owned) {
      refuse(identifier, operation);
    }
  };

  const guardOne = (
    receiver: object,
    method: ClientMethod,
    operation: string,
    index: number,
  ): ClientMethod => {
    return async (...args: unknown[]): Promise<unknown> => {
      const identifier = args[index];
      if (typeof identifier === "string") {
        await assertOwned(identifier, operation);
      }
      return method.apply(receiver, args);
    };
  };

  const guardList = (
    receiver: object,
    method: ClientMethod,
    operation: string,
  ): ClientMethod => {
    return async (...args: unknown[]): Promise<unknown> => {
      const identifiers = args[0];
      if (Array.isArray(identifiers)) {
        for (const identifier of identifiers) {
          if (typeof identifier === "string") {
            await assertOwned(identifier, operation);
          }
        }
      }
      return method.apply(receiver, args);
    };
  };

  const guardBatch = (
    receiver: object,
    method: ClientMethod,
    operation: string,
  ): ClientMethod => {
    return async (...args: unknown[]): Promise<unknown> => {
      for (const documentId of batchDocumentIds(args[0])) {
        await assertOwned(documentId, operation);
      }
      return method.apply(receiver, args);
    };
  };

  const drives = new Proxy(client.drives, {
    get: (target, prop) => {
      const value = Reflect.get(target, prop) as unknown;
      if (typeof prop !== "string" || typeof value !== "function") {
        return value;
      }
      const index = GUARDED_DRIVE_ARG.get(prop);
      const method = value as ClientMethod;
      if (index === undefined) {
        return method.bind(target);
      }
      return guardOne(target, method, `drives.${prop}`, index);
    },
  });

  return new Proxy(client, {
    get: (target, prop) => {
      if (prop === "drives") {
        return drives;
      }
      const value = Reflect.get(target, prop) as unknown;
      if (typeof prop !== "string" || typeof value !== "function") {
        return value;
      }
      const method = value as ClientMethod;
      const index = GUARDED_DOCUMENT_ARG.get(prop);
      if (index !== undefined) {
        return guardOne(target, method, prop, index);
      }
      if (GUARDED_IDENTIFIER_LIST.has(prop)) {
        return guardList(target, method, prop);
      }
      if (GUARDED_BATCH.has(prop)) {
        return guardBatch(target, method, prop);
      }
      return method.bind(target);
    },
  });
}

function batchDocumentIds(request: unknown): readonly string[] {
  if (typeof request !== "object" || request === null) {
    return [];
  }
  const jobs = (request as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) {
    return [];
  }
  const ids: string[] = [];
  for (const job of jobs) {
    if (typeof job !== "object" || job === null) {
      continue;
    }
    const documentId = (job as { documentId?: unknown }).documentId;
    if (typeof documentId === "string" && documentId !== "") {
      ids.push(documentId);
    }
  }
  return [...new Set(ids)];
}
