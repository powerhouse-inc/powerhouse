// The drive route's loader. Server-safe: it reads everything from router context.
import type { DriveArrivals, PHStore } from "@powerhousedao/reactor-browser";
import {
  findDriveBySlugOrId,
  makeDriveSlug,
  makeNodeSlug,
  resolveDriveRoute,
} from "@powerhousedao/reactor-browser";
import { notFound, redirect } from "@tanstack/react-router";
import type { ConnectRouteComponents } from "./route-components.js";

export type ConnectRouterContext = {
  store: PHStore;
  /** Without it the drive route never waits for drives to arrive. */
  arrivals?: DriveArrivals;
  /** What the file routes render; `createConnectRouter` sets them. */
  components?: ConnectRouteComponents;
  /** Ends every document title; "Connect" without one. */
  appName?: string;
};

/** The route a missing drive's not-found page replaces: the content view. */
export const DRIVE_NOT_FOUND_ROUTE_ID = "/_app/_content";

/** A missing drive's not-found data. */
export type DriveNotFoundData = { driveSlug: string };

export function isDriveNotFound(data: unknown): data is DriveNotFoundData {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as { driveSlug?: unknown }).driveSlug === "string"
  );
}

/** What the drive route resolved its params to. */
export type DriveRouteData = { driveId: string; nodeId?: string };

export type DriveRouteParams = { driveSlug: string; nodeSlug?: string };

/** Resolves a drive route's slugs; a missing drive is not found and a missing
 * node leads to its drive. */
export async function loadDriveRoute(options: {
  params: DriveRouteParams;
  context: ConnectRouterContext;
  signal: AbortSignal;
  preload: boolean;
}): Promise<DriveRouteData> {
  const { params, context, signal, preload } = options;
  const result = await resolveDriveRoute({
    store: context.store,
    arrivals: context.arrivals,
    driveSlug: params.driveSlug,
    nodeSlug: params.nodeSlug,
    signal,
    preload,
  });
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
      // Shown in place of the content view, so no stale drive renders beside it.
      // oxlint-disable-next-line typescript/only-throw-error -- router control flow
      throw notFound({
        routeId: DRIVE_NOT_FOUND_ROUTE_ID as never,
        data: { driveSlug: params.driveSlug } satisfies DriveNotFoundData,
      });
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
