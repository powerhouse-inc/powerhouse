// Builds a starter input object for an action from its GraphQL input SDL.

function pascalCase(actionType: string): string {
  return actionType
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

function placeholderFor(type: string): unknown {
  const bare = type.replace(/!/g, "").trim();
  if (bare.startsWith("[")) return [];
  switch (bare) {
    case "Int":
    case "Float":
      return 0;
    case "Boolean":
      return false;
    case "String":
    case "OID":
    case "PHID":
    case "OLabel":
    case "URL":
    case "DateTime":
    case "Date":
    case "EmailAddress":
    case "EthereumAddress":
    case "Currency":
      return "";
    default:
      return null;
  }
}

// Extracts the root `input <ActionType>Input { ... }` block and returns one
// placeholder per field; null when the schema doesn't parse.
export function inputTemplateFromSchema(
  schema: string,
  actionType: string,
): Record<string, unknown> | null {
  const rootName = `${pascalCase(actionType)}Input`;
  const blockMatch = new RegExp(`input\\s+${rootName}\\s*\\{([^}]*)\\}`).exec(
    schema,
  );
  const body = blockMatch?.[1];
  if (!body) return null;
  const template: Record<string, unknown> = {};
  for (const line of body.split("\n")) {
    const cleaned = line
      .replace(/#.*$/, "")
      .replace(/"[^"]*"/g, "")
      .trim();
    const fieldMatch = /^(\w+)\s*:\s*([\w[\]!]+)/.exec(cleaned);
    if (!fieldMatch) continue;
    const [, name, type] = fieldMatch;
    if (name === "_") continue; // empty-input dummy field
    template[name] = type.endsWith("!") ? placeholderFor(type) : null;
  }
  return Object.keys(template).length > 0 ? template : {};
}
