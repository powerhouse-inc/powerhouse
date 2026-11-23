import { CreateDocumentWithTypeModal } from "@powerhousedao/design-system/connect";
import {
  addDocument,
  preloadEditorModule,
  useDocumentModelModules,
  useEditorModules,
  useSelectedNode,
  useSetSelectedNode,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveDocument,
  Node,
} from "@powerhousedao/shared/document-drive";
import { useMemo, useState, type ReactNode } from "react";
import {
  PACKAGE_DOCUMENT_TYPE,
  treePageFor,
  type StageDocumentType,
  type StageId,
  type StagePageId,
} from "./layout.js";
import { Placeholder } from "./Placeholder.js";
import { buildTree, hasSpecifications, type TreeRow } from "./tree.js";

export const NO_SPECIFICATIONS =
  "No specifications yet. Ask the agent for a document model, an editor or an app.";
export const NOTHING_SELECTED = "Select a document";

export type CreateDocumentInput = {
  name: string;
  documentType: string;
  version?: number;
};

export type VetraExplorerProps = {
  /** The specification drive. */
  document: DocumentDriveDocument;
  /** The open document's editor, as a drive app receives it. */
  children?: ReactNode;
  /** The package row's name while the drive has no package document. */
  packageName?: string;
  /** The Vetra Labs screenshot of each Build and Deploy page. */
  pageImages?: Partial<Record<StagePageId, string>>;
  /** Where the placeholder pages' "Open in Vetra Labs" leads. */
  labsUrl?: string;
  /** Creates a document in the drive; defaults to the app's `addDocument`. */
  createDocument?: (input: CreateDocumentInput) => Promise<Node | undefined>;
};

const ROW =
  "flex h-7 w-full items-center rounded-sm pr-2 text-left text-sm hover:bg-accent";
const ROW_SELECTED = "bg-accent font-medium ring-1 ring-border";

/**
 * The stage tree of a package's specification drive beside the open document:
 * the package row, then Ideate, Specify, Build and Deploy. Documents are filed
 * by type, wherever they sit in the drive.
 */
export function VetraExplorer({
  document,
  children,
  packageName,
  pageImages,
  labsUrl,
  createDocument,
}: VetraExplorerProps) {
  const driveId = document.header.id;
  const nodes = document.state.global.nodes;
  const setSelectedNode = useSetSelectedNode();
  const selectedId = useSelectedNode()?.id;
  const modules = useDocumentModelModules();
  const editorModules = useEditorModules();
  const { isAllowedToCreateDocuments } = useUserPermissions();

  const [collapsed, setCollapsed] = useState<ReadonlySet<StageId>>(new Set());
  const [page, setPage] = useState<StagePageId | null>(null);
  const [creating, setCreating] = useState<readonly StageDocumentType[] | null>(
    null,
  );
  // The dialog keeps its selected type while it closes, so its list must not empty.
  const [dialogTypes, setDialogTypes] = useState<readonly StageDocumentType[]>(
    [],
  );
  if (creating && creating !== dialogTypes) setDialogTypes(creating);

  // An opened document takes the place of a Build or Deploy page.
  const [lastSelectedId, setLastSelectedId] = useState(selectedId);
  if (lastSelectedId !== selectedId) {
    setLastSelectedId(selectedId);
    if (selectedId) setPage(null);
  }

  const installedTypes = useMemo(
    () =>
      isAllowedToCreateDocuments
        ? modules?.map((module) => module.documentModel.global.id)
        : undefined,
    [modules, isAllowedToCreateDocuments],
  );
  const rows = useMemo(
    () => buildTree(nodes, { packageName, collapsed, installedTypes }),
    [nodes, packageName, collapsed, installedTypes],
  );

  const create =
    createDocument ??
    (({ name, documentType, version }: CreateDocumentInput) =>
      addDocument(
        driveId,
        name,
        documentType,
        undefined,
        undefined,
        undefined,
        undefined,
        version,
      ));

  function createAndOpen(input: CreateDocumentInput) {
    setCreating(null);
    create(input).then((node) => {
      if (node) {
        setPage(null);
        setSelectedNode(node);
      }
    }, console.error);
  }

  function openDocument(nodeId: string) {
    setPage(null);
    setSelectedNode(nodes.find((node) => node.id === nodeId) ?? nodeId);
  }

  function openPage(next: StagePageId) {
    setPage(next);
    if (selectedId) setSelectedNode(undefined);
  }

  function toggleStage(stage: StageId) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(stage)) next.add(stage);
      return next;
    });
  }

  function preloadEditors(documentType: string) {
    editorModules
      ?.filter((module) => module.documentTypes.includes(documentType))
      .forEach((module) => void preloadEditorModule(module));
  }

  const content = children ? (
    children
  ) : page ? (
    <Placeholder
      page={page}
      image={pageImages?.[page]}
      labsUrl={labsUrl}
      onOpenPage={openPage}
    />
  ) : (
    <div
      data-explorer-empty
      className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground"
    >
      {hasSpecifications(nodes) ? NOTHING_SELECTED : NO_SPECIFICATIONS}
    </div>
  );

  return (
    <div className="flex size-full min-h-0 bg-background text-foreground">
      <nav
        aria-label="Specifications"
        className="flex w-[220px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-card p-2"
      >
        {rows.map((row) => (
          <ExplorerRow
            key={rowKey(row)}
            row={row}
            selected={
              row.kind === "page"
                ? !children && page !== null && treePageFor(page) === row.page
                : row.kind !== "stage" &&
                  row.nodeId !== undefined &&
                  row.nodeId === selectedId
            }
            canCreatePackage={
              installedTypes?.includes(PACKAGE_DOCUMENT_TYPE) ?? false
            }
            onOpenDocument={openDocument}
            onOpenPage={openPage}
            onToggleStage={toggleStage}
            onCreate={setCreating}
            onCreatePackage={(name) =>
              createAndOpen({ name, documentType: PACKAGE_DOCUMENT_TYPE })
            }
          />
        ))}
      </nav>
      <div className="relative min-h-0 min-w-0 flex-1 overflow-auto">
        {content}
      </div>
      <CreateDocumentWithTypeModal
        documentTypes={dialogTypes.map((type) => ({
          documentType: type.documentType,
          name: type.label,
        }))}
        onCreate={createAndOpen}
        onOpenChange={(open) => {
          if (!open) setCreating(null);
        }}
        onTypeSelected={preloadEditors}
        open={creating !== null}
      />
    </div>
  );
}

function rowKey(row: TreeRow): string {
  switch (row.kind) {
    case "package":
      return "package";
    case "stage":
      return `stage:${row.stage}`;
    case "document":
      return `document:${row.nodeId}`;
    case "page":
      return `page:${row.page}`;
  }
}

function ExplorerRow({
  row,
  selected,
  canCreatePackage,
  onOpenDocument,
  onOpenPage,
  onToggleStage,
  onCreate,
  onCreatePackage,
}: {
  row: TreeRow;
  selected: boolean;
  canCreatePackage: boolean;
  onOpenDocument: (nodeId: string) => void;
  onOpenPage: (page: StagePageId) => void;
  onToggleStage: (stage: StageId) => void;
  onCreate: (types: readonly StageDocumentType[]) => void;
  onCreatePackage: (name: string) => void;
}) {
  const current = selected ? ROW_SELECTED : "";
  switch (row.kind) {
    case "package": {
      const { nodeId } = row;
      if (nodeId) {
        return (
          <button
            type="button"
            data-row="package"
            aria-current={selected || undefined}
            onClick={() => onOpenDocument(nodeId)}
            className={`${ROW} pl-2 font-medium ${current}`}
          >
            <span className="truncate">{row.name}</span>
          </button>
        );
      }
      return (
        <div data-row="package" className="flex h-7 items-center px-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">
            {row.name}
          </span>
          {canCreatePackage ? (
            <AddButton
              label="Add the package document"
              onClick={() => onCreatePackage(row.name)}
            />
          ) : null}
        </div>
      );
    }
    case "stage":
      return (
        <div
          data-row="stage"
          data-stage={row.stage}
          className="flex h-7 items-center"
        >
          <button
            type="button"
            aria-expanded={!row.collapsed}
            onClick={() => onToggleStage(row.stage)}
            className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-sm px-2 text-left text-sm text-muted-foreground hover:bg-accent"
          >
            <span aria-hidden className="w-2 text-[10px]">
              {row.collapsed ? "▸" : "▾"}
            </span>
            <span className="truncate">{row.label}</span>
          </button>
          {row.creatable.length > 0 ? (
            <AddButton
              label={`New ${row.label} document`}
              onClick={() => onCreate(row.creatable)}
            />
          ) : null}
        </div>
      );
    case "document":
      return (
        <button
          type="button"
          data-row="document"
          data-document-type={row.documentType}
          aria-current={selected || undefined}
          onClick={() => onOpenDocument(row.nodeId)}
          className={`${ROW} pl-6 ${current}`}
        >
          <span className="truncate">{row.name}</span>
        </button>
      );
    case "page":
      return (
        <button
          type="button"
          data-row="page"
          data-page={row.page}
          aria-current={selected || undefined}
          onClick={() => onOpenPage(row.page)}
          className={`${ROW} pl-6 ${current}`}
        >
          <span className="truncate">{row.label}</span>
        </button>
      );
  }
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-6 shrink-0 items-center justify-center rounded-sm text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      +
    </button>
  );
}
