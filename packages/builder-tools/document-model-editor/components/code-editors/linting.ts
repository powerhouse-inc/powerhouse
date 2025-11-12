import type { Diagnostic } from "@codemirror/lint";
import { linter } from "@codemirror/lint";
import { filterSchema } from "@graphql-tools/utils";
import type { GraphQLSchema } from "graphql";
import { GraphQLError, locatedError } from "graphql";
import { validateSDL } from "graphql/validation/validate.js";
import { safeParseSdl } from "../../context/schema-context.js";

/* Converts a GraphQLError to a Diagnostic
   GraphQLError uses a zero-indexed line and column, but the editor uses a one-indexed line and column
*/
export function convertGraphQLErrorToDiagnostic(
  error: GraphQLError,
): Diagnostic {
  return {
    from: error.locations?.[0] ? (error.positions?.[0] ?? 0) : 0,
    to: error.locations?.[0] ? (error.positions?.[0] ?? 0) + 1 : 1,
    severity: "error",
    message: error.message,
  };
}

/* Creates a linter that checks the document for errors
     This works in combination with the built-in linting provided by the graphql extension
     We need to recreate this linter when the schema changes or if a custom linter is provided
     It first checks the document for linting errors
     Then it checks if the document is a valid document string
     Then it checks if the document is valid against the schema
  */
export function makeLinter(
  schema: GraphQLSchema,
  customLinter?: (doc: string) => Diagnostic[],
) {
  return linter((view) => {
    const doc = view.state.doc.toString();
    let diagnostics: Diagnostic[] = [];

    if (customLinter) {
      diagnostics = diagnostics.concat(customLinter(doc));
    }

    const newDocNode = safeParseSdl(doc);

    if (newDocNode) {
      try {
        const currentTypeNames = new Set(
          newDocNode.definitions
            .filter((def) => "name" in def && def.name)
            .map((def) => (def as { name: { value: string } }).name.value),
        );

        // we need to filter out the existing types in the document from the schema to prevent duplicate type errors in the validation
        const filteredSchema = filterSchema({
          schema,
          typeFilter: (typeName) => !currentTypeNames.has(typeName),
        });

        const errors = validateSDL(newDocNode, filteredSchema)
          .map((error) => locatedError(error, newDocNode))
          .filter(
            (error, index, self) =>
              index ===
              self.findIndex(
                (e) =>
                  e.message === error.message &&
                  e.locations?.[0]?.line === error.locations?.[0]?.line &&
                  e.locations?.[0]?.column === error.locations?.[0]?.column,
              ),
          );

        diagnostics = diagnostics.concat(
          errors.map(convertGraphQLErrorToDiagnostic),
        );
      } catch (error) {
        if (error instanceof GraphQLError) {
          diagnostics.push(convertGraphQLErrorToDiagnostic(error));
        }
      }
    }

    return diagnostics;
  });
}
