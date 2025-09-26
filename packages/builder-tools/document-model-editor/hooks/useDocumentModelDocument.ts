import type {
  BaseCreators,
  UseDocumentReturn,
} from "@powerhousedao/reactor-browser";
import { useDocumentOfModule } from "@powerhousedao/reactor-browser";
import {
  documentModelActions,
  documentModelDocumentModelModule,
} from "document-model";

export function useDocumentModelDocument(
  documentId: string,
): UseDocumentReturn<
  typeof documentModelDocumentModelModule,
  typeof documentModelActions & BaseCreators
> {
  return useDocumentOfModule(
    documentId,
    documentModelDocumentModelModule,
    documentModelActions,
  );
}
