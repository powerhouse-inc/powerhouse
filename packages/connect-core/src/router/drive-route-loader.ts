// The drive routes' loaders. Server-safe: they read everything from router context.
import type { DriveArrivals, PHStore } from "@powerhousedao/reactor-browser";
import {
  findDriveBySlugOrId,
  makeDriveSlug,
  makeNodeSlug,
  resolveDriveRoute,
} from "@powerhousedao/reactor-browser";
import { notFound, redirect } from "@tanstack/react-router";

export type ConnectRouterContext = {
  store: PHStore;
  /** Without it the drive route never waits for drives to arrive. */
  arrivals?: DriveArrivals;
  /** Ends every document title; "Connect" without one. */
  appName?: string;
  /** Rendering the loading shell: a layout shows its pendingComponent in place of its page. */
  shell?: boolean;
};

/** A missing drive's not-found data. */
export type DriveNotFoundData = { driveSlug: string };

export function isDriveNotFound(data: unknown): data is DriveNotFoundData {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as { driveSlug?: unknown }).driveSlug === "string"
  );
}

/** What the drive routes resolved their params to. */
export type DriveRouteData = { driveId: string; nodeId?: string };

export type DriveRouteParams = { driveSlug: string; nodeSlug?: string };

export type DriveLoaderOptions = {
  params: DriveRouteParams;
  context: ConnectRouterContext;
  abortController: AbortController;
  preload: boolean;
};

function resolve(options: DriveLoaderOptions, params: DriveRouteParams) {
  return resolveDriveRoute({
    store: options.context.store,
    arrivals: options.context.arrivals,
    driveSlug: params.driveSlug,
    nodeSlug: params.nodeSlug,
    signal: options.abortController.signal,
    preload: options.preload,
  });
}

// At the drive layout, so the 404 takes the drive's place in the layout.
function driveNotFound(driveSlug: string) {
  return notFound({
    routeId: "/_app/d/$driveSlug" as never,
    data: { driveSlug } satisfies DriveNotFoundData,
  });
}

/** The drive layout's loader: the drive, or not found once arrivals settle. */
export async function loadDrive(
  options: DriveLoaderOptions,
): Promise<{ driveId: string }> {
  const { driveSlug } = options.params;
  const result = await resolve(options, { driveSlug });
  if (result.kind === "drive-not-found") {
    // oxlint-disable-next-line typescript/only-throw-error -- router control flow
    throw driveNotFound(driveSlug);
  }
  return { driveId: result.driveId };
}

/** The node route's loader: the drive and the open node. An id or an old name
 * in the URL becomes the current slugs; a missing node leads to its drive. */
export async function loadNode(
  options: DriveLoaderOptions,
): Promise<DriveRouteData> {
  const { params, context, preload } = options;
  const result = await resolve(options, params);
  switch (result.kind) {
    case "drive": {
      const data: DriveRouteData = result.nodeId
        ? { driveId: result.driveId, nodeId: result.nodeId }
        : { driveId: result.driveId };
      const canonical = canonicalParams(context.store, data);
      // An id, an old name or an old drive id in the URL becomes the current slugs.
      if (
        !preload &&
        canonical &&
        (canonical.driveSlug !== params.driveSlug ||
          canonical.nodeSlug !== (params.nodeSlug || undefined))
      ) {
        // oxlint-disable-next-line typescript/only-throw-error -- router control flow
        throw redirectTo(canonical);
      }
      return data;
    }
    case "drive-not-found":
      // oxlint-disable-next-line typescript/only-throw-error -- router control flow
      throw driveNotFound(params.driveSlug);
    case "node-not-found":
      // oxlint-disable-next-line typescript/only-throw-error -- router control flow
      throw redirectTo({
        driveSlug:
          canonicalParams(context.store, { driveId: result.driveId })
            ?.driveSlug ?? params.driveSlug,
        nodeSlug: undefined,
      });
  }
}

// The slugs links write for `data`; unknown while the drive is unlisted.
function canonicalParams(
  store: PHStore,
  data: DriveRouteData,
): DriveRouteParams | undefined {
  const drive = findDriveBySlugOrId(store, data.driveId);
  if (!drive) return undefined;
  if (!data.nodeId) return { driveSlug: makeDriveSlug(drive) };
  const node = drive.state.global.nodes.find((n) => n.id === data.nodeId);
  if (!node) return undefined;
  return { driveSlug: makeDriveSlug(drive), nodeSlug: makeNodeSlug(node) };
}

// In place, with the URL's search params and history state (the opened-from index).
function redirectTo(params: DriveRouteParams) {
  return redirect({
    to: "/d/$driveSlug/{-$nodeSlug}",
    params,
    search: true,
    state: true,
    replace: true,
  });
}
