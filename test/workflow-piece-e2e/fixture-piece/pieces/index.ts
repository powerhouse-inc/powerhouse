// The pieces this reactor package ships; `ph build` gives each the package's version.
import type { PackagePiece } from "@powerhousedao/pieces-framework";

export const pieces: PackagePiece[] = [
  {
    name: "test-workflow-piece-package",
    entry: "dist/node/pieces/greeter/index.mjs",
  },
];

export default pieces;
