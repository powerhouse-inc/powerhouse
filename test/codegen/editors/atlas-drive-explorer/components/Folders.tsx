import { FolderItem } from "@powerhousedao/design-system/connect";
import {
  useNodesInSelectedDriveOrFolder,
  isFolderNodeKind,
} from "@powerhousedao/reactor-browser";

/** Shows the folders in the selected drive or folder */
export function Folders() {
  const nodes = useNodesInSelectedDriveOrFolder();
  const folderNodes = nodes.filter((n) => isFolderNodeKind(n));
  const hasFolders = folderNodes.length > 0;
  if (!hasFolders) return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-gray-600">Folders</h3>
      <div className="flex flex-wrap gap-4">
        {folderNodes.map((folderNode) => (
          <FolderItem key={folderNode.id} folderNode={folderNode} />
        ))}
      </div>
    </div>
  );
}
