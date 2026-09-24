import { PIECES_FRAMEWORK_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";
import type { PieceNames } from "../../file-builders/types.js";

const customAuthProperty = (v: PieceNames) => `
export const ${v.camelCaseName}Auth = PieceAuth.CustomAuth({
  displayName: "${v.displayName}",
  description: AUTH_DESCRIPTION,
  required: true,
  props: {
    base_url: Property.ShortText({
      displayName: "Base URL",
      required: true,
      description:
        "e.g. https://${v.kebabCaseName}.example.com — no trailing slash, no /api suffix",
    }),
    token: PieceAuth.SecretText({
      displayName: "API Token",
      required: true,
      description: "Where the token is minted in the service's UI",
    }),
  },
  // The connection check. \`auth\` here is the flat property value, not the
  // envelope an action's ctx.auth carries.
  validate: async ({ auth }) => {
    try {
      await clientFor(auth).ping();
      return { valid: true as const };
    } catch (error) {
      return { valid: false as const, error: describeAuthFailure(error) };
    }
  },
  // Labels the connection once it validates; best-effort. Return the account
  // name if the API has a "who am I" call.
  getConnectionIdentifier: async ({ auth }) => {
    const client = clientFor(auth);
    await client.ping();
    return new URL(client.credentials.baseUrl).host;
  },
});
`;

const secretAuthProperty = (v: PieceNames) => `
export const ${v.camelCaseName}Auth = PieceAuth.SecretText({
  displayName: "${v.displayName} API Token",
  description: AUTH_DESCRIPTION,
  required: true,
  // The connection check. \`auth\` here is the token itself, not the
  // envelope an action's ctx.auth carries.
  validate: async ({ auth }) => {
    try {
      await clientFor(auth).ping();
      return { valid: true as const };
    } catch (error) {
      return { valid: false as const, error: describeAuthFailure(error) };
    }
  },
  // Labels the connection once it validates; best-effort. Return the account
  // name if the API has a "who am I" call.
  getConnectionIdentifier: async ({ auth }) => {
    const client = clientFor(auth);
    await client.ping();
    return new URL(client.credentials.baseUrl).host;
  },
});
`;

export const pieceAuthFileTemplate = (
  v: PieceNames & { auth: "secret" | "custom" },
) =>
  ts`
import { PieceAuth${v.auth === "custom" ? ", Property" : ""} } from "${PIECES_FRAMEWORK_PACKAGE}";
import { clientFor } from "./common/context.js";
import { ${v.pascalCaseName}ApiError } from "./common/errors.js";

const AUTH_DESCRIPTION = \`Connect to ${v.displayName}.

Say here where the user gets ${v.auth === "secret" ? "the token" : "each field"}: this text is the only instruction
they see while filling the connection in.\`;
${v.auth === "secret" ? secretAuthProperty(v) : customAuthProperty(v)}
function describeAuthFailure(error: unknown): string {
  if (error instanceof ${v.pascalCaseName}ApiError) {
    switch (error.category) {
      case "credential":
        return "The API token was rejected — mint a new one and try again.";
      case "not_found":
        return "That URL answered, but not with the API this piece expects — check the base URL.";
      case "network":
      case "timeout":
        return \`${v.displayName} is unreachable: \${error.message}\`;
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}
`.raw;
