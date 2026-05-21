import type {
  Action,
  DocumentModelGlobalState,
  PHDocument,
  Reducer,
} from "@powerhousedao/shared/document-model";
import { kebabCase } from "change-case";
import { documentModelDocumentModelModule } from "document-model";
import { baseSaveToFile } from "document-model/node";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/* Import from gen/ + actions.ts directly (not the top-level barrel) so we
 * don't pull in `hooks.ts`, which depends on `@powerhousedao/reactor-browser`
 * (a browser-only module that breaks Node-side spec tooling). */
import appModuleSpec from "../document-models/app-module/app-module.json" with { type: "json" };
import { actions as appModuleActions } from "../document-models/app-module/v1/actions.js";
import {
  appModuleDocumentType,
  createAppModuleDocument,
  reducer as appModuleReducer,
  utils as appModuleUtils,
} from "../document-models/app-module/v1/gen/index.js";
import documentEditorSpec from "../document-models/document-editor/document-editor.json" with { type: "json" };
import { actions as documentEditorActions } from "../document-models/document-editor/v1/actions.js";
import {
  createDocumentEditorDocument,
  documentEditorDocumentType,
  reducer as documentEditorReducer,
  utils as documentEditorUtils,
} from "../document-models/document-editor/v1/gen/index.js";
import processorModuleSpec from "../document-models/processor-module/processor-module.json" with { type: "json" };
import { actions as processorModuleActions } from "../document-models/processor-module/v1/actions.js";
import {
  createProcessorModuleDocument,
  processorModuleDocumentType,
  reducer as processorModuleReducer,
  utils as processorModuleUtils,
} from "../document-models/processor-module/v1/gen/index.js";
import subgraphModuleSpec from "../document-models/subgraph-module/subgraph-module.json" with { type: "json" };
import { actions as subgraphModuleActions } from "../document-models/subgraph-module/v1/actions.js";
import {
  createSubgraphModuleDocument,
  subgraphModuleDocumentType,
  reducer as subgraphModuleReducer,
  utils as subgraphModuleUtils,
} from "../document-models/subgraph-module/v1/gen/index.js";

export const SPECS_DIRNAME = "specs";

const documentModelDocumentType = "powerhouse/document-model";

type ActionsModule = Record<string, (input?: any) => Action>;

type SpecEntry = {
  documentType: string;
  subdir: string;
  reducer: Reducer<any>;
  utils: { fileExtension: string };
  actions: ActionsModule;
  createDocument: (state?: any) => PHDocument;
  jsonSpec: DocumentModelGlobalState;
};

const SPECS: Record<string, SpecEntry> = {
  [documentModelDocumentType]: {
    documentType: documentModelDocumentType,
    subdir: "document-models",
    reducer: documentModelDocumentModelModule.reducer,
    utils: documentModelDocumentModelModule.utils,
    actions: documentModelDocumentModelModule.actions as ActionsModule,
    createDocument: documentModelDocumentModelModule.utils.createDocument,
    jsonSpec: documentModelDocumentModelModule.documentModel
      .global as DocumentModelGlobalState,
  },
  [documentEditorDocumentType]: {
    documentType: documentEditorDocumentType,
    subdir: "editors",
    reducer: documentEditorReducer as Reducer<any>,
    utils: documentEditorUtils,
    actions: documentEditorActions as unknown as ActionsModule,
    createDocument: createDocumentEditorDocument as (state?: any) => PHDocument,
    jsonSpec: documentEditorSpec as unknown as DocumentModelGlobalState,
  },
  [processorModuleDocumentType]: {
    documentType: processorModuleDocumentType,
    subdir: "processors",
    reducer: processorModuleReducer as Reducer<any>,
    utils: processorModuleUtils,
    actions: processorModuleActions as unknown as ActionsModule,
    createDocument: createProcessorModuleDocument as (
      state?: any,
    ) => PHDocument,
    jsonSpec: processorModuleSpec as unknown as DocumentModelGlobalState,
  },
  [subgraphModuleDocumentType]: {
    documentType: subgraphModuleDocumentType,
    subdir: "subgraphs",
    reducer: subgraphModuleReducer as Reducer<any>,
    utils: subgraphModuleUtils,
    actions: subgraphModuleActions as unknown as ActionsModule,
    createDocument: createSubgraphModuleDocument as (state?: any) => PHDocument,
    jsonSpec: subgraphModuleSpec as unknown as DocumentModelGlobalState,
  },
  [appModuleDocumentType]: {
    documentType: appModuleDocumentType,
    subdir: "apps",
    reducer: appModuleReducer as Reducer<any>,
    utils: appModuleUtils,
    actions: appModuleActions as unknown as ActionsModule,
    createDocument: createAppModuleDocument as (state?: any) => PHDocument,
    jsonSpec: appModuleSpec as unknown as DocumentModelGlobalState,
  },
};

export function getSpecEntry(documentType: string): SpecEntry {
  const entry = SPECS[documentType];
  if (!entry) {
    throw new Error(`No spec handler registered for "${documentType}"`);
  }
  return entry;
}

export function listSpecDocumentTypes(): string[] {
  return Object.keys(SPECS);
}

/** Returns the directory that holds specs for a given document type. */
export function specDir(projectDir: string, documentType: string): string {
  return join(projectDir, SPECS_DIRNAME, getSpecEntry(documentType).subdir);
}

/** Deterministic path for a doc-type + display name (without the `.phd` zip wrapper). */
export function specPath(
  projectDir: string,
  documentType: string,
  name: string,
): string {
  const entry = getSpecEntry(documentType);
  const baseName = kebabCase(name);
  const ext = stripLeadingDot(entry.utils.fileExtension);
  return join(specDir(projectDir, documentType), `${baseName}.${ext}.phd`);
}

/* baseSaveToFile expects the extension WITHOUT a leading dot ("phdm"), while the
 * document-model utils export it WITH one (".phdm"). Normalize so we can pass
 * either through. */
export function stripLeadingDot(ext: string): string {
  return ext.startsWith(".") ? ext.slice(1) : ext;
}

/** Saves a document into `<projectDir>/specs/<subdir>/<kebab-name>.<ext>.phd`. */
export async function saveSpec(
  doc: PHDocument,
  projectDir: string,
): Promise<string> {
  const entry = getSpecEntry(doc.header.documentType);
  const dir = specDir(projectDir, doc.header.documentType);
  await mkdir(dir, { recursive: true });
  const name = kebabCase(doc.header.name || "untitled");
  return baseSaveToFile(
    doc,
    dir,
    stripLeadingDot(entry.utils.fileExtension),
    name,
  );
}
