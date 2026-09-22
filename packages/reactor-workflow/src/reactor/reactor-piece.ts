// The block types of the piece this package ships.

// The runtime knows these by name for two reasons only: the document triggers
// are fired by the host rather than polled, and the output shape of a document
// block depends on the model an author picked, which static piece metadata
// cannot express. Everything else about them comes from the piece.

// Named where it is enforced: this is the one piece served ctx.reactor, and
// the block types below are the surface that port exists for.
import { REACTOR_PORT_PIECE } from "../pieces/index.js";

export const REACTOR_PIECE = REACTOR_PORT_PIECE;

function action(name: string): string {
  return `${REACTOR_PIECE}#${name}`;
}

function trigger(name: string): string {
  return `${REACTOR_PIECE}#trigger:${name}`;
}

export const DOCUMENT_CREATE_BLOCK = action("document-create");
export const DOCUMENT_DISPATCH_BLOCK = action("document-dispatch");
export const DOCUMENT_GET_BLOCK = action("document-get");
export const DOCUMENT_FIND_BLOCK = action("document-find");
export const DOCUMENT_SCHEMA_BLOCK = action("document-schema");
export const DOCUMENT_TYPES_BLOCK = action("document-types");

export const DOCUMENT_EVENT_BLOCK = trigger("document-event");
export const DOCUMENT_CREATED_BLOCK = trigger("document-created");
export const DOCUMENT_DELETED_BLOCK = trigger("document-deleted");

// A design-time value that can actually be resolved: an expression cannot, so
// a tree built from one falls back to the block's static shape.
export function staticString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("{{")) return undefined;
  return trimmed;
}
