import type { DeriveScope } from "@powerhousedao/shared/document-model";
import { deriveScopeVersioned } from "@powerhousedao/shared/document-model";
import type { IProtocolGate } from "../protocol/gate.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import type { IOperationStore } from "../storage/interfaces.js";
import { extractModuleVersion, readDocumentScope } from "./document-scope.js";
import { scopeVersions } from "./scope-versions.js";

/**
 * Base-reducer 3: the derivation a cold rebuild of the head runs, for a
 * reducer to re-derive a scope with. It starts from the state the document
 * scope seeds, applies each row with its own module version's reducer and
 * each upgrade at its boundary, and splices the scope back into the
 * document it is given.
 */
export async function scopeDerivation(
  operationStore: IOperationStore,
  registry: IDocumentModelRegistry,
  gate: IProtocolGate | undefined,
  documentId: string,
  branch: string,
  signal?: AbortSignal,
): Promise<DeriveScope> {
  const read = await readDocumentScope(
    operationStore,
    registry,
    gate,
    documentId,
    branch,
    undefined,
    signal,
  );
  const finalVersion =
    read.validatedUpgrades.at(-1)?.toVersion ??
    extractModuleVersion(read.document);

  return (document, operations, scope, onThrow) => {
    // Fresh per call: applying an upgrade consumes it and writes in place.
    const pending = [...read.pendingUpgrades];
    const versions = scopeVersions(
      registry,
      read.document.header,
      scope,
      read.validatedUpgrades,
      pending,
      finalVersion,
    );
    const seeded = {
      ...document,
      state: { ...read.document.state },
      initialState: { ...read.document.initialState },
    } as typeof document;
    const derived = deriveScopeVersioned(
      seeded,
      operations,
      versions,
      scope,
      onThrow,
    );
    const head = versions.upgradeTo(derived.document, Number.MAX_SAFE_INTEGER);
    return {
      document: {
        ...document,
        header: head.header,
        state: {
          ...document.state,
          [scope]: (head.state as Record<string, unknown>)[scope],
        },
      },
      applied: derived.applied,
    };
  };
}
