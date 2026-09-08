import { describe, expect, it } from "vitest";
import { CodeFirstTodoV2 } from "../../index.js";

describe("CodeFirstTodo v2", () => {
  it("creates a versioned document with the initial state", () => {
    const document = CodeFirstTodoV2.utils.createDocument();

    expect(document.header.documentType).toBe("test/code-first-todo");
    expect(document.state.document.version).toBe(2);
    expect(document.state.global).toEqual({
      todos: [],
      listName: "Code-first todos",
    });
  });

  it("adds, toggles, and renames todos", () => {
    let document = CodeFirstTodoV2.utils.createDocument();
    document = CodeFirstTodoV2.reducer(
      document,
      CodeFirstTodoV2.actions.addCodeFirstTodo({
        id: "todo-2",
        title: "Exercise version two",
      }),
    );
    document = CodeFirstTodoV2.reducer(
      document,
      CodeFirstTodoV2.actions.toggleCodeFirstTodo({ id: "todo-2" }),
    );
    document = CodeFirstTodoV2.reducer(
      document,
      CodeFirstTodoV2.actions.renameCodeFirstList({ name: "Release list" }),
    );

    expect(document.state.global).toEqual({
      listName: "Release list",
      todos: [
        {
          id: "todo-2",
          title: "Exercise version two",
          completed: true,
        },
      ],
    });
  });

  it("ignores a toggle for an unknown todo", () => {
    const document = CodeFirstTodoV2.utils.createDocument();
    const updated = CodeFirstTodoV2.reducer(
      document,
      CodeFirstTodoV2.actions.toggleCodeFirstTodo({ id: "missing" }),
    );

    expect(updated.state.global.todos).toEqual([]);
  });
});
