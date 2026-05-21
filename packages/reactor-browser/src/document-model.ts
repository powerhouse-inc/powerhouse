import { reactorDriveDocumentModelModule } from "@powerhousedao/reactor-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  DocumentModelPHState,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";

export const baseDocumentModelsMap: Record<
  string,
  DocumentModelModule<DocumentModelPHState>
> = {
  DocumentModel:
    documentModelDocumentModelModule as DocumentModelModule<DocumentModelPHState>,
  DocumentDrive:
    driveDocumentModelModule as unknown as DocumentModelModule<DocumentModelPHState>,
  ReactorDrive:
    reactorDriveDocumentModelModule as unknown as DocumentModelModule<DocumentModelPHState>,
};

export const baseDocumentModels = Object.values(baseDocumentModelsMap);
