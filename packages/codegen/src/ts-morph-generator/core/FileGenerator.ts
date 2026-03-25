import type { DeclarationManager } from "../utilities/DeclarationManager.js";
import type { DirectoryManager } from "../utilities/DirectoryManager.js";
import type { ImportManager } from "../utilities/ImportManager.js";
import type { GenerationContext } from "./GenerationContext.js";

export abstract class FileGenerator {
  constructor(
    protected importManager: ImportManager,
    protected directoryManager: DirectoryManager,
    protected declarationManager: DeclarationManager,
  ) {}

  abstract generate(context: GenerationContext): Promise<void>;
}
