import {
  TodoV1,
  TodoV2,
} from "@powerhousedao/versioned-documents/document-models";
import type { DocumentModelModule, PHDocument } from "document-model";

// The real generated todo modules - the same code the local switchboard loads
// from `test/versioned-documents` - imported from the package's
// `document-models` SUBPATH and handed to `GraphQLReactorProvider` via
// `documentModels`. Both versions register, and the module hooks resolve the
// latest, exactly like the reactor's registry does.
//
// Modules only, deliberately: editors are not portable outside Connect yet
// (they read the selected document from Connect's drive/node selection) and
// would inflate the bundle - a light app that needs an editor imports the
// React component directly. And never import from the package ROOT: its entry
// also exports `processorFactory`, and module resolution happens before
// tree-shaking, so a root import drags server-side processor code into the
// browser bundle.
// DocumentModelModule<any>: the two versions' concrete state generics differ -
// the same variance escape the provider prop uses. The annotation also keeps
// the exported type portable (TS2883).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const todoDocumentModels: readonly DocumentModelModule<any>[] = [
  TodoV1,
  TodoV2,
];

export const TODO_DOCUMENT_TYPE: string = TodoV2.documentModel.global.id;

export type TodoModule = typeof TodoV2;
export type TodoDocument = ReturnType<TodoModule["utils"]["createDocument"]>;
export type TodoItem = TodoDocument["state"]["global"]["todos"][number];

/** Reads the todo list off a document whose state shape is not known statically. */
export function readTodos(document: PHDocument | undefined): TodoItem[] {
  const state = document?.state as TodoDocument["state"] | undefined;
  return state?.global?.todos ?? [];
}
