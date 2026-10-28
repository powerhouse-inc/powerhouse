import type {
  ConsistencyToken,
  JobStatus,
  WriteHandle,
  WriteReceipt,
} from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";

type AnyFn = (...args: never[]) => unknown;
type FacadeMock = Record<string, unknown>;

const READ_METHODS = [
  "get",
  "getMany",
  "find",
  "getOperations",
  "subscribe",
  "waitForJob",
  "getJobStatus",
  "getDocumentModelModules",
  "getDocumentModelModule",
  "getDocumentModelModuleForDocument",
  "getCreateSignaturePolicy",
  "getCreateProtocolVersions",
  "newDocument",
  "resolveIdOrSlug",
  "isServed",
];

const WRITE_METHODS = [
  "execute",
  "create",
  "createEmpty",
  "createDocumentInDrive",
  "deleteDocument",
  "rename",
  "setPreferredEditor",
  "upgradeDocument",
  "addRelationship",
  "removeRelationship",
];

function emptyToken(): ConsistencyToken {
  return { version: 1, createdAtUtcIso: "", coordinates: [] };
}

function idOf(value: unknown, fallback: string): string {
  const header = (value as { header?: { id?: unknown } } | null)?.header;
  return typeof header?.id === "string" ? header.id : fallback;
}

/**
 * A settled handle over a facade mock's result: `document()` resolves to what
 * the facade method resolved, the stages to an empty receipt.
 */
export function settledHandle(result: unknown, documentId = ""): WriteHandle {
  const id = idOf(result, documentId);
  const receipt: WriteReceipt = {
    job: {
      id: "",
      documentId: id,
      status: "READ_READY" as JobStatus,
      createdAtUtcIso: "",
      consistencyToken: emptyToken(),
      meta: { batchId: "", batchJobIds: [] },
    },
    token: emptyToken(),
    documentId: id,
    branch: "main",
  };
  return {
    jobId: "",
    documentId: id,
    branch: "main",
    written: Promise.resolve(receipt),
    readable: Promise.resolve(receipt),
    document: <T extends PHDocument>() => Promise.resolve(result as T),
  };
}

/** Calls the mock's current method, so a test may replace it after wrapping. */
function late(owner: () => FacadeMock, name: string): AnyFn {
  return ((...args: never[]) =>
    (owner()[name] as AnyFn).apply(owner(), args)) as AnyFn;
}

function wrapWrite(fn: AnyFn): AnyFn {
  return (async (...args: never[]) => {
    const result = await fn(...args);
    return settledHandle(result, typeof args[0] === "string" ? args[0] : "");
  }) as AnyFn;
}

/**
 * Gives a facade-shaped client mock the `read` and `write` halves the code
 * under test now calls: reads are the mock's own methods; each write calls
 * the mock's facade method and wraps what it resolves in a settled handle, so
 * a test keeps asserting on the facade spy. A mock that already has halves is
 * returned as it is.
 */
export function withHalves<T extends FacadeMock>(
  client: T,
): T & { read: FacadeMock; write: FacadeMock } {
  if (client.read && client.write) {
    return client as T & { read: FacadeMock; write: FacadeMock };
  }
  const self = () => client as FacadeMock;
  const drivesOf = () => client.drives as FacadeMock;
  const read: FacadeMock = {};
  for (const name of READ_METHODS) {
    if (typeof client[name] === "function") {
      read[name] = late(self, name);
    }
  }
  const write: FacadeMock = {};
  for (const name of WRITE_METHODS) {
    if (typeof client[name] === "function") {
      write[name] = wrapWrite(late(self, name));
    }
  }
  if (typeof client.isDocumentIdTaken === "function") {
    write.isDocumentIdTaken = late(self, "isDocumentIdTaken");
  }
  const drives = client.drives as FacadeMock | undefined;
  if (drives) {
    const readDrives: FacadeMock = {};
    const writeDrives: FacadeMock = {};
    for (const [name, fn] of Object.entries(drives)) {
      if (typeof fn !== "function") continue;
      if (name === "getNode" || name === "listNodes") {
        readDrives[name] = late(drivesOf, name);
      } else {
        writeDrives[name] = wrapWrite(late(drivesOf, name));
      }
    }
    read.drives = readDrives;
    write.drives = writeDrives;
  }
  return Object.assign(client, { read, write });
}
