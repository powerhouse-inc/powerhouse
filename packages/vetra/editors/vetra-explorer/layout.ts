import { PACKAGE_DOCUMENT_TYPE } from "../../drive-layout/layout.js";
import { DOCUMENT_TYPES } from "../vetra-drive-app/document-types.js";

/** The package document, the tree's first row. */
export { PACKAGE_DOCUMENT_TYPE };

export type StageId = "ideate" | "specify" | "build" | "deploy";

/** A document type a stage holds, with the label of an unnamed document. */
export type StageDocumentType = {
  documentType: string;
  label: string;
};

/** A Build or Deploy page that is not a document yet. */
export type StagePageId =
  | "versions"
  | "packages"
  | "images"
  | "installers"
  | "environments"
  | "environment";

export type StagePage = {
  id: StagePageId;
  label: string;
  /** Reached from this page instead of from a tree row. */
  parent?: StagePageId;
};

export type Stage = {
  id: StageId;
  label: string;
  /** The document types filed under the stage, in tree order. */
  documentTypes: readonly StageDocumentType[];
  /** The stage's fixed pages, in tree order. */
  pages: readonly StagePage[];
};

/** The stages of a package's specification drive, in tree order. */
export const STAGES: readonly Stage[] = [
  {
    id: "ideate",
    label: "Ideate",
    documentTypes: [
      { documentType: "powerhouse/problem-sheet", label: "Problem" },
      { documentType: "powerhouse/audience-sheet", label: "Audience" },
      { documentType: "powerhouse/brand-sheet", label: "Brand" },
      { documentType: "powerhouse/feature", label: "Feature" },
      {
        documentType: "powerhouse/work-breakdown-structure",
        label: "Work breakdown",
      },
    ],
    pages: [],
  },
  {
    id: "specify",
    label: "Specify",
    documentTypes: [
      { documentType: DOCUMENT_TYPES.documentModel, label: "Document model" },
      { documentType: DOCUMENT_TYPES.documentEditor, label: "Document editor" },
      { documentType: DOCUMENT_TYPES.documentApp, label: "App" },
      { documentType: DOCUMENT_TYPES.documentSubgraph, label: "Subgraph" },
      { documentType: DOCUMENT_TYPES.documentProcessor, label: "Processor" },
    ],
    pages: [],
  },
  {
    id: "build",
    label: "Build",
    documentTypes: [],
    pages: [
      { id: "versions", label: "Versions" },
      { id: "packages", label: "Packages" },
      { id: "images", label: "Images" },
      { id: "installers", label: "Installers" },
    ],
  },
  {
    id: "deploy",
    label: "Deploy",
    documentTypes: [],
    pages: [
      { id: "environments", label: "Environments" },
      { id: "environment", label: "Environment", parent: "environments" },
    ],
  },
];

/** Every document type the explorer files, the package document included. */
export const EXPLORER_DOCUMENT_TYPES: readonly string[] = [
  PACKAGE_DOCUMENT_TYPE,
  ...STAGES.flatMap((stage) =>
    stage.documentTypes.map((type) => type.documentType),
  ),
];

export function stageById(id: StageId): Stage {
  const stage = STAGES.find((s) => s.id === id);
  if (!stage) throw new Error(`Unknown stage: ${id}`);
  return stage;
}

/** The stage a document type is filed under, if any. */
export function stageForDocumentType(documentType: string): Stage | undefined {
  return STAGES.find((stage) =>
    stage.documentTypes.some((type) => type.documentType === documentType),
  );
}

/** A page and its stage, by the page's id. */
export function findStagePage(
  id: StagePageId,
): { stage: Stage; page: StagePage } | undefined {
  for (const stage of STAGES) {
    const page = stage.pages.find((p) => p.id === id);
    if (page) return { stage, page };
  }
  return undefined;
}

/** The tree row that stays selected while `id` shows. */
export function treePageFor(id: StagePageId): StagePageId {
  return findStagePage(id)?.page.parent ?? id;
}
