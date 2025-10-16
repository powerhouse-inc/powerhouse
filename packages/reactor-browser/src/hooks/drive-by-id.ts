import type {
  DocumentDriveAction,
  DocumentDriveDocument,
} from "document-drive";
import type { DocumentDispatch } from "../types/documents.js";
import { useDispatch } from "./dispatch.js";
import { useDrives } from "./drives.js";

export function useDriveById(
  driveId: string | undefined | null,
): [DocumentDriveDocument, DocumentDispatch<DocumentDriveAction>] {
  const drives = useDrives();
  const foundDrive = drives?.find((drive) => drive.header.id === driveId);
  const [drive, dispatch] = useDispatch(foundDrive);
  if (!foundDrive) {
    throw new Error(`Drive with id ${driveId} not found`);
  }
  return [drive, dispatch] as [
    DocumentDriveDocument,
    DocumentDispatch<DocumentDriveAction>,
  ];
}
