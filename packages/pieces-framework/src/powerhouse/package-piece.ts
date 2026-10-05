// One entry of a reactor package's pieces/index.ts. The version is the
// package's; display name, actions, triggers and auth come from the piece.
export interface PackagePiece {
  name: string;
  // Built output, relative to the package root, as the node build emits it:
  // a directory in npm-bundle shape (package.json + entry) or a module file.
  bundle?: string;
  entry?: string;
}
