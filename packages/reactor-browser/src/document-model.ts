import { reactorDriveDocumentModelModule } from "@powerhousedao/reactor-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";

export const baseDocumentModelsMap: Record<string, DocumentModelModule> = {
  DocumentModel:
    documentModelDocumentModelModule as unknown as DocumentModelModule,
  DocumentDrive: driveDocumentModelModule as unknown as DocumentModelModule,
  ReactorDrive:
    reactorDriveDocumentModelModule as unknown as DocumentModelModule,
};

export const baseDocumentModels = Object.values(baseDocumentModelsMap);
