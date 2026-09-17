// One entry of a reactor package's pieces/index.ts. Display name, actions,
// triggers and auth are read from the piece itself, so nothing here can drift.
export interface PackagePiece {
  name: string;
  version: string;
  // Built output, relative to the package root, as the node build emits it:
  // a directory in npm-bundle shape (package.json + entry) or a module file.
  bundle?: string;
  entry?: string;
}
