import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import type { DefinitionCheckInput } from "../report/types.js";

/**
 * @experimental One named check over normalized artifacts, which ph-cli passes
 * to `checkProjectDefinitions`. It reports normalized paths.
 */
export type DefinitionCheck<
  TInput extends DefinitionCheckInput = DefinitionCheckInput,
> = {
  readonly name: string;
  readonly run: (
    input: TInput,
  ) =>
    | readonly DefinitionDiagnostic[]
    | Promise<readonly DefinitionDiagnostic[]>;
};
