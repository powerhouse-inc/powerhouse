// Router-free resolution of a drive route's slugs; hosts map the result to their router.
import type {
  DocumentDriveDocument,
  Node,
} from "@powerhousedao/shared/document-drive";
import { isFileNode } from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import type { EditorModule } from "document-model";
import { DEFAULT_DRIVE_EDITOR_ID, DRIVE_DOCUMENT_TYPES } from "../constants.js";
import type { PHStore } from "../hooks/ph-store.js";
import { preloadEditorModule } from "../utils/preload-editor.js";
import {
  extractDriveIdFromSlug,
  extractNodeIdFromSlug,
  findDriveBySlug,
  makeNodeSlug,
} from "../utils/url.js";
import type { DriveArrivals } from "./drive-arrivals.js";

export type DriveRouteResult =
  | { kind: "drive"; driveId: string; nodeId?: string }
  | { kind: "drive-not-found" }
  | { kind: "node-not-found"; driveId: string };

export type ResolveDriveRouteOptions = {
  store: PHStore;
  /** Without it, a missing drive is never waited for. */
  arrivals?: DriveArrivals;
  driveSlug: string;
  nodeSlug?: string;
  signal: AbortSignal;
  /** A preload only uses what is already here. */
  preload?: boolean;
};

/** How long a navigation waits for its document and editor before it shows;
 * past it the view commits and renders them as they load. */
export const PREFETCH_WAIT_MS = 3_000;

// Cap on waiting for a drive, so a wedged sync can't pin the route.
export const DRIVE_ARRIVAL_MAX_WAIT_MS = 15_000;

/** A listed drive by slug, id, or a `<name>-<id>` slug's trailing id. */
export function findDriveBySlugOrId(
  store: PHStore,
  ref: string,
): DocumentDriveDocument | undefined {
  return findDriveBySlug(store.drives, ref);
}

function findNode(drive: DocumentDriveDocument | undefined, nodeId: string) {
  return drive?.state.global.nodes.find((node) => node.id === nodeId);
}

/** Resolves with `read()` once it is defined, nothing is still arriving, the
 * signal aborts or the cap passes. */
export function waitForArrival<T>(
  read: () => T | undefined,
  arrivals: DriveArrivals | undefined,
  signal: AbortSignal,
  maxWaitMs = DRIVE_ARRIVAL_MAX_WAIT_MS,
): Promise<T | undefined> {
  const value = read();
  if (value !== undefined || !arrivals?.isPending() || signal.aborted) {
    return Promise.resolve(value);
  }
  return new Promise((resolve) => {
    let unsubscribe = () => {};
    const finish = (result: T | undefined) => {
      clearTimeout(timer);
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = () => finish(undefined);
    const timer = setTimeout(onAbort, maxWaitMs);
    signal.addEventListener("abort", onAbort, { once: true });
    unsubscribe = arrivals.subscribe(() => {
      const next = read();
      if (next !== undefined || !arrivals.isPending()) finish(next);
    });
  });
}

/** Asks the reactor directly: a just-created drive may not be listed yet. */
export async function fetchDrive(
  store: PHStore,
  ref: string,
  signal?: AbortSignal,
) {
  try {
    const document = await store.reactorClient?.get(ref, undefined, signal);
    const isDrive = (DRIVE_DOCUMENT_TYPES as readonly string[]).includes(
      document?.header.documentType ?? "",
    );
    return isDrive ? (document as DocumentDriveDocument) : undefined;
  } catch {
    return undefined;
  }
}

function editorModules(store: PHStore): EditorModule[] {
  return (
    store.vetraPackageManager?.packages.flatMap((pkg) => pkg.editors) ?? []
  );
}

async function preloadModule(module: EditorModule | undefined) {
  try {
    await (module ? preloadEditorModule(module) : undefined);
  } catch {
    // The editor renders its own load error.
  }
}

function documentEditor(store: PHStore, document: PHDocument) {
  const { documentType, meta } = document.header;
  const modules = editorModules(store);
  return (
    modules.find((module) => module.config.id === meta?.preferredEditor) ??
    modules.find((module) => module.documentTypes.includes(documentType))
  );
}

function driveApp(store: PHStore, drive: DocumentDriveDocument) {
  const id = drive.header.meta?.preferredEditor ?? DEFAULT_DRIVE_EDITOR_ID;
  return editorModules(store).find((module) => module.config.id === id);
}

/** Loads a drive's app module so its view renders without suspending;
 * undefined when it is already loaded, so a warm open waits on nothing. */
export function preloadDriveApp(store: PHStore, drive: DocumentDriveDocument) {
  const module = driveApp(store, drive);
  // The editor renders its own load error.
  return module && preloadEditorModule(module)?.then(noop, noop);
}

const noop = () => undefined;

/** Warms a file node's document and its editor module. */
export async function prefetchDocument(store: PHStore, node: Node) {
  if (!isFileNode(node)) return;
  try {
    const document = await store.documentCache?.get(node.id);
    if (document) await preloadModule(documentEditor(store, document));
  } catch {
    // The editor shows the document's load error.
  }
}

/** Resolves once `work` settles, `ms` pass or `signal` aborts. */
function settleWithin(
  work: Promise<unknown>,
  ms: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    work.then(done, done);
  });
}

/** Resolves a drive route's slugs, waiting for drives that are still syncing,
 * and warms what the resolved view needs. */
export async function resolveDriveRoute(
  options: ResolveDriveRouteOptions,
): Promise<DriveRouteResult> {
  const { store, driveSlug, nodeSlug, signal } = options;
  const arrivals = options.preload ? undefined : options.arrivals;

  const drive =
    (await waitForArrival(
      () => findDriveBySlugOrId(store, driveSlug),
      arrivals,
      signal,
    )) ??
    (await fetchDrive(
      store,
      extractDriveIdFromSlug(driveSlug) ?? driveSlug,
      signal,
    ));
  if (!drive) return { kind: "drive-not-found" };
  const driveId = drive.header.id;
  const appPreload = preloadDriveApp(store, drive);

  if (!nodeSlug) {
    if (appPreload) await settleWithin(appPreload, PREFETCH_WAIT_MS, signal);
    return { kind: "drive", driveId };
  }
  // Ids without a UUID or derived-id shape resolve by the slug the app writes.
  const nodeId =
    extractNodeIdFromSlug(nodeSlug) ??
    drive.state.global.nodes.find(
      (n) => n.id === nodeSlug || makeNodeSlug(n) === nodeSlug,
    )?.id;
  // Only the drive's own remote can still bring its nodes.
  const driveArrivals = arrivals && {
    ...arrivals,
    isPending: () => arrivals.isDrivePending(driveId),
  };
  // A just-created node may not be in the listed drive yet; ask the reactor.
  const node = nodeId
    ? ((await waitForArrival(
        () => findNode(findDriveBySlugOrId(store, driveId) ?? drive, nodeId),
        driveArrivals,
        signal,
      )) ?? findNode(await fetchDrive(store, driveId, signal), nodeId))
    : undefined;
  if (!node) return { kind: "node-not-found", driveId };
  await settleWithin(
    Promise.all([appPreload, prefetchDocument(store, node)]),
    PREFETCH_WAIT_MS,
    signal,
  );
  return { kind: "drive", driveId, nodeId: node.id };
}
