declare module "*.svg" {
  const ReactComponent: React.FunctionComponent<
    React.SVGAttributes<SVGElement>
  >;
  export { ReactComponent };
}

declare module "virtual:ph:external-packages" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  type DocumentModelLib = import("document-model").DocumentModelLib;
  export const loadExternalPackages: () => Promise<DocumentModelLib[]>;
}
