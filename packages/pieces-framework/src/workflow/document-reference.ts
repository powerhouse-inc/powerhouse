// A pointer to a reactor document, and the marker the run journal stores in
// place of a document a step returned. No dependencies: the editor bundles it.

export interface DocumentReference {
  documentId: string;
  documentType: string;
  branch: string;
  // Operation count per scope when the reference was taken.
  revision: Record<string, number>;
}

// The journal's stand-in for a document: { "$documentRef": DocumentReference }.
export const DOCUMENT_REF_KEY = "$documentRef";

export interface DocumentRefMarker {
  [DOCUMENT_REF_KEY]: DocumentReference;
}

interface HeaderLike {
  id: string;
  documentType: string;
  branch: string;
  revision: Record<string, number>;
}

// Keys of a PHDocument; anything else beside them is the step's own.
const DOCUMENT_KEYS = new Set([
  "header",
  "state",
  "initialState",
  "operations",
  "clipboard",
]);

// Past this depth a value is left as it is.
const MAX_DEPTH = 64;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function isRevision(value: unknown): value is Record<string, number> {
  return (
    isPlainObject(value) &&
    Object.values(value).every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
  );
}

export function documentReference(header: HeaderLike): DocumentReference {
  return {
    documentId: header.id,
    documentType: header.documentType,
    branch: header.branch,
    revision: { ...header.revision },
  };
}

export function isDocumentReference(
  value: unknown,
): value is DocumentReference {
  return (
    isPlainObject(value) &&
    typeof value.documentId === "string" &&
    typeof value.documentType === "string" &&
    typeof value.branch === "string" &&
    isRevision(value.revision)
  );
}

// A reactor document header: ids, branch, per-scope revisions and timestamps.
function isDocumentHeader(value: unknown): value is HeaderLike {
  return (
    isPlainObject(value) &&
    typeof value.id === "string" &&
    value.id !== "" &&
    typeof value.documentType === "string" &&
    value.documentType !== "" &&
    typeof value.branch === "string" &&
    isRevision(value.revision) &&
    typeof value.createdAtUtcIso === "string" &&
    typeof value.lastModifiedAtUtcIso === "string"
  );
}

// Shaped like a reactor document: { header, state } with a full header.
export function isReactorDocument(
  value: unknown,
): value is { header: HeaderLike; state: Record<string, unknown> } {
  return (
    isPlainObject(value) &&
    isDocumentHeader(value.header) &&
    isPlainObject(value.state)
  );
}

export function isDocumentRefMarker(
  value: unknown,
): value is DocumentRefMarker & Record<string, unknown> {
  return isPlainObject(value) && isDocumentReference(value[DOCUMENT_REF_KEY]);
}

function walk(
  value: unknown,
  visit: (node: Record<string, unknown>) => Record<string, unknown> | undefined,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (depth > MAX_DEPTH || typeof value !== "object" || value === null) {
    return value;
  }
  if (seen.has(value)) return value;
  if (Array.isArray(value)) {
    seen.add(value);
    const mapped = value.map((item) => walk(item, visit, depth + 1, seen));
    seen.delete(value);
    return mapped;
  }
  if (!isPlainObject(value)) return value;
  seen.add(value);
  const replaced = visit(value);
  const source = replaced ?? value;
  const result = Object.fromEntries(
    Object.entries(source).map(([key, entry]) => [
      key,
      replaced && !(key in value) ? entry : walk(entry, visit, depth + 1, seen),
    ]),
  );
  seen.delete(value);
  return result;
}

// Every document in the value, at any depth, swapped for its marker. Keys a
// step set beside a document's (e.g. extractedFrom) stay next to the marker.
export function referenceDocuments(value: unknown): unknown {
  return walk(
    value,
    (node) => {
      if (!isReactorDocument(node)) return undefined;
      const rest = Object.entries(node).filter(
        ([key]) => !DOCUMENT_KEYS.has(key),
      );
      return {
        [DOCUMENT_REF_KEY]: documentReference(node.header),
        ...Object.fromEntries(rest),
      };
    },
    0,
    new WeakSet(),
  );
}

// The references in a value's markers, in walk order.
export function documentRefsIn(value: unknown): DocumentReference[] {
  const found: DocumentReference[] = [];
  walk(
    value,
    (node) => {
      if (isDocumentRefMarker(node)) found.push(node[DOCUMENT_REF_KEY]);
      return undefined;
    },
    0,
    new WeakSet(),
  );
  return found;
}

export function containsDocumentRef(value: unknown): boolean {
  return documentRefsIn(value).length > 0;
}

// Each marker replaced by what `expand` gives for its reference, with the
// marker's other keys kept beside it.
export function expandDocumentRefs(
  value: unknown,
  expand: (reference: DocumentReference) => Record<string, unknown>,
): unknown {
  return walk(
    value,
    (node) => {
      if (!isDocumentRefMarker(node)) return undefined;
      const { [DOCUMENT_REF_KEY]: reference, ...rest } = node;
      return { ...rest, ...expand(reference) };
    },
    0,
    new WeakSet(),
  );
}
