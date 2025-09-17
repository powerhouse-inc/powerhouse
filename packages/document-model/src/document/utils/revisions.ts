// gets the last modified timestamp of a document from§

import type { PHDocument, PHDocumentHeader } from "document-model";
import { sortOperations } from "./document-helpers.js";

// it's operations, falling back to the initial state
export function getDocumentLastModified(document: PHDocument) {
  const sortedOperations = sortOperations(
    Object.values(document.operations).flat(),
  );

  return (
    sortedOperations.at(-1)!.timestampUtcMs ||
    document.header.lastModifiedAtUtcIso
  );
}

/**
 * Gets the next revision number based on the provided scope.
 *
 * @param state The current state of the document.
 * @param scope The scope of the operation.
 * @returns The next revision number.
 */
function getNextRevision(document: PHDocument, scope: string) {
  const latestOperationIndex = document.operations[scope].at(-1)?.index ?? -1;

  return (latestOperationIndex ?? -1) + 1;
}

/**
 * Updates the document header with the latest revision number and
 * date of last modification.
 *
 * @param state The current state of the document.
 * @param operation The action being applied to the document.
 * @returns The updated document state.
 */
export function updateHeaderRevision(
  document: PHDocument,
  scope: string,
): PHDocument {
  const header: PHDocumentHeader = {
    ...document.header,
    revision: {
      ...document.header.revision,
      [scope]: getNextRevision(document, scope),
    },
    lastModifiedAtUtcIso: getDocumentLastModified(document),
  };

  return {
    ...document,
    header,
  };
}
