import type { DirectoryManager, ImportManager } from "@powerhousedao/codegen";
import type { GenerationContext } from "./GenerationContext.js";

export abstract class FileGenerator {
  constructor(
    protected importManager: ImportManager,
    protected directoryManager: DirectoryManager,
  ) {}

  abstract generate(context: GenerationContext): Promise<void>;
}
