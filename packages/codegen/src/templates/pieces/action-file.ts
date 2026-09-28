import { PIECES_FRAMEWORK_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";
import type { PieceNames } from "../../file-builders/types.js";

export type PieceActionTemplateArgs = PieceNames & {
  /** Exported const, e.g. "acmeCrmGetRecordAction". */
  exportName: string;
  /** The action's own name, the half after "#" in a block type. */
  actionName: string;
  actionDisplayName: string;
  withAuth: boolean;
};

export const pieceActionFileTemplate = (v: PieceActionTemplateArgs) => {
  const imports = [
    `import { createAction } from "${PIECES_FRAMEWORK_PACKAGE}";`,
    v.withAuth
      ? `import { ${v.camelCaseName}Auth } from "../auth.js";`
      : undefined,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return ts`
${imports}

export const ${v.exportName} = createAction({
${v.withAuth ? `  auth: ${v.camelCaseName}Auth,` : "  requireAuth: false,"}
  name: "${v.actionName}",
  displayName: "${v.actionDisplayName}",
  description: "",
  props: {},
  async run() {
    // Action implementation goes here, reading context.auth and context.propsValue
  },
});
`.raw;
};
