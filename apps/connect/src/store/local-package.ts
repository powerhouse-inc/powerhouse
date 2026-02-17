import { convertLegacyLibToVetraPackage } from "@powerhousedao/reactor-browser";
import type { DocumentModelLib } from "document-model";

export async function loadLocalPackage() {
  try {
    // @ts-expect-error /index.ts will only be resolved on studio mode
    const module = (await import("/index.ts")) as unknown as DocumentModelLib;
    await import("/style.css");
    return convertLegacyLibToVetraPackage(module);
  } catch (error) {
    console.error(error);
    return null;
  }
}
