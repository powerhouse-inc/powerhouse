// A package piece as the editor's catalog sees it, read from the piece itself.

// A published piece is described by a listing the cloud API serves; one that
// ships inside a reactor package has no listing, so its descriptor — built in
// the worker from the piece module — is the listing.
import type { ConnectorDescriptor } from "@powerhousedao/reactor-connectors";
import type { BlockSearchHit } from "./block-search.js";
import type {
  PieceActionsResult,
  PieceSummary,
  PieceTriggersResult,
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
  descriptor: ConnectorDescriptor,
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
    auth: descriptor.auth ?? null,
  };
}

export function actionsResult(
  descriptor: ConnectorDescriptor,
  pieceName: string,
  version: string,
): PieceActionsResult {
  return {
    name: pieceName,
    displayName: descriptor.displayName || pieceName,
    version,
    actions: descriptor.actions.map((action) => ({
      name: action.name,
      displayName: action.displayName,
      description: action.description ?? "",
      blockType: localBlockType(pieceName, action.name, "action"),
      // The cloud's discovery filter; a package piece declares no audience,
      // and an absent one already counts as human-visible everywhere.
      audience: null,
    })),
    auth: descriptor.auth ?? null,
  };
}

export function triggersResult(
  descriptor: ConnectorDescriptor,
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
    })),
    auth: descriptor.auth ?? null,
  };
}

// The piece's blocks as search hits, so a block the reactor ships is findable
// whether or not the published catalog answered.
export function localSearchHits(
  descriptor: ConnectorDescriptor,
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
    })),
  ];
}

// The PieceMetadataModel shape the editor's detail query expects: actions and
// triggers keyed by name. Output schemas are absent because a descriptor does
// not carry them — a caller reading one treats that as "not authored".
export function detailResult(
  descriptor: ConnectorDescriptor,
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
    auth: descriptor.auth ?? null,
    actions: Object.fromEntries(
      descriptor.actions.map((action) => [
        action.name,
        {
          name: action.name,
          displayName: action.displayName,
          description: action.description ?? "",
          props: action.props,
          requireAuth: action.requireAuth,
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
        },
      ]),
    ),
  };
}
