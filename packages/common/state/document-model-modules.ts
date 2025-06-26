import { driveDocumentModelModule } from "document-drive";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
  type PHDocument,
} from "document-model";
import { useAtomValue } from "jotai";
import { type Loadable } from "jotai/vanilla/utils/loadable";
import { useCallback } from "react";
import {
  loadableDocumentModelModulesAtom,
  unwrappedDocumentModelModulesAtom,
} from "./atoms.js";
import { type PHPackage } from "./ph-packages.js";

export const baseDocumentModelModules = [
  driveDocumentModelModule,
  documentModelDocumentModelModule,
] as DocumentModelModule[];

export async function loadBaseDocumentModelPackages() {
  const driveDocumentModelPackage: PHPackage = {
    id: "powerhouse/document-drive",
    documentModels: [
      driveDocumentModelModule as DocumentModelModule<PHDocument>,
    ],
    editors: [],
    subgraphs: [],
    importScripts: [],
    manifest: {
      name: "Document Drive",
      description: "Document Drive",
      category: "Base document models",
      publisher: {
        name: "Powerhouse DAO",
        url: "https://powerhouse.inc",
      },
    },
  };
  const documentModelDocumentModelPackage: PHPackage = {
    id: "powerhouse/document-model",
    documentModels: [
      documentModelDocumentModelModule as DocumentModelModule<PHDocument>,
    ],
    editors: [],
    subgraphs: [],
    importScripts: [],
    manifest: {
      name: "Document Model",
      description: "Document Model",
      category: "Base document models",
      publisher: {
        name: "Powerhouse DAO",
        url: "https://powerhouse.inc",
      },
    },
  };
  return Promise.resolve([
    driveDocumentModelPackage,
    documentModelDocumentModelPackage,
  ]);
}

export function useDocumentModelModules() {
  const documentModelModules = useAtomValue(loadableDocumentModelModulesAtom);
  return documentModelModules;
}

export function useUnwrappedDocumentModelModules() {
  const documentModelModules = useAtomValue(unwrappedDocumentModelModulesAtom);
  return documentModelModules;
}

export function useDocumentModelModule(
  documentType: string | null | undefined,
): Loadable<DocumentModelModule<PHDocument> | undefined> {
  const loadableDocumentModelModules = useDocumentModelModules();
  if (!documentType) {
    return {
      state: "hasData",
      data: undefined,
    };
  }
  if (loadableDocumentModelModules.state !== "hasData")
    return loadableDocumentModelModules;
  return {
    state: "hasData",
    data: loadableDocumentModelModules.data?.find(
      (d) => d.documentModel.id === documentType,
    ),
  };
}

export function useGetDocumentModelModule() {
  const documentModelModules = useAtomValue(unwrappedDocumentModelModulesAtom);
  const getDocumentModelModule = useCallback(
    (documentType: string) => {
      return documentModelModules?.find(
        (d) => d.documentModel.id === documentType,
      );
    },
    [documentModelModules],
  );
  return getDocumentModelModule;
}
