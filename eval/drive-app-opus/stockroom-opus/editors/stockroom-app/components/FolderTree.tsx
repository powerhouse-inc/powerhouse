import {
  isFolderNodeKind,
  setSelectedNode,
  useSelectedDrive,
  useSelectedNode,
} from "@powerhousedao/reactor-browser";
import type { FolderNode } from "@powerhousedao/shared/document-drive";
import { useMemo } from "react";
import { NewFolderForm } from "./NewFolderForm.js";

/** The drive's folders as a tree. Clicking one selects it. */
export function FolderTree({ hideOnPhone = false }: { hideOnPhone?: boolean }) {
  const [drive] = useSelectedDrive();
  const selected = useSelectedNode();
  const folders = useMemo(
    () => drive.state.global.nodes.filter(isFolderNodeKind),
    [drive.state.global.nodes],
  );
  // The folder being viewed: the selected folder, or the open document's folder.
  const currentId =
    selected?.kind === "folder"
      ? selected.id
      : (selected?.parentFolder ?? null);

  return (
    <nav
      aria-label="Folders"
      className={`border-border ${hideOnPhone ? "hidden md:flex" : "flex"} max-h-64 flex-col gap-2 overflow-y-auto border-b p-3 md:max-h-none md:w-64 md:shrink-0 md:border-r md:border-b-0`}
    >
      <h2 className="text-muted-foreground text-xs font-semibold uppercase">
        Folders
      </h2>
      <ul className="flex flex-col text-sm" role="tree">
        <TreeItem
          label={drive.state.global.name || drive.header.name || "Drive"}
          depth={0}
          active={currentId === null}
          onSelect={() => setSelectedNode(undefined)}
        />
        <SubTree
          folders={folders}
          parentId={null}
          depth={1}
          currentId={currentId}
        />
      </ul>
      <NewFolderForm parentFolder={currentId} />
    </nav>
  );
}

function SubTree(props: {
  folders: FolderNode[];
  parentId: string | null;
  depth: number;
  currentId: string | null;
}) {
  const { folders, parentId, depth, currentId } = props;
  const children = folders
    .filter((f) => (f.parentFolder ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      {children.map((folder) => (
        <li key={folder.id} role="none">
          <TreeItem
            label={folder.name}
            depth={depth}
            active={folder.id === currentId}
            onSelect={() => setSelectedNode(folder)}
          />
          <ul role="group">
            <SubTree
              folders={folders}
              parentId={folder.id}
              depth={depth + 1}
              currentId={currentId}
            />
          </ul>
        </li>
      ))}
    </>
  );
}

function TreeItem(props: {
  label: string;
  depth: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="treeitem"
      aria-selected={props.active}
      onClick={props.onSelect}
      style={{ paddingLeft: `${0.5 + props.depth * 0.75}rem` }}
      className={`w-full truncate rounded-md py-1.5 pr-2 text-left ${
        props.active
          ? "bg-accent text-accent-foreground font-semibold"
          : "hover:bg-muted"
      }`}
    >
      {props.depth === 0 ? "🏬 " : "📁 "}
      {props.label}
    </button>
  );
}
