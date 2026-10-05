// A reactor client over real workflow documents: execute runs the reducer.
import {
  reducer,
  utils,
  type WorkflowDocument,
} from "@powerhousedao/workflow/document-models/workflow";
import type { Action } from "document-model";

export class Documents {
  readonly byId = new Map<string, WorkflowDocument>();

  apply(id: string, ...list: Action[]): WorkflowDocument {
    let document = this.byId.get(id) ?? utils.createDocument();
    document.header.id = id;
    for (const action of list) {
      document = reducer(document, action as never);
      const error = document.operations.global.at(-1)?.error;
      if (error) throw new Error(`${action.type}: ${error}`);
    }
    this.byId.set(id, document);
    return document;
  }

  client() {
    return {
      find: () => Promise.resolve({ results: [] }),
      get: (id: string) => {
        const document = this.byId.get(id);
        return document
          ? Promise.resolve(structuredClone(document))
          : Promise.reject(new Error(`No document ${id}`));
      },
      execute: (id: string, _branch: string, list: Action[]) =>
        Promise.resolve(this.apply(id, ...list)),
    };
  }
}
