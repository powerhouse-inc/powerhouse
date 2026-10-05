// The id a generated piece gets when the user passes none. A block type is
// `<piece id>#<action name>`, so it must be unique across a whole reactor.
export function derivePieceId(args: {
  packageName: string;
  /** kebab-case piece directory name. */
  slug: string;
  /** Whether the package already ships another piece. */
  hasOtherPieces: boolean;
}): { id: string; needsConfirmation: boolean } {
  const { packageName, slug, hasOtherPieces } = args;
  const slashIndex = packageName.indexOf("/");
  const isScoped = packageName.startsWith("@") && slashIndex > 1;
  const scope = isScoped ? packageName.slice(1, slashIndex) : "";
  const rest = isScoped ? packageName.slice(slashIndex + 1) : "";

  // A package that is itself a piece lends its name to the piece it ships —
  // the one case `assertPieceVersion` ties to the package version.
  if (isScoped && rest.startsWith("piece-") && !hasOtherPieces) {
    return { id: packageName, needsConfirmation: false };
  }
  if (isScoped) {
    return { id: `@${scope}/piece-${slug}`, needsConfirmation: false };
  }
  // An unscoped package has no scope to lend, and inventing one claims a
  // namespace nobody owns: derive it, but have the caller confirm.
  return { id: `@${packageName}/piece-${slug}`, needsConfirmation: true };
}
