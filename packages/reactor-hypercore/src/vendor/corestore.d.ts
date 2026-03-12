declare module "corestore" {
  interface CorestoreOptions {
    storage?: string;
  }

  class Corestore {
    constructor(storage: string, options?: CorestoreOptions);

    ready(): Promise<void>;
    close(): Promise<void>;

    get(options?: { name?: string; key?: Buffer }): unknown;
  }

  export = Corestore;
}
