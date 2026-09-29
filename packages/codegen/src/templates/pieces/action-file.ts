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
    `import { createAction${v.withAuth ? "" : ", PieceAuth"} } from "${PIECES_FRAMEWORK_PACKAGE}";`,
    v.withAuth
      ? `import { ${v.camelCaseName}Auth } from "../auth.js";`
      : undefined,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return ts`
${imports}

export const ${v.exportName} = createAction({
${v.withAuth ? `  auth: ${v.camelCaseName}Auth,` : "  // Types context.auth as undefined\n  auth: PieceAuth.None(),\n  requireAuth: false,"}
  // Saved workflows refer to the action by name: don't rename it once published
  name: "${v.actionName}",
  displayName: "${v.actionDisplayName}",
  // Shown under the action in the editor: say what it does
  description: "",
  // Inputs the user fills in on the step, e.g. Property.ShortText({ ... })
  props: {},
  async run() {
    // Read context.auth and context.propsValue; the returned value is the
    // step's output, available to later steps
  },
});
`.raw;
};
