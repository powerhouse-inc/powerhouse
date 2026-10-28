// An app's `allowedDocumentTypes` left unset or empty means every type, in
// each hook that reads it.
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useAllowedDocumentModelModules } from "../src/hooks/allowed-document-model-modules.js";
import { useDocumentTypes } from "../src/hooks/document-types.js";
import { createPHStore, PHStoreProvider } from "../src/hooks/ph-store.js";
import { isDocumentTypeSupported } from "../src/utils/documents.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const modules = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
] as unknown as DocumentModelModule[];
const everyType = ["powerhouse/document-model", "powerhouse/document-drive"];

async function renderWith(allowedDocumentTypes: string[] | undefined) {
  const store = createPHStore({
    allowedDocumentTypes,
    vetraPackageManager: {
      packages: [{ documentModels: modules }],
      subscribe: () => () => {},
    } as never,
  });
  const { result } = await renderHook(
    () => ({
      documentTypes: useDocumentTypes(),
      moduleIds: useAllowedDocumentModelModules()?.map(
        (module) => module.documentModel.global.id,
      ),
    }),
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <PHStoreProvider store={store}>{children}</PHStoreProvider>
      ),
    },
  );
  return result.current;
}

describe("allowedDocumentTypes", () => {
  it.each([
    ["unset", undefined],
    ["empty", []],
  ])("%s, allows every type", async (_name, allowed) => {
    const { documentTypes, moduleIds } = await renderWith(allowed);

    expect(documentTypes).toEqual(everyType);
    expect(moduleIds).toEqual(everyType);
    expect(
      isDocumentTypeSupported("powerhouse/document-drive", documentTypes),
    ).toBe(true);
  });

  it("listing types allows only those", async () => {
    const { documentTypes, moduleIds } = await renderWith([
      "powerhouse/document-model",
    ]);

    expect(documentTypes).toEqual(["powerhouse/document-model"]);
    expect(moduleIds).toEqual(["powerhouse/document-model"]);
    expect(
      isDocumentTypeSupported("powerhouse/document-drive", documentTypes),
    ).toBe(false);
  });
});
