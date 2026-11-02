// Pieces the runtime ships and registers itself. They are this package's own
// code, so they are described and run in process rather than in the worker.
import { randomBytes } from "node:crypto";
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
import type { RunResponse } from "./activepieces/worker/protocol.js";
import { jsonSafe } from "./activepieces/worker/json-safe.js";
import {
  CORE_PIECE_NAME,
  CORE_PIECE_VERSION,
  CoreCannotPauseError,
  corePiece,
  isPorted,
  type CoreActionContext,
  type CoreWaitpointCall,
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

// A core waitpoint call as the host's port takes it: the response resolved,
// with the token its resume URL was built from.
export type BuiltinWaitpointCall = Omit<CoreWaitpointCall, "responseToSend"> & {
  responseToSend?: RunResponse;
  token?: string;
};

// Served: propsValue, and to a core block that waits, the run's waitpoints.
export interface BuiltinRunOptions {
  // Bound to the step; absent where the run cannot suspend.
  waitpoints?: {
    create(
      call: BuiltinWaitpointCall,
    ): Promise<{ id: string; resumeUrl: string }>;
    // Where resume URLs live; absent where the host serves none.
    resumeBaseUrl?: string;
  };
  // Set when the step re-enters the run it suspended.
  resume?: { payload: unknown };
}

// Resolves a response that embeds the resume URL with a token minted here.
// Without a base URL it is dropped, and the host refuses the WEBHOOK call.
function resolvedCall(
  call: CoreWaitpointCall,
  resumeBaseUrl: string | undefined,
): BuiltinWaitpointCall {
  const { responseToSend, ...rest } = call;
  if (typeof responseToSend !== "function") {
    return responseToSend ? { ...rest, responseToSend } : rest;
  }
  if (!resumeBaseUrl) return rest;
  const token = randomBytes(32).toString("base64url");
  const url = `${resumeBaseUrl.replace(/\/+$/, "")}/${token}`;
  return { ...rest, responseToSend: responseToSend(url), token };
}

export async function runBuiltinAction(
  builtin: BuiltinPiece,
  actionName: string,
  propsValue: Record<string, unknown>,
  options: BuiltinRunOptions = {},
): Promise<{
  output: unknown;
  port?: string;
  paused?: { waitpointId: string };
  response?: RunResponse;
  stopped?: boolean;
}> {
  const action = getActions(builtin.piece)[actionName] as unknown;
  if (!action || typeof (action as { run?: unknown }).run !== "function") {
    throw new UnknownBuiltinActionError(builtin.name, actionName);
  }
  let paused: { waitpointId: string } | undefined;
  let stopped: RunResponse | undefined;
  const { waitpoints, resume } = options;
  const context: CoreActionContext = {
    propsValue,
    executionType: resume ? "RESUME" : "BEGIN",
    ...(resume ? { resumePayload: resume.payload } : {}),
    run: {
      canPause: waitpoints !== undefined,
      createWaitpoint: (call) => {
        if (!waitpoints) throw new CoreCannotPauseError(actionName);
        return waitpoints.create(resolvedCall(call, waitpoints.resumeBaseUrl));
      },
      waitForWaitpoint: (waitpointId) => {
        if (!waitpoints) throw new CoreCannotPauseError(actionName);
        paused = { waitpointId };
      },
      // As upstream's run.stop: no response answers 200 with `{}`.
      stop: (params) => {
        stopped = (jsonSafe(params?.response ?? {}) ?? {}) as RunResponse;
      },
    },
  };
  const output = await (
    action as { run: (ctx: unknown) => Promise<unknown> }
  ).run(context);
  if (paused) return { output, paused };
  if (stopped) return { output, response: stopped, stopped: true };
  return {
    output,
    ...(isPorted(action) ? { port: action.portOf(output) } : {}),
  };
}
