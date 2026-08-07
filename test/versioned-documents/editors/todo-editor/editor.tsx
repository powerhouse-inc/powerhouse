import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { generateId } from "document-model/core";
import { useState } from "react";
import { actions, useSelectedTodoDocument } from "document-models/todo";

export default function Editor() {
  const [document, dispatch] = useSelectedTodoDocument();
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [titleInput, setTitleInput] = useState(
    document.state.global.title ?? "",
  );

  if (!document) return null;

  const state = document.state.global;
  const version = document.state.document.version;

  const handleTitleCommit = () => {
    dispatch(actions.editTitle({ title: titleInput }));
  };

  const handleAddTodo = () => {
    const title = newTodoTitle.trim();
    if (!title) return;
    dispatch(actions.addTodo({ id: generateId(), title, completed: false }));
    setNewTodoTitle("");
  };

  return (
    <div className="min-h-screen bg-background">
      <DocumentToolbar />
      <div className="flex justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-6">
            {version >= 2 ? (
              <input
                type="text"
                className="w-full rounded border border-border bg-background px-3 py-2 text-lg font-semibold"
                placeholder="Untitled"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={handleTitleCommit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleCommit();
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Title is available after updating this document.
              </p>
            )}
          </div>

          <div className="mb-4 flex gap-2">
            <input
              type="text"
              className="flex-1 rounded border border-border bg-background px-3 py-2"
              placeholder="Add a todo"
              value={newTodoTitle}
              onChange={(e) => setNewTodoTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTodo();
              }}
            />
            <button
              type="button"
              className="rounded bg-primary px-4 py-2 text-primary-foreground"
              onClick={handleAddTodo}
            >
              Add
            </button>
          </div>

          <ul className="flex flex-col gap-2">
            {state.todos.map((todo) => (
              <li
                key={todo.id}
                className="flex items-center gap-2 rounded border border-border px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() =>
                    dispatch(
                      actions.updateTodo({
                        id: todo.id,
                        completed: !todo.completed,
                      }),
                    )
                  }
                />
                <span
                  className={
                    todo.completed
                      ? "flex-1 text-muted-foreground line-through"
                      : "flex-1"
                  }
                >
                  {todo.title}
                </span>
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-destructive"
                  onClick={() => dispatch(actions.removeTodo({ id: todo.id }))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
