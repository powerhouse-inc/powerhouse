/**
 * File-backed mirror of reactor-mcp's tool surface. Same function names and
 * input shapes — same agent code works whether it's targeting a live reactor
 * or a `specs/` folder on disk. The "drive id" is the project directory;
 * "document id" is the file path of the spec.
 *
 * See `packages/reactor-mcp/src/tools/reactor.ts` for the canonical schema.
 */
import type {
  Action,
  DocumentModelGlobalState,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { camelCase } from "change-case";
import { baseLoadFromFile } from "document-model/node";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import {
  getSpecEntry,
  listSpecDocumentTypes,
  saveSpec,
  specDir,
  SPECS_DIRNAME,
} from "./specs.js";

export type DocumentModelInfo = {
  name: string;
  type: string;
  description: string;
  extension: string;
  authorName: string;
  authorWebsite: string;
};

/** Mirrors reactor-mcp `getDocumentModels`. */
export function getDocumentModels(): DocumentModelInfo[] {
  return listSpecDocumentTypes().map((documentType) => {
    const { jsonSpec } = getSpecEntry(documentType);
    return {
      name: jsonSpec.name,
      type: jsonSpec.id,
      description: jsonSpec.description ?? "",
      extension: jsonSpec.extension ?? "",
      authorName: jsonSpec.author?.name ?? "",
      authorWebsite: jsonSpec.author?.website ?? "",
    };
  });
}

/** Mirrors reactor-mcp `getDocumentModelSchema`. Returns the full
 *  `DocumentModelGlobalState` (schema + operations + errors), same payload
 *  shape reactor-mcp serves. */
export function getDocumentModelSchema(
  documentType: string,
): DocumentModelGlobalState {
  return getSpecEntry(documentType).jsonSpec;
}

/** Mirrors reactor-mcp `getDocument`. Path = file location on disk. */
export async function getDocument(path: string): Promise<PHDocument> {
  // We don't know the documentType ahead of time, so try each registered
  // reducer until one loads cleanly. baseLoadFromFile validates against the
  // reducer; the wrong reducer rejects. Try the path's parent directory first
  // as a fast hint (matches our `specs/<subdir>/` convention).
  const subdir = pathSubdir(path);
  const hint = subdir
    ? listSpecDocumentTypes().find((t) => getSpecEntry(t).subdir === subdir)
    : undefined;
  const order = hint
    ? [hint, ...listSpecDocumentTypes().filter((t) => t !== hint)]
    : listSpecDocumentTypes();

  let lastError: unknown;
  for (const documentType of order) {
    const { reducer } = getSpecEntry(documentType);
    try {
      return await baseLoadFromFile(path, reducer);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Failed to load spec at "${path}": no registered reducer accepted it. Last error: ${String(lastError)}`,
  );
}

/** Mirrors reactor-mcp `getDocuments`. `parentId` is the project directory
 *  containing `specs/`. */
export async function getDocuments(
  projectDir: string,
  opts: { documentType?: string } = {},
): Promise<PHDocument[]> {
  const documentTypes = opts.documentType
    ? [opts.documentType]
    : listSpecDocumentTypes();

  const results: PHDocument[] = [];
  for (const documentType of documentTypes) {
    const dir = specDir(projectDir, documentType);
    const exists = await stat(dir).then(
      (s) => s.isDirectory(),
      () => false,
    );
    if (!exists) continue;
    const entries = await readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith(".phd")) continue;
      results.push(await getDocument(join(dir, entry)));
    }
  }
  return results;
}

/** Mirrors reactor-mcp `createDocument`. Returns an in-memory document; the
 *  caller persists with `saveSpec`. */
export function createDocument(
  documentType: string,
  opts: {
    name?: string;
    initialState?: { global?: unknown; local?: unknown };
  } = {},
): PHDocument {
  const entry = getSpecEntry(documentType);
  const doc = entry.createDocument(opts.initialState);
  if (opts.name) doc.header.name = opts.name;
  return doc;
}

export type ActionInput = {
  type: string;
  input?: unknown;
  scope?: string;
};

/** Mirrors reactor-mcp `addActions`. Applies each action via the model's
 *  reducer in order and returns the new document. */
export function addActions(
  doc: PHDocument,
  actions: ActionInput[],
): PHDocument {
  const entry = getSpecEntry(doc.header.documentType);
  let current = doc;
  for (const item of actions) {
    const action = buildAction(entry.actions, item);
    current = entry.reducer(current, action) as PHDocument;
  }
  return current;
}

function buildAction(
  actionsModule: Record<string, (input?: any) => Action>,
  item: ActionInput,
): Action {
  const creatorName = camelCase(item.type);
  const creator = actionsModule[creatorName];
  if (!creator) {
    throw new Error(
      `No action creator found for "${item.type}" (looked up as "${creatorName}")`,
    );
  }
  const action = creator(item.input);
  // Caller may override the scope (creator picks a default).
  if (item.scope) action.scope = item.scope;
  return action;
}

/** Mirrors reactor-mcp `deleteDocument`. Removes the spec file from disk. */
export async function deleteDocument(
  path: string,
): Promise<{ success: boolean }> {
  try {
    await rm(path);
    return { success: true };
  } catch {
    return { success: false };
  }
}

/* Convenience: persist after applying actions. Matches the typical agent
 * loop `getDocument → addActions → saveSpec` from the plan. */
export async function addActionsAndSave(
  path: string,
  projectDir: string,
  actions: ActionInput[],
): Promise<{ doc: PHDocument; savedPath: string }> {
  const doc = await getDocument(path);
  const next = addActions(doc, actions);
  const savedPath = await saveSpec(next, projectDir);
  return { doc: next, savedPath };
}

function pathSubdir(filePath: string): string | undefined {
  const parts = filePath.split(/[/\\]/);
  const i = parts.lastIndexOf(SPECS_DIRNAME);
  if (i < 0 || i + 1 >= parts.length) return undefined;
  return parts[i + 1];
}
