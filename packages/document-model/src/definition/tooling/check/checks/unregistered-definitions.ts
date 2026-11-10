import { checkDiagnostics } from "../diagnostic-codes.js";
import type { UnregisteredDefinition } from "../../report/types.js";
import type { DefinitionCheck } from "../types.js";

function described({ unit, specifier, reason }: UnregisteredDefinition) {
  const entry = `${unit}index.ts`;
  switch (reason) {
    case "stored-directory":
      return {
        message: `${unit} stores a schema-first specification, so discovery reads it as schema-first and leaves out the code-first document model ${specifier} declares.`,
        expected: "one authoring style per model directory",
        received: "a stored specification and a code-first declaration",
        repair: `Move the code-first model to a directory of its own with an index.ts that exports it, or delete the stored specification in ${unit}.`,
      };
    case "not-exported":
      return {
        message: `${unit} declares a code-first document model that an entry module imports but does not export, so the package leaves it out.`,
        expected: `an entry module that exports the model ${specifier} declares`,
        received: "imported, not exported",
        repair:
          specifier === entry
            ? `Export the value materialize(...) returned from ${entry}.`
            : `Export from ${entry} the value materialize(...) returned for the model ${specifier} declares.`,
      };
    case "unreached":
      return {
        message: `${unit} declares a code-first document model that no model entry module exports, so the package leaves it out.`,
        expected: `${entry} exporting the model ${specifier} declares`,
        received: "no entry",
        repair:
          specifier === entry
            ? `Export the value materialize(...) returned from ${entry}.`
            : `Create ${entry} and export from it the value materialize(...) returned for the model ${specifier} declares.`,
      };
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

/** Turns each declaration the project scan found unregistered into one diagnostic. */
export const unregisteredDefinitionsCheck: DefinitionCheck = {
  name: "unregistered-definitions",
  run: ({ unregistered }) => unregisteredDefinitionDiagnostics(unregistered),
};

/** @experimental Reports declarations that an entry does not publish. */
export function unregisteredDefinitionDiagnostics(
  unregistered: readonly UnregisteredDefinition[],
) {
  return unregistered.map((definition) =>
    checkDiagnostics.create({
      code: "PH-PKG-DEFINITION-UNREGISTERED",
      source: { specifier: definition.specifier },
      path: [],
      ...described(definition),
    }),
  );
}
