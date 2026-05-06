import type { DriveOwnershipCache } from "./drive-ownership-cache.js";
import type { FetchHandler } from "./types.js";

export type DriveFetchMiddleware = (handler: FetchHandler) => FetchHandler;

const DRIVE_ID_HEADER = "drive-id";

/**
 * Operations that legitimately run before the target drive exists in the
 * cache. Drive creation is the obvious case (a brand-new drive cannot be
 * in the ownership set yet); other create-shaped operations that may
 * synthesize a drive must be added here too.
 */
const CACHE_BYPASS_OPERATIONS = new Set([
  "createDocument",
  "createEmptyDocument",
]);

const driveIdMap = new WeakMap<globalThis.Request, string>();

/** Internal — only `graphql-manager.ts` should call this. */
export function getRequestDriveId(
  request: globalThis.Request,
): string | undefined {
  return driveIdMap.get(request);
}

/**
 * Returns a fetch middleware that validates the `Drive-Id` header against
 * the in-memory ownership cache. Layout:
 *
 * - No header → pass through. The LB has already round-robined; nothing
 *   to validate here.
 * - Header present and drive in cache → record on the request map (for
 *   the context factory to read into `context.driveId`) and pass through.
 * - Header present, drive missing, but the operation is `createDocument`
 *   or `createEmptyDocument` → pass through. The drive may be in the
 *   process of being created.
 * - Otherwise → return `421 Misdirected Request` with a structured body.
 *   The client (or LB) can surface this as a wrong-shard signal.
 */
export function createDriveFetchMiddleware(
  cache: DriveOwnershipCache,
): DriveFetchMiddleware {
  return (next: FetchHandler): FetchHandler =>
    async (request: globalThis.Request): Promise<globalThis.Response> => {
      const driveId = request.headers.get(DRIVE_ID_HEADER) ?? "";
      if (driveId === "") {
        return next(request);
      }

      if (cache.has(driveId)) {
        driveIdMap.set(request, driveId);
        return next(request);
      }

      if (await isCacheBypassOperation(request)) {
        return next(request);
      }

      return wrongShardResponse(driveId);
    };
}

async function isCacheBypassOperation(
  request: globalThis.Request,
): Promise<boolean> {
  if (request.method !== "POST") {
    return false;
  }
  try {
    const body = (await request.clone().json()) as {
      operationName?: unknown;
      query?: unknown;
    };
    if (typeof body.operationName === "string") {
      return CACHE_BYPASS_OPERATIONS.has(body.operationName);
    }
    if (typeof body.query === "string") {
      return CACHE_BYPASS_OPERATIONS.has(extractOperationName(body.query));
    }
    return false;
  } catch {
    return false;
  }
}

const OPERATION_NAME_PATTERN = /\b(?:mutation|query|subscription)\s+(\w+)/;

function extractOperationName(query: string): string {
  const match = OPERATION_NAME_PATTERN.exec(query);
  return match ? match[1] : "";
}

function wrongShardResponse(driveId: string): globalThis.Response {
  return new globalThis.Response(
    JSON.stringify({ error: "wrong-shard", driveId }),
    {
      status: 421,
      headers: { "content-type": "application/json" },
    },
  );
}
