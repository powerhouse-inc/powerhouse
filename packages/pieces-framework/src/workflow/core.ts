// The built-in piece every reactor serves: branch, assert and the triggers
// that belong to no service. Its version is the runtime's own.
import {
  ERROR_PORT,
  NEXT_PORT,
  PIECE_ACTION_PORTS,
  TRIGGER_PORTS,
} from "./ports.js";

export const CORE_PIECE_NAME = "@powerhousedao/piece-core";

// The core branch action leaves on "true" or "false".
export const BRANCH_PORTS: readonly string[] = ["true", "false", ERROR_PORT];

// The core stop action ends the run, so it continues on no port.
export const STOP_PORTS: readonly string[] = [ERROR_PORT];

export const ROUTER_ACTION = "router";
export const LOOP_ACTION = "loop";

// The router's port when no branch matches.
export const OTHERWISE_PORT = "otherwise";
// The loop's body port; "next" is taken once every item has run, and comes
// first so a step inserted on an edge keeps what follows after the loop.
export const LOOP_EACH_PORT = "each";
export const LOOP_PORTS: readonly string[] = [
  NEXT_PORT,
  LOOP_EACH_PORT,
  ERROR_PORT,
];

export interface BlockKind {
  pieceName: string;
  kind: "action" | "trigger";
  name: string;
}

export function isCoreAction(block: BlockKind, name: string): boolean {
  return (
    block.kind === "action" &&
    block.pieceName === CORE_PIECE_NAME &&
    block.name === name
  );
}

// The port of the router's 1-based branch `index`.
export function routerBranchPort(index: number): string {
  return `branch_${index}`;
}

// The configured branches; a list bound to one expression has none yet.
export function routerBranches(config: unknown): Record<string, unknown>[] {
  const branches =
    config !== null && typeof config === "object"
      ? (config as Record<string, unknown>).branches
      : undefined;
  if (!Array.isArray(branches)) return [];
  return branches.map((branch) =>
    branch !== null && typeof branch === "object"
      ? (branch as Record<string, unknown>)
      : {},
  );
}

// A branch's display name, else "Branch N".
export function routerBranchName(
  branch: Record<string, unknown>,
  index: number,
): string {
  const name = typeof branch.name === "string" ? branch.name.trim() : "";
  return name || `Branch ${index}`;
}

const BRANCH_PORT = /^branch_[1-9]\d*$/;

// Branches bound to an expression are known only at run time, so the branch
// ports `wired` holds (the step's edges' ports) count as declared.
export function routerPorts(
  config: unknown,
  wired: readonly string[] = [],
): string[] {
  const branches =
    config !== null && typeof config === "object"
      ? (config as Record<string, unknown>).branches
      : undefined;
  const dynamic =
    branches !== undefined && branches !== null && !Array.isArray(branches);
  return [
    ...routerBranches(config).map((_, i) => routerBranchPort(i + 1)),
    ...(dynamic
      ? [...new Set(wired)].filter((port) => BRANCH_PORT.test(port))
      : []),
    OTHERWISE_PORT,
    ERROR_PORT,
  ];
}

// Labels for config-dependent ports; undefined for any other port.
export function stepPortLabel(
  block: BlockKind,
  config: unknown,
  port: string,
): string | undefined {
  if (isCoreAction(block, ROUTER_ACTION)) {
    if (port === OTHERWISE_PORT) return "Otherwise";
    const match = /^branch_(\d+)$/.exec(port);
    const branches = routerBranches(config);
    const index = match ? Number(match[1]) : 0;
    if (index >= 1 && index <= branches.length) {
      return routerBranchName(branches[index - 1], index);
    }
    return undefined;
  }
  if (isCoreAction(block, LOOP_ACTION)) {
    if (port === LOOP_EACH_PORT) return "For each item";
    if (port === NEXT_PORT) return "After loop";
  }
  return undefined;
}

// A block's ports as known before its descriptor loads: fixed per kind, and
// the core branch's and stop's own.
export function knownPorts(block: BlockKind): readonly string[] {
  if (block.kind === "trigger") return TRIGGER_PORTS;
  if (block.pieceName !== CORE_PIECE_NAME) return PIECE_ACTION_PORTS;
  if (block.name === "branch") return BRANCH_PORTS;
  if (block.name === "stop") return STOP_PORTS;
  if (block.name === LOOP_ACTION) return LOOP_PORTS;
  if (block.name === ROUTER_ACTION) return routerPorts(undefined);
  return PIECE_ACTION_PORTS;
}

// A step's ports: the router's follow its branches, the rest are its block's.
// `wired` is the step's edges' ports, for branches bound to an expression.
export function stepPorts<B extends BlockKind>(
  block: B,
  config: unknown,
  portsOf: (block: B) => readonly string[] | undefined = knownPorts,
  wired?: readonly string[],
): readonly string[] | undefined {
  if (isCoreAction(block, ROUTER_ACTION)) return routerPorts(config, wired);
  return portsOf(block);
}
