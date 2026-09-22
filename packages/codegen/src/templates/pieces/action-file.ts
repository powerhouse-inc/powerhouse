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

const clientBody = () => `
  // What the editor renders as a step's inputs. A prop a user may leave empty
  // must be \`required: false\`, or the step cannot be saved half-built.
  props: {
    recordId: Property.ShortText({
      displayName: "Record id",
      description: "The id of the record to read",
      required: true,
    }),
  },
  // What the editor shows of the result, so a later step can pick a field
  // without running this one first.
  outputSchema: {
    fields: [
      { key: "id", label: "Id" },
      { key: "name", label: "Name" },
    ],
  },
  async run(context) {
    const { recordId } = context.propsValue;
    return await clientForContext(context).request({
      path: \`records/\${encodeURIComponent(String(recordId))}\`,
    });
  },
`;

// Nothing to authenticate with, and nothing reached: the action works on what
// the step hands it. A piece that stays portable runs wherever it is loaded.
const transformBody = () => `
  // What the editor renders as a step's inputs. A prop a user may leave empty
  // must be \`required: false\`, or the step cannot be saved half-built.
  props: {
    value: Property.LongText({
      displayName: "Value",
      description: "The text this action works on",
      required: true,
    }),
  },
  // What the editor shows of the result, so a later step can pick a field
  // without running this one first.
  outputSchema: {
    fields: [
      { key: "value", label: "Value" },
      { key: "length", label: "Length" },
    ],
  },
  async run(context) {
    const { value } = context.propsValue;
    const text = String(value ?? "");
    return await Promise.resolve({ value: text.trim(), length: text.length });
  },
`;

export const pieceActionFileTemplate = (v: PieceActionTemplateArgs) => {
  const framework = "createAction, Property";
  const imports = [
    `import { ${framework} } from "${PIECES_FRAMEWORK_PACKAGE}";`,
    v.withAuth
      ? `import { ${v.camelCaseName}Auth } from "../auth.js";`
      : undefined,
    v.withAuth
      ? `import { clientForContext } from "../common/context.js";`
      : undefined,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  const description = v.withAuth
    ? "Reads one record. Replace the path and the props with the call you need."
    : "Tidies a value. Replace the props and the body with the work you need.";

  return ts`
${imports}

export const ${v.exportName} = createAction({
${v.withAuth ? `  auth: ${v.camelCaseName}Auth,` : "  requireAuth: false,"}
  name: "${v.actionName}",
  displayName: "${v.actionDisplayName}",
  description: "${description}",
  // "both" offers the action to a person building a workflow and to an agent.
  audience: "both",
  aiMetadata: { idempotent: true },
${v.withAuth ? clientBody() : transformBody()}});
`.raw;
};
