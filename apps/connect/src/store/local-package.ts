import { convertLegacyLibToVetraPackage } from "@powerhousedao/reactor-browser";
import type { DocumentModelLib } from "document-model";

export async function loadLocalPackage() {
  try {
    const url = "/index.ts";
    const cssUrl = "/style.css";
    const module = (await import(
      /* @vite-ignore */ url
    )) as unknown as DocumentModelLib;
    await import(/* @vite-ignore */ cssUrl);
    return convertLegacyLibToVetraPackage(module);
  } catch (error) {
    console.warn(error);
    return null;
  }
}
