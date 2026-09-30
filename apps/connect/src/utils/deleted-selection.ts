import type { DocumentChangeEvent } from "@powerhousedao/reactor";
import { DocumentChangeType } from "@powerhousedao/reactor-browser";

export type DeletedSelectionHost = {
  selectedDriveId?: string;
  selectedNodeId?: string;
  closeDrive(): void;
  closeNode(): void;
  notify(message: string): void;
};

/** Closes the drive or document a Deleted event removed, saying why. */
export function closeDeletedSelection(
  event: DocumentChangeEvent,
  host: DeletedSelectionHost,
): void {
  if (event.type !== DocumentChangeType.Deleted) return;
  const deletedId = event.context?.childId;
  if (!deletedId) return;
  const gone = event.context?.purged ? "has been erased" : "has been deleted";

  if (host.selectedDriveId && deletedId === host.selectedDriveId) {
    host.closeDrive();
    host.notify(`The drive you were viewing ${gone}`);
    return;
  }

  if (host.selectedNodeId && deletedId === host.selectedNodeId) {
    host.closeNode();
    host.notify(`The document you were editing ${gone}`);
  }
}
