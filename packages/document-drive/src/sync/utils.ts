import { OperationScope } from "document-model/document";
import { Optional } from "../utils/types";
import { ListenerFilter } from "./listener/types";
import { SyncUnit } from "./sync-unit/types";

export function buildListenerFilter(
  filter?: Partial<{
    branch: string[] | null;
    documentId: string[] | null;
    documentType: string[] | null;
    scope: string[] | null;
  }>,
): ListenerFilter {
  return {
    branch: filter?.branch ?? ["*"],
    documentId: filter?.documentId ?? ["*"],
    documentType: filter?.documentType ?? ["*"],
    scope: (filter?.scope ?? ["*"]) as OperationScope[],
  };
}

export function listensToSyncUnit(
  filter: Optional<ListenerFilter & { driveId: string[] }>,
  syncUnit: Pick<
    SyncUnit,
    "driveId" | "documentId" | "documentType" | "scope" | "branch"
  >,
): boolean {
  const { driveId, documentId, documentType, scope, branch } = filter;
  return (
    (!driveId?.length ||
      driveId.includes("*") ||
      driveId.includes(syncUnit.driveId)) &&
    (!documentId?.length ||
      documentId.includes("*") ||
      documentId.includes(syncUnit.documentId)) &&
    (!documentType?.length ||
      documentType.includes("*") ||
      documentType.includes(syncUnit.documentType)) &&
    (!scope?.length || scope.includes("*") || scope.includes(syncUnit.scope)) &&
    (!branch?.length ||
      branch.includes("*") ||
      branch.includes(syncUnit.branch)) &&
    (!driveId?.length ||
      driveId.includes("*") ||
      driveId.includes(syncUnit.driveId))
  );
}
