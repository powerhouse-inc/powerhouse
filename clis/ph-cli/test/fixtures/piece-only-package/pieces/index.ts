// The pieces this fixture ships, as a reactor package declares them.
// A local type: the fixture must not depend on @powerhousedao/pieces-framework.
export type PackagePiece = {
  name: string;
  version: string;
  entry?: string;
  bundle?: string;
};

export const pieces: PackagePiece[] = [
  {
    name: "@fixture/piece-hello",
    version: "1.2.3",
    entry: "dist/node/pieces/hello/index.mjs",
  },
  {
    name: "@fixture/piece-goodbye",
    version: "0.1.0",
    entry: "dist/node/pieces/goodbye/index.mjs",
  },
];

export default pieces;
