import type {
  Action,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import type { AttachmentRef } from "@powerhousedao/reactor";

export interface CompiledAttachmentExtractor {
  extract(action: Action): AttachmentRef[];
}

export interface IAttachmentSchemaCompiler {
  forModuleAction(
    module: DocumentModelModule,
    actionType: string,
  ): CompiledAttachmentExtractor;
}
