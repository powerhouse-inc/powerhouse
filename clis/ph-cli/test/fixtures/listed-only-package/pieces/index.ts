// Nothing under pieces/<dir>: this package's list is the only thing that
// mentions a piece, which is exactly the case the build must still check.
export type PackagePiece = {
  name: string;
  entry?: string;
  bundle?: string;
};

export const pieces: PackagePiece[] = [
  {
    name: "@fixture/piece-gone",
    entry: "dist/node/pieces/gone/index.mjs",
  },
];

export default pieces;
