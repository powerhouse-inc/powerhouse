import { FileItem } from "@powerhousedao/design-system/connect";
import {
  useNodesInSelectedDriveOrFolder,
  isFileNodeKind,
} from "@powerhousedao/reactor-browser";

/** Shows the files in the selected drive or folder */
export function Files() {
  const nodes = useNodesInSelectedDriveOrFolder();
  const fileNodes = nodes.filter((n) => isFileNodeKind(n));
  const hasFiles = fileNodes.length > 0;

  if (!hasFiles) return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-600">Documents</h3>
      <div className="flex flex-wrap gap-4">
        {fileNodes.map((fileNode) => (
          <FileItem key={fileNode.id} fileNode={fileNode} />
        ))}
      </div>
    </div>
  );
}
