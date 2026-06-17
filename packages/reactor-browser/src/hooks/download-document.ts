import { downloadDocument } from "../utils/download-document.js";
import { useGetDocument } from "./document-cache.js";
import { usePHToast } from "./toast.js";

export function useDownloadDocument(id: string | undefined) {
  const getDocument = useGetDocument();
  const toast = usePHToast();

  return async () => {
    if (!id) return;
    const handleError = (error: Error) =>
      toast?.(`Failed to export document: ${error.message}`);
    try {
      const document = await getDocument(id);
      downloadDocument(document, handleError);
    } catch (error) {
      handleError(error as Error);
    }
  };
}
