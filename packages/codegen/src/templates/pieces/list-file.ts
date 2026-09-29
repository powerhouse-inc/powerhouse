import { PIECES_FRAMEWORK_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";

export const piecesListFileTemplate = () =>
  ts`
// The pieces this package ships: what each is called and where the node build
// emits its module. A piece's version is this package's.
import type { PackagePiece } from "${PIECES_FRAMEWORK_PACKAGE}";

export const pieces: PackagePiece[] = [];

export default pieces;
`.raw;
