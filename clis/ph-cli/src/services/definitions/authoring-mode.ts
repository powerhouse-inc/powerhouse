import { selectModelGeneration } from "@powerhousedao/codegen";
import type { GenerateDocumentModelArgs } from "../../types.js";

export function selectProjectModelGeneration(
  projectDir: string,
  codeFirst?: boolean,
) {
  return selectModelGeneration({ projectDir, codeFirst });
}

export function selectDocumentModelGeneration(
  args: GenerateDocumentModelArgs,
  projectDir: string,
) {
  return selectProjectModelGeneration(projectDir, args.codeFirst);
}

export function selectScaffoldGeneration(
  args: GenerateDocumentModelArgs,
  projectDir: string,
) {
  const generation = selectDocumentModelGeneration(args, projectDir);
  if (generation.mode !== "code-first")
    throw new Error(
      "--name creates a code-first document model. Pass --code-first.",
    );
  return generation;
}
