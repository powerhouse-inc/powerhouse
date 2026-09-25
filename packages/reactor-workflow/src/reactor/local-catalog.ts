// A package piece as the editor's catalog sees it, read from the piece itself.

// A published piece is described by a listing the cloud API serves; one that
// ships inside a reactor package has no listing, so its descriptor — built in
// the worker from the piece module — is the listing.
import type { PieceDescriptor } from "../pieces/index.js";
import type { BlockSearchHit } from "./block-search.js";
import {
  aiLast,
  clientAuth,
  reasonOf,
  type PieceActionsResult,
  type PieceSummary,
  type PieceTriggersResult,
} from "./piece-catalog.js";

// Block types of a package piece carry no version. The copy this reactor
// installed is the one that runs, so an upgrade must not orphan the workflows
// that name it — the registry answers with the installed version instead.
export function localBlockType(
  pieceName: string,
  name: string,
  kind: "action" | "trigger",
): string {
  return kind === "trigger"
    ? `${pieceName}#trigger:${name}`
    : `${pieceName}#${name}`;
}

export function catalogEntry(
  descriptor: PieceDescriptor,
  pieceName: string,
  version: string,
): PieceSummary {
  return {
    name: pieceName,
    displayName: descriptor.displayName || pieceName,
    description: descriptor.description ?? "",
    logoUrl: descriptor.logoUrl ?? "",
    version,
    actionCount: descriptor.actions.length,
    triggerCount: descriptor.triggers.length,
    categories: descriptor.categories ?? [],
    auth: clientAuth(descriptor.auth),
    ...reasonOf(descriptor.unsupported),
  };
}

export function actionsResult(
  descriptor: PieceDescriptor,
  pieceName: string,
  version: string,
): PieceActionsResult {
  return {
    name: pieceName,
    displayName: descriptor.displayName || pieceName,
    version,
    actions: descriptor.actions
      .map((action) => ({
        name: action.name,
        displayName: action.displayName,
        description: action.description ?? "",
        blockType: localBlockType(pieceName, action.name, "action"),
        // The cloud's discovery filter. Absent counts as human-visible.
        audience: action.audience ?? null,
        ...reasonOf(descriptor.unsupported),
      }))
      // Agent-targeted atomics last, as the published listing sorts them.
      .sort((a, b) => aiLast(a.audience) - aiLast(b.audience)),
    auth: clientAuth(descriptor.auth),
  };
}

export function triggersResult(
  descriptor: PieceDescriptor,
  pieceName: string,
  version: string,
): PieceTriggersResult {
  return {
    name: pieceName,
    displayName: descriptor.displayName || pieceName,
    version,
    triggers: descriptor.triggers.map((trigger) => ({
      name: trigger.name,
      displayName: trigger.displayName,
      description: trigger.description ?? "",
      strategy: trigger.strategy,
      blockType: localBlockType(pieceName, trigger.name, "trigger"),
      ...reasonOf(descriptor.unsupported ?? trigger.unsupported),
    })),
    auth: clientAuth(descriptor.auth),
  };
}

// The piece's blocks as search hits, so a block the reactor ships is findable
// whether or not the published catalog answered.
export function localSearchHits(
  descriptor: PieceDescriptor,
  pieceName: string,
): BlockSearchHit[] {
  const pieceDisplayName = descriptor.displayName || pieceName;
  const logoUrl = descriptor.logoUrl ?? "";
  return [
    ...descriptor.actions.map((action) => ({
      blockType: localBlockType(pieceName, action.name, "action"),
      pieceName,
      pieceDisplayName,
      logoUrl,
      displayName: action.displayName,
      description: action.description ?? "",
      kind: "action" as const,
      strategy: null,
      ...reasonOf(descriptor.unsupported),
    })),
    ...descriptor.triggers.map((trigger) => ({
      blockType: localBlockType(pieceName, trigger.name, "trigger"),
      pieceName,
      pieceDisplayName,
      logoUrl,
      displayName: trigger.displayName,
      description: trigger.description ?? "",
      kind: "trigger" as const,
      strategy: trigger.strategy,
      ...reasonOf(descriptor.unsupported ?? trigger.unsupported),
    })),
  ];
}

// The PieceMetadataModel shape the editor's detail query expects: actions and
// triggers keyed by name. Output schemas are absent because a descriptor does
// not carry them — a caller reading one treats that as "not authored".
export function detailResult(
  descriptor: PieceDescriptor,
  pieceName: string,
  version: string,
): Record<string, unknown> {
  return {
    name: pieceName,
    displayName: descriptor.displayName || pieceName,
    description: descriptor.description ?? "",
    logoUrl: descriptor.logoUrl ?? "",
    version,
    categories: descriptor.categories ?? [],
    auth: clientAuth(descriptor.auth),
    actions: Object.fromEntries(
      descriptor.actions.map((action) => [
        action.name,
        {
          name: action.name,
          displayName: action.displayName,
          description: action.description ?? "",
          props: action.props,
          requireAuth: action.requireAuth,
          // What blockOutputTree reads. A published piece's listing carries
          // it; a package piece has only this.
          outputSchema: action.outputSchema,
          audience: action.audience,
        },
      ]),
    ),
    triggers: Object.fromEntries(
      descriptor.triggers.map((trigger) => [
        trigger.name,
        {
          name: trigger.name,
          displayName: trigger.displayName,
          description: trigger.description ?? "",
          type: trigger.strategy,
          props: trigger.props,
          requireAuth: trigger.requireAuth,
          outputSchema: trigger.outputSchema,
          sampleData: trigger.sampleData,
          testStrategy: trigger.testStrategy,
          // Under the name the published listing uses; the descriptor
          // shortens it.
          handshakeConfiguration: trigger.handshake,
        },
      ]),
    ),
  };
}
