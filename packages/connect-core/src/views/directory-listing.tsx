import {
  getDriveName,
  makeDriveSlug,
  makeNodeSlug,
  useDocumentById,
  useDriveNodes,
  useLinkProps,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveDocument,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import { isFileNode } from "@powerhousedao/shared/document-drive";
import type { ReactNode } from "react";
import { Component, Fragment, Suspense } from "react";
import type { DriveViewProps } from "../router/route-components.js";
import {
  formatModified,
  IndexRow,
  IndexTable,
  linkClass,
} from "./index-table.js";

function NodeLink(props: {
  drive: DocumentDriveDocument;
  node: Node | undefined;
  children: ReactNode;
}) {
  const link = useLinkProps({
    driveSlug: makeDriveSlug(props.drive),
    nodeSlug: props.node ? makeNodeSlug(props.node) : undefined,
  });
  return (
    <a {...link} className={linkClass}>
      {props.children}
    </a>
  );
}

function HomeLink(props: { children: ReactNode }) {
  const link = useLinkProps(undefined);
  return (
    <a {...link} className={linkClass}>
      {props.children}
    </a>
  );
}

// A row's date is a nicety: it shows "-" when the document can't load.
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? "-" : this.props.children;
  }
}

function DocumentModified({ id }: { id: string }) {
  const [document] = useDocumentById(id);
  return formatModified(document?.header.lastModifiedAtUtcIso);
}

/** The folders from the drive's root down to `folder`. */
function folderPath(nodes: readonly Node[], folder: FolderNode | undefined) {
  const path: Node[] = [];
  for (let node: Node | undefined = folder; node;) {
    path.unshift(node);
    const parentId: string | null | undefined = node.parentFolder;
    node = parentId ? nodes.find((n) => n.id === parentId) : undefined;
  }
  return path;
}

const byKindThenName = (a: Node, b: Node) =>
  a.kind === b.kind
    ? a.name.localeCompare(b.name)
    : a.kind === "folder"
      ? -1
      : 1;

/** Core's drive fallback: a listing of the open folder; an open document shows instead. */
export function DirectoryListing({ drive, folder, children }: DriveViewProps) {
  if (children) return children;
  return <FolderListing drive={drive} folder={folder} />;
}

function FolderListing({
  drive,
  folder,
}: {
  drive: DocumentDriveDocument;
  folder: FolderNode | undefined;
}) {
  const nodes = useDriveNodes(drive.header.id) ?? [];
  const path = folderPath(nodes, folder);
  const parent = path.at(-2);
  const entries = nodes
    .filter((node) => (node.parentFolder ?? null) === (folder?.id ?? null))
    .sort(byKindThenName);
  const title = (
    <>
      Index of /
      <NodeLink drive={drive} node={undefined}>
        {getDriveName(drive)}
      </NodeLink>
      /
      {path.map((node) => (
        <Fragment key={node.id}>
          <NodeLink drive={drive} node={node}>
            {node.name}
          </NodeLink>
          /
        </Fragment>
      ))}
    </>
  );
  return (
    <IndexTable title={title} label="Directory listing">
      <IndexRow
        name={
          folder ? (
            <NodeLink drive={drive} node={parent}>
              Parent Directory
            </NodeLink>
          ) : (
            <HomeLink>Parent Directory</HomeLink>
          )
        }
        type="-"
        modified="-"
      />
      {entries.map((node) => (
        <IndexRow
          key={node.id}
          name={
            <NodeLink drive={drive} node={node}>
              {node.kind === "folder" ? `${node.name}/` : node.name}
            </NodeLink>
          }
          type={isFileNode(node) ? node.documentType : "Folder"}
          modified={
            node.kind === "folder" ? (
              "-"
            ) : (
              <Quiet>
                <Suspense fallback="…">
                  <DocumentModified id={node.id} />
                </Suspense>
              </Quiet>
            )
          }
        />
      ))}
    </IndexTable>
  );
}
