import type {
  DirectoryManager,
  GenerationContext,
  ImportManager,
} from "@powerhousedao/codegen";

export abstract class FileGenerator {
  constructor(
    protected importManager: ImportManager,
    protected directoryManager: DirectoryManager,
  ) {}

  abstract generate(context: GenerationContext): Promise<void>;
}
