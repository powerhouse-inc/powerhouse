import { PIECES_FRAMEWORK_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";
import type { PieceNames } from "../../file-builders/types.js";

const secretAuth = (v: PieceNames) => `
export const ${v.camelCaseName}Auth = PieceAuth.SecretText({
  displayName: "API Key",
  description: "Where the user finds this key in ${v.displayName}",
  required: true,
});
`;

const customAuth = (v: PieceNames) => `
export const ${v.camelCaseName}Auth = PieceAuth.CustomAuth({
  description: "Where the user finds these values in ${v.displayName}",
  required: true,
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
});
`;

export const pieceAuthFileTemplate = (
  v: PieceNames & { auth: "secret" | "custom" },
) =>
  ts`
import { PieceAuth${v.auth === "custom" ? ", Property" : ""} } from "${PIECES_FRAMEWORK_PACKAGE}";
${v.auth === "secret" ? secretAuth(v) : customAuth(v)}`.raw;
