import { PIECES_FRAMEWORK_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";
import type {
  PieceNames,
  PieceRequireReactor,
} from "../../file-builders/types.js";

export type PieceActionTemplateArgs = PieceNames & {
  /** Exported const, e.g. "acmeCrmGetRecordAction". */
  exportName: string;
  /** The action's own name, the half after "#" in a block type. */
  actionName: string;
  actionDisplayName: string;
  withAuth: boolean;
  requireReactor?: PieceRequireReactor;
};

// The requireReactor line of an action or trigger, always written out.
export const reactorDeclaration = (
  access: PieceRequireReactor | undefined,
  block: "action" | "trigger",
) =>
  access
    ? `  // Types context.reactor: "read" offers reads, "write" adds writes. Calls act
  // as the workflow's run user, within the ${block === "action" ? "step" : "trigger"}'s reactor connection
  requireReactor: "${access}",
`
    : `  // "read" or "write" gives this ${block} context.reactor
  requireReactor: false,
`;

const runComment = (access: PieceRequireReactor | undefined) =>
  access
    ? `    // Read context.reactor, context.auth and context.propsValue, e.g.
    // await context.reactor.get(documentId). The returned value is the
    // step's output, available to later steps`
    : `    // Read context.auth and context.propsValue; the returned value is the
    // step's output, available to later steps`;

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
${reactorDeclaration(v.requireReactor, "action")}  // Inputs the user fills in on the step, e.g. Property.ShortText({ ... })
  props: {},
  async run() {
${runComment(v.requireReactor)}
  },
});
`.raw;
};
