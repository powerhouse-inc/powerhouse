import {
  setSelectedNode,
  useSelectedNode,
} from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { FolderContents } from "./FolderContents.js";
import { FolderTree } from "./FolderTree.js";

/**
 * Stockroom layout: folder tree on the left (on top on phones), and either the
 * selected folder's inventory or the open document's editor on the right.
 */
export function DriveExplorer({ children }: EditorProps) {
  // Connect passes the open document's editor as children.
  const openNode = useSelectedNode();
  const showDocument = !!children && openNode?.kind === "file";

  return (
    <div
      className="bg-background text-foreground flex min-h-full flex-col md:flex-row"
      data-testid="stockroom-app"
    >
      <FolderTree hideOnPhone={showDocument} />
      <main className="min-w-0 flex-1">
        {showDocument ? (
          <div className="flex flex-col">
            <div className="border-border border-b px-4 py-2">
              <button
                type="button"
                className="text-primary text-sm hover:underline"
                onClick={() =>
                  setSelectedNode(openNode.parentFolder ?? undefined)
                }
              >
                ← Back to stockroom
              </button>
            </div>
            {children}
          </div>
        ) : (
          <FolderContents />
        )}
      </main>
    </div>
  );
}
