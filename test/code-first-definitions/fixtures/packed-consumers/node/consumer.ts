import {
  VersionedTodoV1,
  VersionedTodoV2,
  documentModels,
} from "@powerhousedao/code-first-packed-fixture";
import * as documentModelEntry from "@powerhousedao/code-first-packed-fixture/document-models";

const action = VersionedTodoV1.actions.addTodo({
  id: "packed-node",
  title: "Packed Node",
  completed: false,
});
const versions: readonly number[] = documentModels.map(
  (module) => module.version ?? 1,
);

void action;
void versions;
void VersionedTodoV2.definition;
void documentModelEntry.VersionedTodoV1;

