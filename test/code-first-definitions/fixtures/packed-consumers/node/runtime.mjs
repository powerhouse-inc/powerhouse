import { createHash } from "node:crypto";
import {
  VersionedTodoV1,
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
const action = VersionedTodoV1.actions.addTodo({
  id: "packed-node",
  title: "Packed Node",
  completed: false,
});

process.stdout.write(
  `__PH_B5_NODE__${JSON.stringify({
    projection,
    actionType: action.type,
    splitEntryMatches:
      documentModelEntry.VersionedTodoV1 === VersionedTodoV1,
    resolvedEntries: {
      root: import.meta.resolve("@powerhousedao/code-first-packed-fixture"),
      documentModels: import.meta.resolve(
        "@powerhousedao/code-first-packed-fixture/document-models",
      ),
    },
  })}\n`,
);
