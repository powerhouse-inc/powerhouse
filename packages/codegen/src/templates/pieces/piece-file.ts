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
  displayName: "${v.displayName}",
  description: "${v.description}",
  auth: ${v.withAuth ? `${v.camelCaseName}Auth` : "PieceAuth.None()"},
  minimumSupportedRelease: "0.30.0",
  logoUrl: ${v.constantCaseName}_LOGO,
  authors: [],
  actions: [],
  triggers: [],
});

export default ${v.camelCaseName};
`.raw;
};
