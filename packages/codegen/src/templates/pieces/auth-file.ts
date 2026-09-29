import { PIECES_FRAMEWORK_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";
import type { PieceNames } from "../../file-builders/types.js";

const secretAuth = (v: PieceNames) => `
export const ${v.camelCaseName}Auth = PieceAuth.SecretText({
  // Label and help text on the connection form
  displayName: "API Key",
  description: "Where the user finds this key in ${v.displayName}",
  required: true,
  // Called when the user checks the connection; auth is the key
  // validate: async ({ auth }) => ({ valid: true }),
  // A label telling connections apart, e.g. the account email
  // getConnectionIdentifier: async ({ auth }) => undefined,
});
`;

const customAuth = (v: PieceNames) => `
export const ${v.camelCaseName}Auth = PieceAuth.CustomAuth({
  // Help text on the connection form
  description: "Where the user finds these values in ${v.displayName}",
  required: true,
  // The connection form's fields; SecretText values are stored as secrets
  props: {
    baseUrl: Property.ShortText({
      displayName: "Base URL",
      required: true,
    }),
    apiKey: PieceAuth.SecretText({
      displayName: "API Key",
      required: true,
    }),
  },
  // Called when the user checks the connection; auth holds the props above
  // validate: async ({ auth }) => ({ valid: true }),
  // A label telling connections apart, e.g. the account email
  // getConnectionIdentifier: async ({ auth }) => undefined,
});
`;

export const pieceAuthFileTemplate = (
  v: PieceNames & { auth: "secret" | "custom" },
) =>
  ts`
import { PieceAuth${v.auth === "custom" ? ", Property" : ""} } from "${PIECES_FRAMEWORK_PACKAGE}";
${v.auth === "secret" ? secretAuth(v) : customAuth(v)}`.raw;
