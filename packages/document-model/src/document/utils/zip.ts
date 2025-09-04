import type { PHDocument } from "document-model";
import { filterDocumentOperationsResultingState } from "document-model";
import JSZip from "jszip";

export function createZip(document: PHDocument) {
  // create zip file
  const zip = new JSZip();

  const header = document.header;
  zip.file("header.json", JSON.stringify(header, null, 2));
  zip.file("state.json", JSON.stringify(document.initialState || {}, null, 2));
  zip.file("current-state.json", JSON.stringify(document.state || {}, null, 2));
  zip.file(
    "operations.json",
    JSON.stringify(
      filterDocumentOperationsResultingState(document.operations),
      null,
      2,
    ),
  );

  if (document.attachments) {
    const attachments = Object.keys(document.attachments);
    attachments.forEach((key) => {
      const { data, ...attributes } = document.attachments?.[key] ?? {};
      if (data) {
        zip.file(key, data, {
          base64: true,
          createFolders: true,
          comment: JSON.stringify(attributes),
        });
      }
    });
  }

  return zip;
}
