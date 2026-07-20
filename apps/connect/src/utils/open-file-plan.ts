import { isDocumentTypeSupported } from "@powerhousedao/reactor-browser";
import type { Node } from "@powerhousedao/shared/document-drive";
import {
  getNextCopyNumber,
  isFileNode,
} from "@powerhousedao/shared/document-drive";

// Pure pre-flight planning for the open-file picker: given the pending files,
// their parse results and the selected drive's nodes, decide per file whether
// it can be imported, whether it collides with an existing document, and what
// name it should be stored under. No reactor access — everything here derives
// synchronously so the picker can recompute on every drive switch.

/** What the one-time parse of a pending file yielded. */
export type ParsedFileInfo =
  | { state: "parsed"; id: string; documentType: string; headerName: string }
  // The document model isn't installed: the import path's package
  // auto-discovery may still resolve it, so the file stays importable —
  // but its header is unknown, so no duplicate check is possible.
  | { state: "model-missing" }
  // Corrupt zip / not a Powerhouse document.
  | { state: "invalid" };

export type PlannedRow =
  | { kind: "checking" }
  | { kind: "invalid" }
  | { kind: "unsupported" }
  | {
      kind: "ready";
      finalName: string;
      duplicate?: "id" | "name";
      renamed: boolean;
    };

export type PlanEntry = {
  /** Stable identity of the pending file (see pendingFileKey). */
  key: string;
  file: File;
  /** undefined while the parse is still in flight. */
  parsed: ParsedFileInfo | undefined;
};

/** Same name normalization the import stores (use-on-drop-file convention). */
export function storedFileName(file: File): string {
  return file.name.replace(/\..+/gim, "");
}

/**
 * Duplicate semantics mirror the import path's isDocumentInLocation, scoped
 * to the drive ROOT: an id match, or a file node with the same name AND the
 * same document type. Renames follow the drive-tree copy convention
 * ("name (copy) N" via getNextCopyNumber). Names assigned within the batch
 * accumulate into the collision set, so two pending files that would store
 * the same name never end up identical either.
 */
export function planOpenFileImports(args: {
  entries: PlanEntry[];
  nodes: Node[];
  documentTypes: string[] | undefined;
}): Map<string, PlannedRow> {
  const { entries, nodes, documentTypes } = args;
  const rootNodes = nodes.filter(
    (node) => (node.parentFolder ?? null) === null,
  );
  const rows = new Map<string, PlannedRow>();
  const assignedNames = new Set<string>();

  function uniqueName(base: string, driveNames: string[]): string {
    const collides = driveNames.includes(base) || assignedNames.has(base);
    if (!collides) return base;
    const candidates = [...driveNames, ...assignedNames];
    return `${base} (copy) ${getNextCopyNumber(candidates, base)}`;
  }

  for (const { key, file, parsed } of entries) {
    if (!parsed) {
      rows.set(key, { kind: "checking" });
      continue;
    }
    if (parsed.state === "invalid") {
      rows.set(key, { kind: "invalid" });
      continue;
    }

    if (parsed.state === "model-missing") {
      const base = storedFileName(file) || file.name;
      const finalName = uniqueName(base, []);
      assignedNames.add(finalName);
      rows.set(key, {
        kind: "ready",
        finalName,
        renamed: finalName !== base,
      });
      continue;
    }

    if (!isDocumentTypeSupported(parsed.documentType, documentTypes)) {
      rows.set(key, { kind: "unsupported" });
      continue;
    }

    // The stored name falls back to the document's own header name when the
    // file name is extension-only (".phd" normalizes to "").
    const base = storedFileName(file) || parsed.headerName;
    const sameTypeNames = rootNodes
      .filter(
        (node) => isFileNode(node) && node.documentType === parsed.documentType,
      )
      .map((node) => node.name);
    const idDuplicate = rootNodes.some((node) => node.id === parsed.id);
    const nameDuplicate = sameTypeNames.includes(base);

    const finalName = uniqueName(base, sameTypeNames);
    assignedNames.add(finalName);
    rows.set(key, {
      kind: "ready",
      finalName,
      duplicate: nameDuplicate ? "name" : idDuplicate ? "id" : undefined,
      renamed: finalName !== base,
    });
  }

  return rows;
}
