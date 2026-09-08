/// <reference lib="webworker" />

import {
  VersionedTodoV1,
  VersionedTodoV2,
  documentModels,
} from "@powerhousedao/code-first-packed-fixture";
import * as documentModelEntry from "@powerhousedao/code-first-packed-fixture/document-models";

const action = VersionedTodoV2.actions.editTitle({ title: "Worker" });
const versions: readonly number[] = documentModels.map(
  (module) => module.version ?? 1,
);

void action;
void versions;
void VersionedTodoV1.definition;
void documentModelEntry.VersionedTodoV2;

