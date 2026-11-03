import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import type { DefinitionCheckInput } from "../report/types.js";

/** One named check over normalized artifacts. It reports normalized paths. */
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
