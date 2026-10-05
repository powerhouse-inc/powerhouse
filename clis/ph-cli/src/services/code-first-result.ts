import type { CodeFirstGenerationResult } from "@powerhousedao/codegen";

export function logCodeFirstResult(
  result: CodeFirstGenerationResult,
  kind: "model" | "subgraph",
): void {
  for (const written of result.written) {
    console.log(`Wrote ${written}`);
  }
  console.log(
    result.registration === "unchanged"
      ? `definitionSources in powerhouse.config.json already lists this ${kind}`
      : `Registered the ${kind} in powerhouse.config.json definitionSources (${result.registration})`,
  );
  console.log("Next: ph model check");
}
