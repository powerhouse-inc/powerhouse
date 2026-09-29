// Pieces the runtime ships and registers itself. They are this package's own
// code, so they are described and run in process rather than in the worker.
import type { BlockIdentity } from "@powerhousedao/pieces-framework/block-type";
import {
  PIECE_ACTION_PORTS,
  TRIGGER_PORTS,
} from "@powerhousedao/pieces-framework/workflow";
import type { LocalPiece } from "./activepieces/resolver.js";
import {
  buildDescriptor,
  type PieceDescriptor,
} from "./activepieces/descriptor.js";
import { getActions, type ApPiece } from "./activepieces/types.js";
import {
  CORE_PIECE_NAME,
  CORE_PIECE_VERSION,
  corePiece,
  isPorted,
} from "./core/index.js";

export interface BuiltinPiece {
  name: string;
  version: string;
  piece: ApPiece;
}

const BUILTIN_PIECES: readonly BuiltinPiece[] = [
  {
    name: CORE_PIECE_NAME,
    version: CORE_PIECE_VERSION,
    piece: corePiece as unknown as ApPiece,
  },
];

export function builtinPiece(name: string): BuiltinPiece | undefined {
  return BUILTIN_PIECES.find((entry) => entry.name === name);
}

export function isBuiltinPiece(name: string): boolean {
  return builtinPiece(name) !== undefined;
}

// As the resolver sees it: installed, with nothing on disk to load.
export function builtinLocalPieces(): LocalPiece[] {
  return BUILTIN_PIECES.map(({ name, version }) => ({ name, version }));
}

const descriptors = new Map<string, PieceDescriptor>();

export function describeBuiltinPiece(builtin: BuiltinPiece): PieceDescriptor {
  let descriptor = descriptors.get(builtin.name);
  if (!descriptor) {
    descriptor = buildDescriptor(
      builtin.piece,
      { packageName: builtin.name, version: builtin.version },
      { routed: true, hostFed: true },
    );
    descriptors.set(builtin.name, descriptor);
  }
  return descriptor;
}

// What a block's edges may leave on: a built-in block's own list, else the
// ports every piece action or trigger declares.
export function blockPorts(
  block: BlockIdentity,
): readonly string[] | undefined {
  const builtin = builtinPiece(block.pieceName);
  if (builtin) {
    const descriptor = describeBuiltinPiece(builtin);
    const entries: { name: string; ports: readonly string[] }[] =
      block.kind === "trigger" ? descriptor.triggers : descriptor.actions;
    return entries.find((entry) => entry.name === block.name)?.ports;
  }
  return block.kind === "trigger" ? TRIGGER_PORTS : PIECE_ACTION_PORTS;
}

export class UnknownBuiltinActionError extends Error {
  constructor(piece: string, action: string) {
    super(`${piece} has no action "${action}"`);
    this.name = "UnknownBuiltinActionError";
  }
}

// Only propsValue is served: a built-in action reaches nothing else.
export async function runBuiltinAction(
  builtin: BuiltinPiece,
  actionName: string,
  propsValue: Record<string, unknown>,
): Promise<{ output: unknown; port?: string }> {
  const action = getActions(builtin.piece)[actionName] as unknown;
  if (!action || typeof (action as { run?: unknown }).run !== "function") {
    throw new UnknownBuiltinActionError(builtin.name, actionName);
  }
  const output = await (
    action as { run: (ctx: unknown) => Promise<unknown> }
  ).run({ propsValue });
  return {
    output,
    ...(isPorted(action) ? { port: action.portOf(output) } : {}),
  };
}
