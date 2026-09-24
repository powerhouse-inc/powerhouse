import { PIECES_FRAMEWORK_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";
import type { PieceNames } from "../../file-builders/types.js";

export const pieceIndexFileTemplate = (
  v: PieceNames & {
    description: string;
    withAuth: boolean;
    actionExportName: string;
    actionFileName: string;
    triggerExportName: string;
    triggerFileName: string;
  },
) => {
  const imports = [
    `import { createPiece, PieceCategory } from "${PIECES_FRAMEWORK_PACKAGE}";`,
    `import { ${v.actionExportName} } from "./lib/actions/${v.actionFileName}.js";`,
    v.withAuth
      ? `import { ${v.camelCaseName}Auth } from "./lib/auth.js";`
      : undefined,
    `import { ${v.constantCaseName}_LOGO } from "./lib/logo.js";`,
    `import { ${v.triggerExportName} } from "./lib/triggers/${v.triggerFileName}.js";`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return ts`
${imports}

export const ${v.camelCaseName} = createPiece({
  displayName: "${v.displayName}",
  description: "${v.description}",
  logoUrl: ${v.constantCaseName}_LOGO,
  authors: [],
  categories: [PieceCategory.PRODUCTIVITY],
  minimumSupportedRelease: "0.30.0",
  auth: ${v.withAuth ? `${v.camelCaseName}Auth` : "undefined"},
  actions: [${v.actionExportName}],
  triggers: [${v.triggerExportName}],
});
${v.withAuth ? `\nexport { ${v.camelCaseName}Auth };\n` : ""}
export default ${v.camelCaseName};
`.raw;
};
