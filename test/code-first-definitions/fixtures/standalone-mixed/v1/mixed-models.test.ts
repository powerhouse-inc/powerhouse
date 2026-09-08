import {
  applyUpgradeDocumentAction,
  computeUpgradeTransitions,
  type PHDocument,
  type UpgradeDocumentAction,
} from "document-model";
import { describe, expect, it } from "vitest";
import {
  CodeFirstTodoV1,
  CodeFirstTodoV2,
  codeFirstTodoUpgradeManifest,
} from "../document-models/code-first-todo/index.js";
import { documentModels } from "../document-models/document-models.js";
import { LegacyTodo } from "../document-models/legacy-todo/v1/index.js";
import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { CodeFirstStatusSubgraph } from "../subgraphs/code-first-status/index.js";
import { LegacyStatusSubgraph } from "../subgraphs/legacy-status/index.js";
import { CodeFirstTodoEditor } from "../editors/code-first-todo-editor/module.js";
import { editors } from "../editors/editors.js";

describe("mixed document-model package", () => {
  it("loads legacy and code-first modules through the same registry shape", () => {
    expect(documentModels).toEqual([
      CodeFirstTodoV1,
      CodeFirstTodoV2,
      LegacyTodo,
    ]);
    expect("definition" in LegacyTodo).toBe(false);
    expect(CodeFirstTodoV1.definition.formatVersion).toBe(1);
    expect(CodeFirstTodoV2.definition.formatVersion).toBe(1);
    expect(LegacyTodo.documentModel.global.id).toBe("test/legacy-todo");
    expect(CodeFirstTodoV1.documentModel.global.id).toBe(
      "test/code-first-todo",
    );
  });

  it("creates and reduces a legacy document", () => {
    let document = LegacyTodo.utils.createDocument();
    document = LegacyTodo.reducer(
      document,
      LegacyTodo.actions.addLegacyTodo({
        id: "legacy-1",
        title: "Keep generated models working",
        completed: false,
      }),
    );
    document = LegacyTodo.reducer(
      document,
      LegacyTodo.actions.toggleLegacyTodo({ id: "legacy-1" }),
    );
    document = LegacyTodo.reducer(
      document,
      LegacyTodo.actions.toggleLegacyTodo({ id: "missing" }),
    );

    expect(document.state.global.todos).toEqual([
      {
        id: "legacy-1",
        title: "Keep generated models working",
        completed: true,
      },
    ]);
  });

  it("upgrades a code-first v1 document and continues reducing with v2", () => {
    let document = CodeFirstTodoV1.utils.createDocument();
    document = CodeFirstTodoV1.reducer(
      document,
      CodeFirstTodoV1.actions.addCodeFirstTodo({
        id: "code-first-1",
        title: "Upgrade without generated source",
      }),
    );

    const upgradeAction: UpgradeDocumentAction = {
      id: "upgrade-code-first-v1-v2",
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2026-09-01T00:00:00.000Z",
      input: {
        model: "test/code-first-todo",
        fromVersion: 1,
        toVersion: 2,
        documentId: document.header.id,
        revision: {},
      },
    };
    const transitions = computeUpgradeTransitions(
      codeFirstTodoUpgradeManifest,
      1,
      2,
    );
    let upgraded = applyUpgradeDocumentAction(
      document,
      upgradeAction,
      transitions,
    ) as PHDocument<
      ReturnType<(typeof CodeFirstTodoV2)["utils"]["createState"]>
    >;

    expect(upgraded.state.document.version).toBe(2);
    expect(upgraded.state.global).toMatchObject({
      listName: "Migrated code-first todos",
      todos: [{ id: "code-first-1", completed: false }],
    });

    upgraded = CodeFirstTodoV2.reducer(
      upgraded,
      CodeFirstTodoV2.actions.renameCodeFirstList({
        name: "Upgraded in a standalone consumer",
      }),
    );
    expect(upgraded.state.global.listName).toBe(
      "Upgraded in a standalone consumer",
    );
  });

  it("exports both handwritten and defined subgraphs as BaseSubgraph classes", () => {
    expect(Object.getPrototypeOf(LegacyStatusSubgraph.prototype)).toBe(
      BaseSubgraph.prototype,
    );
    expect(Object.getPrototypeOf(CodeFirstStatusSubgraph.prototype)).toBe(
      BaseSubgraph.prototype,
    );
  });

  it("registers an editor for the code-first family", () => {
    expect(editors).toEqual([CodeFirstTodoEditor]);
    expect(CodeFirstTodoEditor.documentTypes).toEqual(["test/code-first-todo"]);
    expect(CodeFirstTodoEditor.config).toEqual({
      id: "code-first-todo-editor",
      name: "Code First Todo Editor",
    });
  });
});
