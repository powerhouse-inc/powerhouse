export type PackagePiece = {
  name: string;
  entry?: string;
  bundle?: string;
};

// Named after the package; its version is the package.json version.
export const pieces: PackagePiece[] = [
  {
    name: "@fixture/mixed-package",
    entry: "dist/node/pieces/wave/index.mjs",
  },
];

export default pieces;
