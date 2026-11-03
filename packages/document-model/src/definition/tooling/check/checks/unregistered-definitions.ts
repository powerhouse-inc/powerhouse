import { checkDiagnostics } from "../diagnostic-codes.js";
import type { DefinitionCheck } from "../types.js";

/** Turns each declaration the project scan found unregistered into one diagnostic. */
export const unregisteredDefinitionsCheck: DefinitionCheck = {
  name: "unregistered-definitions",
  run: ({ unregistered }) =>
    unregistered.map(({ unit, specifier }) => {
      const entry = `{ "specifier": "${specifier}" }`;
      return checkDiagnostics.create({
        code: "PH-PKG-DEFINITION-UNREGISTERED",
        source: { specifier },
        path: [],
        message: `${unit} declares a code-first document model that no definitionSources entry reaches, so the package leaves it out.`,
        expected: `a definitionSources entry that reaches ${specifier}`,
        received: "no entry",
        repair: `Add ${entry} to definitionSources.entries in powerhouse.config.json. If definitionSources is absent or schema-first, set it to { "formatVersion": 1, "mode": "code-first", "entries": [${entry}] }; schema-first models keep generating from their stored files.`,
      });
    }),
};
