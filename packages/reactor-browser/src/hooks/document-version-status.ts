import type { PHDocument } from "@powerhousedao/shared/document-model";
import { useDocumentModelModules } from "./document-model-modules.js";
import { useModelRegistry } from "./reactor.js";

export type DocumentVersionStatus =
  | { kind: "current"; documentVersion: number }
  | {
      kind: "upgrade-available";
      documentVersion: number;
      latestVersion: number;
      canUpgrade: boolean;
    }
  | {
      kind: "unsupported";
      documentVersion: number;
      availableVersions: number[];
    };

/**
 * Classifies a document's model version against the installed module
 * versions. Pure logic, extracted for testing.
 */
export function getDocumentVersionStatus(
  documentVersion: number,
  availableVersions: number[],
  hasUpgradePath: (fromVersion: number, toVersion: number) => boolean,
): DocumentVersionStatus | undefined {
  if (availableVersions.length === 0) {
    return undefined;
  }
  const sorted = [...availableVersions].sort((a, b) => a - b);
  const latestVersion = sorted[sorted.length - 1];
  if (documentVersion > latestVersion) {
    return { kind: "unsupported", documentVersion, availableVersions: sorted };
  }
  if (documentVersion === latestVersion) {
    return { kind: "current", documentVersion };
  }
  return {
    kind: "upgrade-available",
    documentVersion,
    latestVersion,
    canUpgrade: hasUpgradePath(documentVersion, latestVersion),
  };
}

/**
 * Compares the given document's model version against the versions available
 * from installed Vetra packages. Returns undefined while packages load or
 * when the document type has no installed modules.
 */
export function useDocumentVersionStatus(
  document: PHDocument | undefined,
): DocumentVersionStatus | undefined {
  const modules = useDocumentModelModules();
  const registry = useModelRegistry();
  if (!document || !modules) {
    return undefined;
  }
  const documentType = document.header.documentType;
  const documentVersion = document.state.document.version || 1;
  const availableVersions = modules
    .filter((m) => m.documentModel.global.id === documentType)
    .map((m) => m.version ?? 1);

  return getDocumentVersionStatus(
    documentVersion,
    availableVersions,
    (fromVersion, toVersion) => {
      if (!registry) {
        return false;
      }
      try {
        registry.computeUpgradePath(documentType, fromVersion, toVersion);
        return true;
      } catch {
        return false;
      }
    },
  );
}
