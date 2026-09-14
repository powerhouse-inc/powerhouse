// The pieces this reactor package ships.

// One entry per piece: what it is called, what version this package installs,
// and where its built module sits relative to the package root — the path the
// node build emits it to. Everything else — display name, description,
// actions, triggers, auth — is read from the piece itself, so this list cannot
// drift from the code.
import type { PackagePiece } from "@powerhousedao/reactor-connectors";

export const pieces: PackagePiece[] = [
  {
    name: "@powerhousedao/piece-reactor",
    version: "1.0.0",
    entry: "dist/node/pieces/reactor/index.mjs",
  },
];

export default pieces;
