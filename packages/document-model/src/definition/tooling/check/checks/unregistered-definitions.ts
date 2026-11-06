import { checkDiagnostics } from "../diagnostic-codes.js";
import type { DefinitionCheck } from "../types.js";

/** Turns each declaration the project scan found unregistered into one diagnostic. */
export const unregisteredDefinitionsCheck: DefinitionCheck = {
  name: "unregistered-definitions",
  run: ({ unregistered }) =>
    unregistered.map(({ unit, specifier, reason }) => {
      const entry = `{ "specifier": "${specifier}" }`;
      const notExported = reason === "not-exported";
      return checkDiagnostics.create({
        code: "PH-PKG-DEFINITION-UNREGISTERED",
        source: { specifier },
        path: [],
        message: notExported
          ? `${unit} declares a code-first document model that a selected source imports but does not export, so the package leaves it out.`
          : `${unit} declares a code-first document model that no definitionSources entry reaches, so the package leaves it out.`,
        expected: notExported
          ? `a definitionSources entry that exports the model ${specifier} declares`
          : `a definitionSources entry that reaches ${specifier}`,
        received: notExported ? "imported, not exported" : "no entry",
        repair: `Add ${entry} to definitionSources.entries in powerhouse.config.json. If definitionSources is absent or schema-first, set it to { "formatVersion": 1, "mode": "code-first", "entries": [${entry}] }; schema-first models keep generating from their stored files.`,
      });
    }),
};
