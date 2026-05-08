import { useDocumentById, usePHToast } from "@powerhousedao/reactor-browser";
import { downloadDocument } from "../utils/download-document.js";

export function useDownloadDocument(id: string | undefined) {
  const [document] = useDocumentById(id);
  const toast = usePHToast();

  return () =>
    downloadDocument(document, (error) =>
      toast?.(`Failed to export document: ${error.message}`),
    );
}
