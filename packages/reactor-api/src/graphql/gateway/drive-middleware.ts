import { DEFAULT_DRIVE_CONTAINER_TYPES } from "@powerhousedao/reactor";
import {
  Kind,
  OperationTypeNode,
  parse,
  valueFromASTUntyped,
  type OperationDefinitionNode,
} from "graphql";
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
 * - Header present and the drive held here (the cache, else the reactor) →
 *   record on the request map (for the context factory to read into
 *   `context.driveId`) and pass through. A failed lookup passes through.
 * - Header present, drive missing, but the operation is named
 *   `createDocument` or `createEmptyDocument`, or it creates, with no
 *   parent, the very drive the header names → pass through. The drive is
 *   being created.
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

      let held: boolean;
      try {
        held = await cache.holds(driveId);
      } catch {
        // Undecided is not "elsewhere": the request goes on and fails here.
        return next(request);
      }
      if (held) {
        driveIdMap.set(request, driveId);
        return next(request);
      }

      if (await isCacheBypassOperation(request, driveId)) {
        return next(request);
      }

      return wrongShardResponse(driveId);
    };
}

async function isCacheBypassOperation(
  request: globalThis.Request,
  driveId: string,
): Promise<boolean> {
  if (request.method !== "POST") {
    return false;
  }
  try {
    const body = (await request.clone().json()) as {
      operationName?: unknown;
      query?: unknown;
      variables?: unknown;
    };
    const operationName =
      typeof body.operationName === "string" ? body.operationName : undefined;
    if (operationName !== undefined) {
      if (CACHE_BYPASS_OPERATIONS.has(operationName)) {
        return true;
      }
    } else if (
      typeof body.query === "string" &&
      CACHE_BYPASS_OPERATIONS.has(extractOperationName(body.query))
    ) {
      return true;
    }
    return (
      typeof body.query === "string" &&
      createsTheNamedDrive(
        body.query,
        operationName,
        isRecord(body.variables) ? body.variables : {},
        driveId,
      )
    );
  } catch {
    return false;
  }
}

/**
 * Whether the operation does nothing but create, with no parent, the drive the
 * Drive-Id names: whatever the client named it (reactor-browser sends
 * `CreateDocument`), and with the document resolved through its variables.
 */
function createsTheNamedDrive(
  query: string,
  operationName: string | undefined,
  variables: Record<string, unknown>,
  driveId: string,
): boolean {
  const operations = parse(query).definitions.filter(
    (definition): definition is OperationDefinitionNode =>
      definition.kind === Kind.OPERATION_DEFINITION,
  );
  const operation =
    operationName === undefined
      ? operations.length === 1
        ? operations[0]
        : undefined
      : operations.find((candidate) => candidate.name?.value === operationName);
  if (
    !operation ||
    operation.operation !== OperationTypeNode.MUTATION ||
    operation.selectionSet.selections.length !== 1
  ) {
    return false;
  }
  const [field] = operation.selectionSet.selections;
  if (field.kind !== Kind.FIELD || field.name.value !== "createDocument") {
    return false;
  }
  const argument = (name: string): unknown => {
    const node = field.arguments?.find((arg) => arg.name.value === name);
    return node ? valueFromASTUntyped(node.value, variables) : undefined;
  };
  if (
    PARENT_ARGUMENTS.some((name) => {
      const parent = argument(name);
      return parent !== undefined && parent !== null;
    })
  ) {
    return false;
  }
  const header = (argument("document") as { header?: unknown } | undefined)
    ?.header;
  return (
    isRecord(header) &&
    header.id === driveId &&
    typeof header.documentType === "string" &&
    DEFAULT_DRIVE_CONTAINER_TYPES.has(header.documentType)
  );
}

const PARENT_ARGUMENTS = ["parentIdOrSlug", "parentIdentifier"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
