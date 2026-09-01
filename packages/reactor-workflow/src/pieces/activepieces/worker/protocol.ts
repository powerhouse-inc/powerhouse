import type { ActionContextIdentity } from "../context/action.js";

export interface RunActionRequest {
  bundleDir: string;
  actionName: string;
  propsValue: Record<string, unknown>;
  auth?: unknown;
  // Resolved connection values served to ctx.connections.get(key).
  connections?: Record<string, unknown>;
  // Store partition; runs sharing a scope share state for the worker's lifetime.
  storeScope?: string;
  executionType?: "BEGIN" | "RESUME";
  identity?: ActionContextIdentity;
}

export interface RunMessage {
  id: number;
  type: "run";
  request: RunActionRequest;
}

// Piece errors cross the IPC boundary as data; classify on these fields.
export interface SerializedPieceError {
  name: string;
  message: string;
  properties: Record<string, unknown>;
  // Set when the piece hit an unimplemented context member.
  unsupportedMember?: string;
}

export interface ResultResponse {
  id: number;
  type: "result";
  output: unknown;
  touched: string[];
  // True when the piece set NODE_TLS_REJECT_UNAUTHORIZED=0 (contained to the worker).
  tlsPoisoned: boolean;
}

export interface ErrorResponse {
  id: number;
  type: "error";
  error: SerializedPieceError;
  tlsPoisoned: boolean;
}

export type WorkerResponse = ResultResponse | ErrorResponse;
