import { PHDocument, createZip } from "document-model";

export const exportDocument = async (
  document: PHDocument,
  name?: string,
  extension?: string,
) => {
  const zip = createZip(document);

  const ext = extension ? `.${extension.replace(/^\./, "")}` : "";

  try {
    const blob = await zip.generateAsync({ type: "blob" });
    const link = window.document.createElement("a");
    link.style.display = "none";
    link.href = URL.createObjectURL(blob);
    link.download = `${name || document.name || "Untitled"}${ext}.zip`;

    window.document.body.appendChild(link);
    link.click();

    window.document.body.removeChild(link);
  } catch (error) {
    console.error(error);
  }
};
