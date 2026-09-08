import { describe, expect, it } from "vitest";
import { CodeFirstTodoV1 } from "../../index.js";

describe("CodeFirstTodo v1", () => {
  it("creates a versioned document with the initial state", () => {
    const document = CodeFirstTodoV1.utils.createDocument();

    expect(document.header.documentType).toBe("test/code-first-todo");
    expect(document.state.document.version).toBe(1);
    expect(document.state.global).toEqual({ todos: [] });
  });

  it("adds and toggles a todo", () => {
    let document = CodeFirstTodoV1.utils.createDocument();
    document = CodeFirstTodoV1.reducer(
      document,
      CodeFirstTodoV1.actions.addCodeFirstTodo({
        id: "todo-1",
        title: "Test the code-first model",
      }),
    );
    document = CodeFirstTodoV1.reducer(
      document,
      CodeFirstTodoV1.actions.toggleCodeFirstTodo({ id: "todo-1" }),
    );

    expect(document.state.global.todos).toEqual([
      {
        id: "todo-1",
        title: "Test the code-first model",
        completed: true,
      },
    ]);
  });

  it("ignores a toggle for an unknown todo", () => {
    const document = CodeFirstTodoV1.utils.createDocument();
    const updated = CodeFirstTodoV1.reducer(
      document,
      CodeFirstTodoV1.actions.toggleCodeFirstTodo({ id: "missing" }),
    );

    expect(updated.state.global.todos).toEqual([]);
  });
});
