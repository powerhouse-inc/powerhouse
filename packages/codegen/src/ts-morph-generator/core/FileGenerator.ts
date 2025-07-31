import { type DirectoryManager } from "../utilities/DirectoryManager.js";
import { type ImportManager } from "../utilities/ImportManager.js";
import { type GenerationContext } from "./GenerationContext.js";

export abstract class FileGenerator {
  constructor(
    protected importManager: ImportManager,
    protected directoryManager: DirectoryManager,
  ) {}

  abstract generate(context: GenerationContext): Promise<void>;
}
