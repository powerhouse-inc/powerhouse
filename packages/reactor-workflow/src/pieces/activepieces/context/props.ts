// Design-time channel (doc 06 §2.5): builds the PropertyContext handed to
// DROPDOWN options() / DYNAMIC props() resolvers, and invokes them out-of-band.
import { getActions, type ApPiece, type ApProperty } from "../types.js";
import { throwingStub, withTouchTracking } from "./stubs.js";

// PropertyContext surface per pieces-framework (identical in npm 0.32.0 and
// repo main 0.38.0, checked 2026-09-01) + spike S6b findings.
export interface FlowsProvider {
  list(params?: { externalIds?: string[] }): Promise<{ data: unknown[] }>;
}

export interface ConnectionsProvider {
  get(key: string): Promise<unknown>;
}

export interface ServerInfo {
  apiUrl: string;
  publicUrl: string;
  token: string;
}

export interface BuiltApPropertyContext {
  searchValue: string | undefined;
  server: ServerInfo;
  project: { id: string; externalId(): Promise<string> };
  flows: FlowsProvider;
  connections: ConnectionsProvider;
}

export interface PropertyContextOptions {
  searchValue?: string;
  // Injected capabilities; anything omitted throws with its member path.
  flows?: FlowsProvider;
  connections?: ConnectionsProvider;
  server?: ServerInfo;
  projectId?: string;
  onTouch?: (member: string) => void;
}

export interface PropertyContextHandle {
  context: BuiltApPropertyContext;
  // Top-level members the resolver read; `UNDOCUMENTED:<name>` marks unknown reads.
  touched: ReadonlySet<string>;
}

export function buildPropertyContext(
  options: PropertyContextOptions = {},
): PropertyContextHandle {
  const touched = new Set<string>();
  const base: Record<string, unknown> = {
    searchValue: options.searchValue,
    server: options.server ?? throwingStub("server"),
    project: {
      id: options.projectId ?? "project",
      externalId: () => Promise.resolve(options.projectId ?? "project"),
    },
    flows: options.flows ?? { list: throwingStub("flows.list") },
    connections: options.connections ?? {
      get: throwingStub("connections.get"),
    },
  };
  const context = withTouchTracking(base, touched, options.onTouch);
  return { context: context as unknown as BuiltApPropertyContext, touched };
}

export class NotDynamicPropertyError extends Error {
  constructor(actionName: string, propName: string) {
    super(`Property "${actionName}.${propName}" has no dynamic resolver`);
    this.name = "NotDynamicPropertyError";
  }
}

function pickResolver(
  prop: ApProperty,
): ((...args: unknown[]) => unknown) | undefined {
  if (typeof prop.options === "function") return prop.options;
  if (typeof prop.props === "function") return prop.props;
  return undefined;
}

export interface ResolveDynamicPropertyParams {
  piece: ApPiece;
  actionName: string;
  propName: string;
  // Resolved values of the prop's refresher inputs (auth and sibling props).
  refresherValues?: Record<string, unknown>;
  context: BuiltApPropertyContext;
}

// Invokes a DROPDOWN options() or DYNAMIC props() resolver. The result is
// returned untouched: pieces may soft-fail with a disabled DropdownState.
export async function resolveDynamicProperty(
  params: ResolveDynamicPropertyParams,
): Promise<unknown> {
  const { piece, actionName, propName } = params;
  const action = getActions(piece)[actionName] as
    | ReturnType<typeof getActions>[string]
    | undefined;
  if (!action) throw new Error(`No action "${actionName}" on piece`);
  const prop = action.props?.[propName];
  if (!prop) throw new Error(`No prop "${propName}" on action "${actionName}"`);
  const resolver = pickResolver(prop);
  if (!resolver) throw new NotDynamicPropertyError(actionName, propName);
  return await resolver(params.refresherValues ?? {}, params.context);
}

export interface ParsedResolverId {
  packageName: string;
  actionName: string;
  propName: string;
}

// Inverse of the descriptor's id scheme: activepieces:<pkg>#<action>.<prop>.
export function parseDynamicResolverId(id: string): ParsedResolverId {
  const match = /^activepieces:(.+)#(.+)\.([^.]+)$/.exec(id);
  if (!match) throw new Error(`Invalid dynamic resolver id: ${id}`);
  return { packageName: match[1], actionName: match[2], propName: match[3] };
}

export async function resolveByResolverId(
  piece: ApPiece,
  resolverId: string,
  refresherValues: Record<string, unknown>,
  context: BuiltApPropertyContext,
): Promise<unknown> {
  const { actionName, propName } = parseDynamicResolverId(resolverId);
  return resolveDynamicProperty({
    piece,
    actionName,
    propName,
    refresherValues,
    context,
  });
}
