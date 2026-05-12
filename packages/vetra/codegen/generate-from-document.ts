/**
 * Document-driven codegen wrappers. Each function takes a `PHDocument` of the
 * matching vetra type and dispatches to the generic generate* in
 * `@powerhousedao/codegen`. The state→args translation is lifted verbatim from
 * `packages/vetra/processors/codegen/document-handlers/generators/*-generator.ts`
 * so the agent-driven path and the reactor-driven path produce identical
 * output.
 *
 * Callers are responsible for `await project.save()` after one or more
 * `generate*FromDocument` calls — leaving it out here lets a CLI batch
 * multiple specs into a single save.
 */
import {
  generateApp,
  generateDocumentModel,
  generateEditor,
  generateProcessor,
  generateSubgraph,
} from "@powerhousedao/codegen";
import {
  PROCESSOR_APPS,
  type ProcessorApp,
  type ProcessorApps,
} from "@powerhousedao/shared/processors";
import { kebabCase } from "change-case";
import type { Project } from "ts-morph";

/* Import from gen/ directly to bypass the top-level barrel's `hooks.ts`,
 * which pulls in browser-only `@powerhousedao/reactor-browser`. */
import type { AppModuleDocument } from "../document-models/app-module/gen/index.js";
import type {
  DocumentEditorDocument,
  DocumentTypeItem as EditorDocumentTypeItem,
} from "../document-models/document-editor/gen/index.js";
import type {
  DocumentTypeItem as ProcessorDocumentTypeItem,
  ProcessorModuleDocument,
} from "../document-models/processor-module/gen/index.js";
import type { SubgraphModuleDocument } from "../document-models/subgraph-module/gen/index.js";
import type { DocumentModelDocument } from "@powerhousedao/shared/document-model";

export async function generateDocumentModelFromDocument(
  doc: DocumentModelDocument,
  project: Project,
): Promise<void> {
  await generateDocumentModel(doc.state.global, project);
}

export async function generateEditorFromDocument(
  doc: DocumentEditorDocument,
  project: Project,
): Promise<void> {
  const state = doc.state.global;
  const documentTypes = state.documentTypes.map(
    (dt: EditorDocumentTypeItem) => dt.documentType,
  );
  await generateEditor(
    {
      editorName: state.name,
      documentTypes,
      editorId: kebabCase(state.name),
    },
    project,
  );
}

export async function generateProcessorFromDocument(
  doc: ProcessorModuleDocument,
  project: Project,
): Promise<void> {
  const state = doc.state.global;
  // Mirror processor-generator.ts:99-103: document model stores `relational`,
  // codegen expects `relationalDb`.
  let processorType: "analytics" | "relationalDb";
  if (state.type === "analytics") {
    processorType = "analytics";
  } else if (state.type === "relational") {
    processorType = "relationalDb";
  } else {
    throw new Error(`Unsupported processor type: "${state.type}"`);
  }

  const documentTypes = state.documentTypes.map(
    (dt: ProcessorDocumentTypeItem) => dt.documentType,
  );
  const processorApps = state.processorApps;
  if (!isProcessorApps(processorApps)) {
    throw new Error(`Unsupported processor apps: ${processorApps.join(", ")}`);
  }
  await generateProcessor(
    {
      processorName: state.name,
      processorType,
      documentTypes,
      processorApps,
    },
    project,
  );
}

export async function generateSubgraphFromDocument(
  doc: SubgraphModuleDocument,
  project: Project,
): Promise<void> {
  await generateSubgraph(doc.state.global.name, project);
}

export async function generateAppFromDocument(
  doc: AppModuleDocument,
  project: Project,
): Promise<void> {
  const state = doc.state.global;
  await generateApp(
    {
      appName: state.name,
      appId: kebabCase(state.name),
      allowedDocumentTypes: state.allowedDocumentTypes ?? [],
      isDragAndDropEnabled: state.isDragAndDropEnabled,
    },
    project,
  );
}

function isProcessorApps(input: readonly string[]): input is ProcessorApps {
  if (input.length === 0) return false;
  if (new Set(input).size !== input.length) return false;
  if (!input.every((i) => PROCESSOR_APPS.includes(i as ProcessorApp))) {
    return false;
  }
  return true;
}
