import type {
  DefinitionDiagnostic,
  LocationFreeGraphQLDocumentNode,
} from "@powerhousedao/shared/document-model";
import { createDiagnostic } from "../diagnostics.js";

// `@key` is absent because Federation 1 uses it too. The v2 `@key` forms are
// detected by their arguments instead.
const FEDERATION_2_DIRECTIVES = new Set([
  "link",
  "shareable",
  "inaccessible",
  "override",
  "composeDirective",
  "interfaceObject",
  "authenticated",
  "requiresScopes",
  "policy",
]);

const FEDERATION_2_KEY_ARGUMENTS = new Set(["resolvable"]);

export type FederationCheckInput = {
  readonly directives: readonly {
    readonly name: string;
    readonly argumentNames: readonly string[];
    readonly path: readonly (string | number)[];
  }[];
};

/**
 * The typed API has no directive builder, so only a JavaScript caller or an
 * unchecked configuration can produce these. Powerhouse authoring is
 * Federation 1-shaped, and a partly supported Federation 2 surface gives an
 * author a schema that composes locally and fails elsewhere.
 */
export function checkFederationSurface(
  input: FederationCheckInput,
): readonly DefinitionDiagnostic[] {
  return input.directives.flatMap((directive) => {
    const isV2Directive = FEDERATION_2_DIRECTIVES.has(directive.name);
    const isV2Key =
      directive.name === "key" &&
      directive.argumentNames.some((argument) =>
        FEDERATION_2_KEY_ARGUMENTS.has(argument),
      );
    if (!isV2Directive && !isV2Key) return [];
    return [
      createDiagnostic({
        code: "PH-GQL-FEDERATION-UNSUPPORTED",
        path: directive.path.map(String),
        message: `@${directive.name} is Federation 2 authoring, which a typed declaration does not support.`,
        received: `@${directive.name}`,
        repair:
          "Return schema.graphql({ typeDefs, resolverCoordinates, resolvers }) from getSchema, which preserves the AST and its composition behaviour exactly.",
      }),
    ];
  });
}

export function directiveUsesOfDocument(
  document: LocationFreeGraphQLDocumentNode,
): FederationCheckInput["directives"] {
  const uses: {
    name: string;
    argumentNames: string[];
    path: (string | number)[];
  }[] = [];
  const walk = (node: unknown, path: (string | number)[]): void => {
    if (Array.isArray(node)) {
      return node.forEach((member, index) => walk(member, [...path, index]));
    }
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.kind === "Directive") {
      const named = record.name as { value?: unknown } | undefined;
      if (typeof named?.value === "string") {
        uses.push({
          name: named.value,
          argumentNames: (
            (record.arguments as readonly { name?: { value?: unknown } }[]) ??
            []
          ).flatMap((argument) =>
            typeof argument.name?.value === "string"
              ? [argument.name.value]
              : [],
          ),
          path,
        });
      }
    }
    for (const [key, member] of Object.entries(record)) {
      walk(member, [...path, key]);
    }
  };
  walk(document, ["typeDefs"]);
  return uses;
}
