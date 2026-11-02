import type { HostExport } from "@powerhousedao/host-core/schema";
import { errorMessage } from "../controller/client.js";

export function exportFileName(envelope: HostExport): string {
  return `${envelope.name}.host-export.json`;
}

/** Saves the envelope as an export file; returns what happened, in a sentence. */
export function downloadExport(envelope: HostExport): string {
  const name = exportFileName(envelope);
  try {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(envelope, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return `Downloaded ${name}.`;
  } catch (error) {
    return `Couldn't download ${name}: ${errorMessage(error)}`;
  }
}
