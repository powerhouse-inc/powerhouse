import type { FileNode, Node } from "@powerhousedao/shared/document-drive";
import {
  PACKAGE_DOCUMENT_TYPE,
  STAGES,
  type StageDocumentType,
  type StageId,
  type StagePageId,
} from "./layout.js";

export type PackageRow = {
  kind: "package";
  /** The package document's node, when the drive has one. */
  nodeId: string | undefined;
  name: string;
};

export type StageRow = {
  kind: "stage";
  stage: StageId;
  label: string;
  collapsed: boolean;
  /** The types `+` offers; empty hides it. */
  creatable: readonly StageDocumentType[];
};

export type DocumentRow = {
  kind: "document";
  stage: StageId;
  nodeId: string;
  name: string;
  documentType: string;
};

export type PageRow = {
  kind: "page";
  stage: StageId;
  page: StagePageId;
  label: string;
};

export type TreeRow = PackageRow | StageRow | DocumentRow | PageRow;

export type TreeOptions = {
  /** Shown on the package row while the drive has no package document. */
  packageName?: string;
  collapsed?: ReadonlySet<StageId>;
  /** The document types that can be created; undefined offers none. */
  installedTypes?: readonly string[];
};

export const PACKAGE_FALLBACK_NAME = "Package";

function fileNodes(nodes: readonly Node[]): FileNode[] {
  return nodes.filter((node): node is FileNode => node.kind === "file");
}

/** The drive's package document: the first by name, then id. */
export function findPackageNode(nodes: readonly Node[]): FileNode | undefined {
  return fileNodes(nodes)
    .filter((node) => node.documentType === PACKAGE_DOCUMENT_TYPE)
    .sort(byNameThenId)[0];
}

function byNameThenId(a: FileNode, b: FileNode): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

/** A stage's documents, wherever they are filed: by type order, then name. */
export function stageDocuments(
  nodes: readonly Node[],
  types: readonly StageDocumentType[],
): FileNode[] {
  const files = fileNodes(nodes);
  return types.flatMap((type) =>
    files
      .filter((node) => node.documentType === type.documentType)
      .sort(byNameThenId),
  );
}

/** The types of a stage that `+` can create with the installed models. */
export function creatableTypes(
  types: readonly StageDocumentType[],
  installedTypes: readonly string[] | undefined,
): StageDocumentType[] {
  if (!installedTypes) return [];
  return types.filter((type) => installedTypes.includes(type.documentType));
}

/** Whether the drive holds a document of any stage. */
export function hasSpecifications(nodes: readonly Node[]): boolean {
  return STAGES.some(
    (stage) => stageDocuments(nodes, stage.documentTypes).length > 0,
  );
}

/** The explorer's rows, top to bottom. */
export function buildTree(
  nodes: readonly Node[],
  options: TreeOptions = {},
): TreeRow[] {
  const packageNode = findPackageNode(nodes);
  const rows: TreeRow[] = [
    {
      kind: "package",
      nodeId: packageNode?.id,
      name:
        packageNode?.name.trim() ||
        options.packageName?.trim() ||
        PACKAGE_FALLBACK_NAME,
    },
  ];
  for (const stage of STAGES) {
    const collapsed = options.collapsed?.has(stage.id) ?? false;
    rows.push({
      kind: "stage",
      stage: stage.id,
      label: stage.label,
      collapsed,
      creatable: creatableTypes(stage.documentTypes, options.installedTypes),
    });
    if (collapsed) continue;
    for (const node of stageDocuments(nodes, stage.documentTypes)) {
      const type = stage.documentTypes.find(
        (t) => t.documentType === node.documentType,
      );
      rows.push({
        kind: "document",
        stage: stage.id,
        nodeId: node.id,
        name: node.name.trim() || type?.label || node.documentType,
        documentType: node.documentType,
      });
    }
    for (const page of stage.pages) {
      if (page.parent) continue;
      rows.push({
        kind: "page",
        stage: stage.id,
        page: page.id,
        label: page.label,
      });
    }
  }
  return rows;
}
