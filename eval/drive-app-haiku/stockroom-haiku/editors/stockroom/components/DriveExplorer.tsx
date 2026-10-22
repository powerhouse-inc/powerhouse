import type { EditorProps } from "document-model";
import { useLinkProps, useSelectedDrive } from "@powerhousedao/reactor-browser";
import { driveName } from "./drive-name.js";
import { FolderTree } from "./FolderTree.js";
import { StockroomView } from "./StockroomView.js";

/** Folder tree beside either the open document or the stockroom view. */
export function DriveExplorer({ children }: EditorProps) {
  const showDocumentEditor = !!children;
  return (
    <div className="flex flex-col gap-4 md:flex-row">
      {/* Phones: a short strip above the content. Desktop: a column beside it. */}
      <div className="max-h-72 overflow-auto md:max-h-none md:w-64 md:shrink-0">
        <FolderTree />
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {showDocumentEditor ? (
          <>
            <BackToDrive />
            {children}
          </>
        ) : (
          <StockroomView />
        )}
      </div>
    </div>
  );
}

function BackToDrive() {
  const [drive] = useSelectedDrive();
  const link = useLinkProps({ driveSlug: drive.header.slug });
  return (
    <a {...link} className="mb-4 inline-block text-sm">
      Back to {driveName(drive)}
    </a>
  );
}
