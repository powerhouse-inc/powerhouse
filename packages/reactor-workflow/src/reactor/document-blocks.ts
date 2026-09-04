// Host-side core#document-* blocks: create documents and dispatch actions
// through the reactor client. Pieces never get reactor access; these do.
import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import type {
  BlockExecution,
  BlockExecutor,
  BlockResult,
} from "@powerhousedao/reactor-connectors";
import { createAction, type Action, type PHDocument } from "document-model";

export const DOCUMENT_CREATE_BLOCK = "core#document-create";
export const DOCUMENT_DISPATCH_BLOCK = "core#document-dispatch";
export const DOCUMENT_GET_BLOCK = "core#document-get";
export const DOCUMENT_FIND_BLOCK = "core#document-find";
export const DOCUMENT_SCHEMA_BLOCK = "core#document-schema";
export const DOCUMENT_TYPES_BLOCK = "core#document-types";

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";
const DRIVE_DOCUMENT_TYPES = new Set([
  DRIVE_DOCUMENT_TYPE,
  "powerhouse/reactor-drive",
]);

interface DriveTarget {
  driveId: string;
  parentFolder?: string;
}

// Base actions every document type accepts, beyond its model's own.
const BASE_ACTIONS = [
  {
    type: "SET_NAME",
    module: "base",
    inputSchema: "input SetNameInput {\n  name: String!\n}",
  },
];

interface ActionInputConfig {
  type: string;
  input?: unknown;
  scope?: string;
}

export interface DispatchPayload {
  // Present when the payload object named its own target document.
  documentId?: string;
  actions: ActionInputConfig[];
}

export function parseActions(
  value: unknown,
  blockType: string,
): ActionInputConfig[] {
  return parseDispatchPayload(value, blockType).actions;
}

// Accepts an array, a single action object, or JSON text (typically an LLM's
// output, possibly fenced); an object may also carry the target documentId.
export function parseDispatchPayload(
  value: unknown,
  blockType: string,
): DispatchPayload {
  let documentId: string | undefined;
  if (typeof value === "string") {
    const text = value
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/, "")
      .trim();
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(`${blockType}: "actions" is a string but not valid JSON`);
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.documentId === "string") documentId = record.documentId;
    value = Array.isArray(record.actions) ? record.actions : [value];
  }
  if (!Array.isArray(value)) return { documentId, actions: [] };
  const actions = value.map((entry, index) => {
    const record = entry as Record<string, unknown> | null;
    if (!record || typeof record.type !== "string") {
      throw new Error(`${blockType}: actions[${index}] needs a string "type"`);
    }
    return {
      type: record.type,
      input: record.input,
      scope: typeof record.scope === "string" ? record.scope : undefined,
    };
  });
  return { documentId, actions };
}

export interface CreatePayload {
  documentType?: string;
  name?: string;
  actions?: unknown;
}

// {documentType, name, actions?} as an object or as JSON text, possibly fenced.
export function parseCreatePayload(value: unknown): CreatePayload {
  let record = value;
  if (typeof record === "string") {
    const text = record
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/, "")
      .trim();
    if (!text) return {};
    try {
      record = JSON.parse(text);
    } catch {
      throw new Error(
        `${DOCUMENT_CREATE_BLOCK}: "payload" is a string but not valid JSON`,
      );
    }
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) return {};
  const entry = record as Record<string, unknown>;
  return {
    documentType:
      typeof entry.documentType === "string" ? entry.documentType : undefined,
    name: typeof entry.name === "string" ? entry.name : undefined,
    actions: entry.actions,
  };
}

// Whitelist for the dispatch block: a comma-separated string, a list of
// names, or a core#document-schema actions array.
function allowedActionTypes(value: unknown): string[] {
  const raw = typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return entry;
      const record = entry as { type?: unknown } | null;
      return typeof record?.type === "string" ? record.type : "";
    })
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Ids fed by an AI step arrive quoted, fenced or wrapped in prose; documents
// are addressed by uuid, so prefer one when the text contains it.
export function resolveDocumentId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  const uuid = UUID.exec(text);
  if (uuid) return uuid[0];
  // Slugs are valid identifiers too, so fall back to the bare text.
  return text.replace(/^["'`]+|["'`]+$/g, "").trim() || undefined;
}

// Reducer failures don't reject execute(); they land on the operations. Fail
// the step when any of the freshly appended operations carries an error.
function assertOperationsApplied(document: PHDocument, count: number): void {
  const operations = Object.values(document.operations).flat();
  const recent = operations
    .sort((a, b) => a.index - b.index)
    .slice(-Math.max(count, 1));
  const failed = recent.find((operation) => operation.error !== undefined);
  if (failed) {
    throw new Error(
      `Action ${failed.action.type} failed: ${failed.error ?? "unknown error"}`,
    );
  }
}

export class DocumentBlockExecutor implements BlockExecutor {
  constructor(private readonly subgraph: BaseSubgraph) {}

  async execute(execution: BlockExecution): Promise<BlockResult> {
    const config = (execution.config ?? {}) as Record<string, unknown>;
    if (execution.blockType === DOCUMENT_CREATE_BLOCK) {
      return this.createDocument(config);
    }
    if (execution.blockType === DOCUMENT_DISPATCH_BLOCK) {
      return this.dispatchActions(config);
    }
    if (execution.blockType === DOCUMENT_GET_BLOCK) {
      return this.getDocument(config);
    }
    if (execution.blockType === DOCUMENT_FIND_BLOCK) {
      return this.findDocuments(config);
    }
    if (execution.blockType === DOCUMENT_SCHEMA_BLOCK) {
      return this.documentSchema(config);
    }
    if (execution.blockType === DOCUMENT_TYPES_BLOCK) {
      return this.documentTypes();
    }
    throw new Error(`Unsupported document block "${execution.blockType}"`);
  }

  private buildActions(configs: ActionInputConfig[]): Action[] {
    return configs.map((entry) =>
      createAction(
        entry.type,
        entry.input,
        undefined,
        undefined,
        entry.scope ?? "global",
      ),
    );
  }

  // The installed document models, so a step can offer what is creatable.
  private async documentTypes(): Promise<BlockResult> {
    const page = await this.subgraph.reactorClient.getDocumentModelModules();
    const types = page.results
      .map((module) => module.documentModel.global)
      .map((model) => ({ documentType: model.id, name: model.name }))
      .filter((entry) => entry.documentType)
      .sort((a, b) => a.documentType.localeCompare(b.documentType));
    return { output: { count: types.length, types } };
  }

  // Where a new document's drive node belongs, when the parent implies one.
  private async resolveDriveTarget(
    parentId: string,
  ): Promise<DriveTarget | null> {
    const client = this.subgraph.reactorClient;
    try {
      const parent = await client.get<PHDocument>(parentId);
      // A plain document parent gets a relationship only, as before.
      return DRIVE_DOCUMENT_TYPES.has(parent.header.documentType)
        ? { driveId: parent.header.id }
        : null;
    } catch {
      // Not a document at all: it may be a folder node inside a drive.
      return this.findFolderDrive(parentId);
    }
  }

  private async findFolderDrive(nodeId: string): Promise<DriveTarget | null> {
    const client = this.subgraph.reactorClient;
    const drives = await this.findByType(DRIVE_DOCUMENT_TYPE);
    for (const drive of drives) {
      try {
        const node = await client.drives.getNode(drive.header.id, nodeId);
        if (node.kind === "folder") {
          return { driveId: drive.header.id, parentFolder: nodeId };
        }
      } catch {
        // Not in this drive.
      }
    }
    return null;
  }

  // config: { documentType?, name?, parentId?, actions?, payload? }
  private async createDocument(
    config: Record<string, unknown>,
  ): Promise<BlockResult> {
    // A payload (typically model output) can name the type and the document.
    const payload = parseCreatePayload(config.payload);
    const documentType =
      (typeof config.documentType === "string" && config.documentType) ||
      payload.documentType;
    if (!documentType) {
      throw new Error(
        `${DOCUMENT_CREATE_BLOCK}: "documentType" is required, in the config or the payload`,
      );
    }
    const name =
      (typeof config.name === "string" && config.name) || payload.name;
    const client = this.subgraph.reactorClient;
    const parentId =
      typeof config.parentId === "string" && config.parentId
        ? config.parentId
        : undefined;
    const target = parentId ? await this.resolveDriveTarget(parentId) : null;

    let document: PHDocument;
    if (target) {
      // createEmpty only records the parent relationship; a drive also needs an
      // ADD_FILE node, or the document is created but invisible in the drive.
      const module = await client.getDocumentModelModule(documentType);
      const empty = module.utils.createDocument() as PHDocument;
      // The node name comes from the header, so set it before the file lands.
      if (name) empty.header.name = name;
      document = await client.drives.addFile<PHDocument>(
        target.driveId,
        empty,
        target.parentFolder,
      );
    } else {
      document = await client.createEmpty<PHDocument>(documentType, {
        parentIdentifier: parentId,
      });
    }

    const followUps = this.buildActions(
      parseActions(config.actions ?? payload.actions, DOCUMENT_CREATE_BLOCK),
    );
    if (name) {
      followUps.unshift(createAction("SET_NAME", { name }));
    }
    if (followUps.length > 0) {
      document = await client.execute<PHDocument>(
        document.header.id,
        "main",
        followUps,
      );
      assertOperationsApplied(document, followUps.length);
    }

    return {
      output: {
        documentId: document.header.id,
        documentType: document.header.documentType,
        name: document.header.name,
        state: (document.state as Record<string, unknown>).global,
      },
    };
  }

  // config: { documentId?, actions!, allowedActions?, branch? }
  private async dispatchActions(
    config: Record<string, unknown>,
  ): Promise<BlockResult> {
    const payload = parseDispatchPayload(
      config.actions,
      DOCUMENT_DISPATCH_BLOCK,
    );
    const documentId =
      resolveDocumentId(config.documentId) ??
      resolveDocumentId(payload.documentId);
    if (!documentId) {
      throw new Error(
        `${DOCUMENT_DISPATCH_BLOCK}: "documentId" is required, in the config or the actions payload`,
      );
    }
    // Enforced, not merely suggested: the payload may come from an LLM.
    const allowed = allowedActionTypes(config.allowedActions);
    const rejected = allowed.length
      ? payload.actions.filter((entry) => !allowed.includes(entry.type))
      : [];
    if (rejected.length > 0) {
      throw new Error(
        `${DOCUMENT_DISPATCH_BLOCK}: action(s) not allowed here: ${[
          ...new Set(rejected.map((entry) => entry.type)),
        ].join(", ")}`,
      );
    }
    const actions = this.buildActions(payload.actions);
    if (actions.length === 0) {
      throw new Error(
        `${DOCUMENT_DISPATCH_BLOCK}: "actions" must be a non-empty list`,
      );
    }
    const branch = typeof config.branch === "string" ? config.branch : "main";
    const document = await this.subgraph.reactorClient.execute<PHDocument>(
      documentId,
      branch,
      actions,
    );
    assertOperationsApplied(document, actions.length);

    return {
      output: {
        documentId: document.header.id,
        documentType: document.header.documentType,
        name: document.header.name,
        state: (document.state as Record<string, unknown>).global,
      },
    };
  }

  // config: { documentId!, branch? }
  private async getDocument(
    config: Record<string, unknown>,
  ): Promise<BlockResult> {
    const documentId = resolveDocumentId(config.documentId);
    if (!documentId) {
      throw new Error(`${DOCUMENT_GET_BLOCK}: "documentId" is required`);
    }
    const document =
      await this.subgraph.reactorClient.get<PHDocument>(documentId);
    return { output: documentSummary(document, true) };
  }

  private async findByType(type: string): Promise<PHDocument[]> {
    try {
      const page = await this.subgraph.reactorClient.find({ type }, undefined, {
        cursor: "",
        limit: 100,
      });
      return page.results;
    } catch {
      // One unreadable model must not sink a whole-reactor sweep.
      return [];
    }
  }

  // config: { documentType?, parentId?, name?, limit? }
  private async findDocuments(
    config: Record<string, unknown>,
  ): Promise<BlockResult> {
    const documentType =
      typeof config.documentType === "string" && config.documentType
        ? config.documentType
        : undefined;
    const parentId =
      typeof config.parentId === "string" && config.parentId
        ? config.parentId
        : undefined;
    const limit = Math.min(
      Math.max(typeof config.limit === "number" ? config.limit : 25, 1),
      100,
    );
    const client = this.subgraph.reactorClient;
    let results: PHDocument[];
    if (documentType) {
      results = await this.findByType(documentType);
    } else if (parentId) {
      const page = await client.find({ parentId }, undefined, {
        cursor: "",
        limit: 100,
      });
      results = page.results;
    } else {
      // The index rejects an empty filter, so sweep every installed type.
      const modules = await client.getDocumentModelModules();
      const types = [
        ...new Set(
          modules.results
            .map((module) => module.documentModel.global.id)
            .filter(Boolean),
        ),
      ];
      const pages = await Promise.all(
        types.map((type) => this.findByType(type)),
      );
      results = pages.flat();
    }
    // The index filters by type only; names are matched here.
    const needle =
      typeof config.name === "string" ? config.name.trim().toLowerCase() : "";
    const seen = new Set<string>();
    const documents = results
      .filter((document) => {
        if (seen.has(document.header.id)) return false;
        seen.add(document.header.id);
        return true;
      })
      .map((document) => documentSummary(document, false))
      .filter(
        (summary) => !needle || summary.name.toLowerCase().includes(needle),
      )
      .slice(0, limit);
    return { output: { count: documents.length, documents } };
  }

  // config: { documentType!, actionType? }
  private async documentSchema(
    config: Record<string, unknown>,
  ): Promise<BlockResult> {
    let documentType =
      typeof config.documentType === "string" ? config.documentType : "";
    // A document id is accepted in place of a type, for expression-fed steps.
    const fromId = resolveDocumentId(config.documentId);
    if (!documentType && fromId) {
      const document =
        await this.subgraph.reactorClient.get<PHDocument>(fromId);
      documentType = document.header.documentType;
    }
    if (!documentType) {
      throw new Error(`${DOCUMENT_SCHEMA_BLOCK}: "documentType" is required`);
    }
    const module =
      await this.subgraph.reactorClient.getDocumentModelModule(documentType);
    const model = module.documentModel.global;
    const latest = model.specifications.at(-1);
    const actions = [
      ...(latest?.modules ?? []).flatMap((specModule) =>
        specModule.operations
          .filter((operation) => operation.name)
          .map((operation) => ({
            type: operation.name,
            module: specModule.name,
            inputSchema: operation.schema ?? null,
          })),
      ),
      ...BASE_ACTIONS,
    ];
    const only =
      typeof config.actionType === "string" && config.actionType
        ? config.actionType
        : undefined;
    return {
      output: {
        documentType,
        name: model.name,
        stateSchema: latest?.state.global.schema ?? null,
        actions: only
          ? actions.filter((action) => action.type === only)
          : actions,
      },
    };
  }
}

export function documentSummary(document: PHDocument, withState: boolean) {
  const globalState = (document.state as Record<string, unknown>).global;
  const stateName =
    globalState && typeof globalState === "object"
      ? (globalState as Record<string, unknown>).name
      : undefined;
  return {
    documentId: document.header.id,
    documentType: document.header.documentType,
    // Models usually keep the display name in state; header name can lag.
    name:
      (typeof stateName === "string" && stateName) ||
      document.header.name ||
      "",
    slug: document.header.slug,
    ...(withState ? { state: globalState } : {}),
  };
}
