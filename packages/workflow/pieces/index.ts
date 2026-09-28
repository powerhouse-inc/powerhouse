// The pieces this reactor package ships.

// One entry per piece: its name and built module. The version is this
// package's; everything else is read from the piece itself.
import type { PackagePiece } from "@powerhousedao/pieces-framework";

export const pieces: PackagePiece[] = [
  {
    name: "@powerhousedao/piece-reactor",
    entry: "dist/node/pieces/reactor/index.mjs",
  },
];

export default pieces;
