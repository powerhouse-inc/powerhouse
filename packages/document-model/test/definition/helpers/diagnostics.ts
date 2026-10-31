import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { DefinitionError } from "../../../src/definition/kernel/diagnostics.js";

export function diagnosticsOf(
  run: () => unknown,
): readonly DefinitionDiagnostic[] {
  try {
    run();
  } catch (error) {
    if (error instanceof DefinitionError) return error.diagnostics;
    throw error;
  }
  throw new Error("expected a DefinitionError");
}

export function codesOf(
  run: () => unknown,
): readonly (readonly [string, string])[] {
  return diagnosticsOf(run).map(
    (diagnostic) => [diagnostic.code, diagnostic.path.join(".")] as const,
  );
}
