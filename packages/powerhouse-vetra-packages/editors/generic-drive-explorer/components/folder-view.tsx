import { FolderItem } from "@powerhousedao/design-system/connect";
import { useDrop } from "@powerhousedao/design-system/connect";
import {
  isFolderNodeKind,
  useNodesInSelectedDriveOrFolder,
  useSelectedFolder,
} from "@powerhousedao/reactor-browser";
import { twMerge } from "tailwind-merge";
import { FileContentView } from "./file-content-view.js";
import { DriveLayout } from "./layout.js";

export function FolderView(props: { className?: string }) {
  const { className } = props;
  const nodes = useNodesInSelectedDriveOrFolder();
  const selectedFolder = useSelectedFolder();
  const folderNodes = nodes.filter((n) => isFolderNodeKind(n));
  const { isDropTarget, dropProps } = useDrop({
    target: selectedFolder,
  });
  return (
    <div
      className={twMerge(
        "rounded-md border-2 border-transparent p-2",
        isDropTarget && "border-dashed border-blue-100",
        className,
      )}
      {...dropProps}
    >
      <DriveLayout.ContentSection title="Folders" className="mb-4">
        {folderNodes.length > 0 ? (
          folderNodes.map((folderNode) => (
            <FolderItem key={folderNode.id} folderNode={folderNode} />
          ))
        ) : (
          <div className="mb-8 text-sm text-gray-400">
            No documents or files 📄
          </div>
        )}
      </DriveLayout.ContentSection>
      <DriveLayout.ContentSection title="Documents and files">
        <div className="w-full">
          <FileContentView />
        </div>
      </DriveLayout.ContentSection>
    </div>
  );
}

export default FolderView;
