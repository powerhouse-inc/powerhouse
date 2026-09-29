import { PIECES_FRAMEWORK_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";
import type { PieceNames } from "../../file-builders/types.js";

export const pieceIndexFileTemplate = (
  v: PieceNames & { description: string; withAuth: boolean },
) => {
  const imports = [
    `import { createPiece${v.withAuth ? "" : ", PieceAuth"} } from "${PIECES_FRAMEWORK_PACKAGE}";`,
    v.withAuth
      ? `import { ${v.camelCaseName}Auth } from "./lib/auth.js";`
      : undefined,
    `import { ${v.constantCaseName}_LOGO } from "./lib/logo.js";`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return ts`
${imports}

export const ${v.camelCaseName} = createPiece({
  // Name and description shown in the workflow editor's piece list
  displayName: "${v.displayName}",
  description: "${v.description}",
  // The connection every action and trigger uses; defined in lib/auth.ts
  auth: ${v.withAuth ? `${v.camelCaseName}Auth` : "PieceAuth.None()"},
  minimumSupportedRelease: "0.30.0",
  logoUrl: ${v.constantCaseName}_LOGO,
  authors: [],
  // ph generate piece-action and piece-trigger add entries here
  actions: [],
  triggers: [],
});

export default ${v.camelCaseName};
`.raw;
};
