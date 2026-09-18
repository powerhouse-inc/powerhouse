// The pieces this reactor package ships, named after the package so `ph build`
// holds the declared version against package.json.
import type { PackagePiece } from "@powerhousedao/pieces-framework";

export const pieces: PackagePiece[] = [
  {
    name: "test-workflow-piece-package",
    version: "1.0.0",
    entry: "dist/node/pieces/greeter/index.mjs",
  },
];

export default pieces;
