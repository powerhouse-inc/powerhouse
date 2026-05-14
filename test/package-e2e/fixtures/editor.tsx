import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { actions, useSelectedTodoDocument } from "document-models/todo";
import { useState } from "react";

export default function Editor() {
  const [document, dispatch] = useSelectedTodoDocument();
  const [newTitle, setNewTitle] = useState("");
  if (!document) return null;

  const todos = document.state.global.todos ?? [];

  const handleAdd = () => {
    const title = newTitle.trim();
    if (!title) return;
    dispatch(
      actions.addTodo({
        id: crypto.randomUUID(),
        title,
        completed: false,
      }),
    );
    setNewTitle("");
  };

  const handleToggle = (id: string, completed: boolean) => {
    dispatch(actions.updateTodo({ id, title: null, completed: !completed }));
  };

  const handleRemove = (id: string) => {
    dispatch(actions.removeTodo({ id }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <DocumentToolbar />
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-4 text-2xl font-bold">{document.header.name}</h1>

        <div className="mb-6 flex gap-2">
          <input
            type="text"
            aria-label="New todo title"
            placeholder="New todo title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            className="flex-1 rounded border border-gray-300 px-3 py-2"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="rounded bg-blue-600 px-4 py-2 text-white"
          >
            Add Todo
          </button>
        </div>

        <ul data-testid="todo-list" className="space-y-2">
          {todos.map((todo) => (
            <li
              key={todo.id}
              data-testid="todo-item"
              data-todo-id={todo.id}
              className="flex items-center gap-2 rounded border border-gray-200 bg-white p-3"
            >
              <input
                type="checkbox"
                aria-label={`Toggle ${todo.title}`}
                checked={todo.completed}
                onChange={() => handleToggle(todo.id, todo.completed)}
              />
              <span
                className={
                  todo.completed ? "flex-1 line-through opacity-60" : "flex-1"
                }
              >
                {todo.title}
              </span>
              <button
                type="button"
                aria-label={`Remove ${todo.title}`}
                onClick={() => handleRemove(todo.id)}
                className="text-sm text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-sm text-gray-500">
          <span data-testid="todo-count">{todos.length}</span> todo(s)
        </p>
      </div>
    </div>
  );
}
