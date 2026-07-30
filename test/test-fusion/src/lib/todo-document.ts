import {
  TodoV1,
  TodoV2,
} from "@powerhousedao/versioned-documents/document-models";
import { todoUpgradeManifest } from "@powerhousedao/versioned-documents/document-models/todo";
import { TodoEditor } from "@powerhousedao/versioned-documents/editors";
import manifestJson from "@powerhousedao/versioned-documents/manifest";
import type { DocumentModelLib, Manifest, PHDocument } from "document-model";

// The real generated package - the same code the local switchboard loads from
// `test/versioned-documents` - assembled from the package's SUBPATH exports and
// handed to `GraphQLReactorProvider` via `packages`.
//
// Subpaths on purpose, never the package ROOT: the root entry also exports
// `processorFactory`, and module resolution happens before tree-shaking, so
// importing anything from the root drags the processor graph (switchboard-side
// code) into the browser bundle and breaks the build.
//
// This is what makes the document-model hooks AND the editor hooks work below
// the provider. (A light app may equally ship no packages at all and let the
// switchboard own the model - both modes are supported.)
//
// DocumentModelLib<any>: the package carries BOTH todo versions, whose
// concrete state generics differ - the same variance escape the provider prop
// uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const todoPackage: DocumentModelLib<any> = {
  manifest: manifestJson as Manifest,
  documentModels: [TodoV1, TodoV2],
  editors: [TodoEditor],
  upgradeManifests: [todoUpgradeManifest],
};

export const TODO_DOCUMENT_TYPE: string = TodoV2.documentModel.global.id;

export type TodoModule = typeof TodoV2;
export type TodoDocument = ReturnType<TodoModule["utils"]["createDocument"]>;
export type TodoItem = TodoDocument["state"]["global"]["todos"][number];

/** Reads the todo list off a document whose state shape is not known statically. */
export function readTodos(document: PHDocument | undefined): TodoItem[] {
  const state = document?.state as TodoDocument["state"] | undefined;
  return state?.global?.todos ?? [];
}
