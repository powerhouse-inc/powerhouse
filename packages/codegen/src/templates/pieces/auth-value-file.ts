import { ts } from "@tmpl/core";
import type { PieceNames } from "../../file-builders/types.js";

const customAuthValue = (v: PieceNames) => `
// Strips a trailing slash and refuses a base URL that already points at the
// API: every request built on one would 404 with no hint why.
export function normalizeBaseUrl(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new ${v.pascalCaseName}ApiError("Base URL is required", {
      category: "config",
    });
  }
  const trimmed = raw.trim().replace(/\\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ${v.pascalCaseName}ApiError(
      \`"\${trimmed}" is not a valid URL — expected something like https://example.com\`,
      { category: "config" },
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ${v.pascalCaseName}ApiError(
      trimmed.includes("//")
        ? \`Base URL must be http or https, got "\${parsed.protocol}"\`
        : \`Base URL is missing its scheme — use https://\${trimmed}\`,
      { category: "config" },
    );
  }
  if (/\\/api(\\/v\\d+)?$/i.test(parsed.pathname)) {
    throw new ${v.pascalCaseName}ApiError(
      "Base URL must not include the /api suffix",
      { category: "config" },
    );
  }
  return trimmed;
}

// \`ctx.auth\` arrives shaped as { type: "CUSTOM_AUTH", props }, while \`validate\`
// and \`getConnectionIdentifier\` are handed the flat props. Take both.
export function readAuth(auth: unknown): ${v.pascalCaseName}Credentials {
  const source = isRecord(auth) && isRecord(auth.props) ? auth.props : auth;
  if (!isRecord(source)) {
    throw new ${v.pascalCaseName}ApiError(
      "No ${v.displayName} connection was provided",
      { category: "credential" },
    );
  }
  const token = source.token;
  if (typeof token !== "string" || token === "") {
    throw new ${v.pascalCaseName}ApiError("The connection has no API token", {
      category: "credential",
    });
  }
  return { baseUrl: normalizeBaseUrl(source.base_url), token };
}
`;

const secretAuthValue = (v: PieceNames) => `
// A secret-text connection carries only a token, so the service's own URL
// lives here. Point it at the API this piece calls.
export const ${v.constantCaseName}_BASE_URL = "https://${v.kebabCaseName}.example.com";

// \`ctx.auth\` arrives shaped as { type: "SECRET_TEXT", secret_text }, while
// \`validate\` and \`getConnectionIdentifier\` are handed the bare string. Take both.
export function readAuth(auth: unknown): ${v.pascalCaseName}Credentials {
  const token =
    typeof auth === "string"
      ? auth
      : isRecord(auth) && typeof auth.secret_text === "string"
        ? auth.secret_text
        : undefined;
  if (token === undefined || token === "") {
    throw new ${v.pascalCaseName}ApiError(
      "No ${v.displayName} connection was provided",
      { category: "credential" },
    );
  }
  return { baseUrl: ${v.constantCaseName}_BASE_URL, token };
}
`;

export const pieceAuthValueFileTemplate = (
  v: PieceNames & { auth: "secret" | "custom" },
) =>
  ts`
import { ${v.pascalCaseName}ApiError } from "./errors.js";

export interface ${v.pascalCaseName}Credentials {
  baseUrl: string;
  token: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
${v.auth === "secret" ? secretAuthValue(v) : customAuthValue(v)}
`.raw;
