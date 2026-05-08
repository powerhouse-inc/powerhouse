import { downloadDocument } from "../utils/download-document.js";
import { useDocumentById } from "./document-by-id.js";
import { usePHToast } from "./toast.js";

export function useDownloadDocument(id: string | undefined) {
  const [document] = useDocumentById(id);
  const toast = usePHToast();

  return () =>
    downloadDocument(document, (error) =>
      toast?.(`Failed to export document: ${error.message}`),
    );
}
