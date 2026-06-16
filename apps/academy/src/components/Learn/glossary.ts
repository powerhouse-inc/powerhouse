/**
 * Definitions for inline <Term> popovers. Keys are matched case-insensitively
 * against a Term's canonical name (its `term` prop, or its text when no prop is
 * given). Keep these short — one or two sentences that fit a tooltip. Fuller
 * entries live in docs/academy/04-Reference/04-Glossary.md.
 */
export const glossary: Record<string, string> = {
  powerhouse:
    "A network organization providing open-source software and services for decentralized operations — and the ecosystem of tools (Connect, Switchboard, Reactor) built around it.",
  "document model":
    "A structured definition of how a Powerhouse document stores and processes data: its state schema plus the operations that can change it.",
  editors:
    "A UI for a document model that lets users read and modify the data the model captures.",
  "editor module":
    "A packaged editor — the React component plus its registration — that a host app loads to render a given document type.",
  reactor:
    "A storage node for Powerhouse documents. Reactors process mutations as jobs, emit events, and coordinate read models and processors across local, cloud, or decentralized storage.",
  "event sourcing":
    "Storing system state as a sequence of immutable events rather than overwriting a single record, so the full history is preserved and replayable.",
  "time travel debugging":
    "Reconstructing and inspecting any past state of a document by replaying its events up to a chosen point in time.",
  "pure functions (for reducers)":
    "Reducers must be pure: their output depends only on their inputs, with no side effects — which makes state transitions predictable and replayable.",
  renown:
    "Powerhouse's decentralized authentication system; it manages contributor identity and reputation via wallet-signed DIDs.",
  subgraph:
    "A modular GraphQL schema unit in Switchboard that exposes a slice of document data, composed with others into the full API.",
  vetra:
    "A Powerhouse platform for hosting remote drives, enabling collaborative development and document synchronization across a team.",
};

/** Looks up a definition by canonical name, case-insensitively. */
export function lookupDefinition(name?: string): string | undefined {
  if (!name) return undefined;
  return glossary[name.toLowerCase()];
}
