declare module "virtual:ph:external-packages" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  type DocumentModelLib = import("document-model").DocumentModelLib;
  export const loadExternalPackages: () => Promise<DocumentModelLib[]>;
}
