export type * from "./analytics/types.js";
export type * from "./clis/types.js";
export type * from "./document-drive/types.js";
export type * from "./document-model/types.js";
export type * from "./processors/types.js";
export type * from "./registry/types.js";

export type Module = {
  id: string;
  name: string;
  documentTypes: string[];
};

export type DocumentModelModule = {
  id: string;
  name: string;
};

export type Publisher = {
  name: string;
  url: string;
};

export type PowerhouseManifest = {
  name: string;
  description: string;
  category: string;
  publisher: Publisher;
  documentModels: DocumentModelModule[];
  editors: Module[];
  apps: Module[];
  subgraphs: Module[];
  importScripts: Module[];
};

export type PartialPowerhouseManifest = Partial<
  Omit<PowerhouseManifest, "publisher">
> & {
  publisher?: Partial<Publisher>;
};
