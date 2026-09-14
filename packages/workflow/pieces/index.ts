// The pieces this reactor package ships.

// One entry per piece: what it is called, what version this package installs,
// and where its built bundle sits relative to the package root. Everything
// else — display name, description, actions, triggers, auth — is read from the
// piece itself, so this list cannot drift from the code.
import type { PackagePiece } from "@powerhousedao/reactor-connectors";

export const pieces: PackagePiece[] = [
  {
    name: "@powerhousedao/piece-reactor",
    version: "1.0.0",
    bundle: "dist/pieces/reactor",
  },
];

export default pieces;
