export type PackagePiece = {
  name: string;
  version: string;
  entry?: string;
  bundle?: string;
};

// Named after the package, so the build checks its version against package.json.
export const pieces: PackagePiece[] = [
  {
    name: "@fixture/mixed-package",
    version: "2.0.0",
    entry: "dist/node/pieces/wave/index.mjs",
  },
];

export default pieces;
