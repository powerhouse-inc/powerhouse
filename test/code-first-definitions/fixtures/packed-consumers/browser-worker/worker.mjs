import { createHash } from "node:crypto";
import { parentPort } from "node:worker_threads";
import {
  VersionedTodoV2,
  documentModels,
} from "@powerhousedao/code-first-packed-fixture";
import * as documentModelEntry from "@powerhousedao/code-first-packed-fixture/document-models";

const digest = (value) =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const projection = documentModels.map((module) => ({
  key: `${module.documentModel.global.id}@${module.version ?? 1}`,
  version: module.version ?? 1,
  specificationDigest: digest(module.documentModel.global.specifications),
  sdlDigest: digest(
    module.documentModel.global.specifications.map((specification) =>
      specification.modules.map((scope) => ({
        name: scope.name,
        operations: scope.operations.map((operation) => ({
          name: operation.name,
          schema: operation.schema,
        })),
      })),
    ),
  ),
  actionNames: Object.keys(module.actions).sort(),
  definitionDigest: module.definition ? digest(module.definition) : null,
}));
const action = VersionedTodoV2.actions.editTitle({ title: "Worker" });

parentPort?.postMessage({
  status: "ok",
  projection,
  actionType: action.type,
  splitEntryMatches: documentModelEntry.VersionedTodoV2 === VersionedTodoV2,
  resolvedEntries: {
    root: import.meta.resolve("@powerhousedao/code-first-packed-fixture"),
    documentModels: import.meta.resolve(
      "@powerhousedao/code-first-packed-fixture/document-models",
    ),
  },
});
