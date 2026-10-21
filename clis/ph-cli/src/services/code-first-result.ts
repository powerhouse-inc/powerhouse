import type { CodeFirstGenerationResult } from "@powerhousedao/codegen";

export function logCodeFirstResult(result: CodeFirstGenerationResult): void {
  for (const written of result.written) {
    console.log(`Wrote ${written}`);
  }
  console.log(
    result.registration === "unchanged"
      ? "definitionSources in powerhouse.config.json already lists this model"
      : `Registered the model in powerhouse.config.json definitionSources (${result.registration})`,
  );
  console.log("Next: ph model check");
}
