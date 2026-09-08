import type { GlobalStateOf } from "document-model";
import type { CodeFirstTodoV2 } from "../../../document-models/code-first-todo/index.js";

type Todo = GlobalStateOf<typeof CodeFirstTodoV2>["todos"][number];

type TodoListProps = {
  readonly todos: readonly Todo[];
  readonly onToggle: (id: string) => void;
};

export function TodoList({ todos, onToggle }: TodoListProps) {
  if (todos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
        <p className="text-base font-medium text-foreground">No todos yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add one above to dispatch the first code-first operation.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border [content-visibility:auto]">
      {todos.map((todo) => (
        <li className="bg-background" key={todo.id}>
          <label className="flex cursor-pointer items-center gap-4 px-4 py-4 hover:bg-muted/40 sm:px-5">
            <input
              aria-label={`${todo.completed ? "Reopen" : "Complete"} ${todo.title}`}
              checked={todo.completed}
              className="size-5 shrink-0 accent-foreground"
              onChange={() => onToggle(todo.id)}
              type="checkbox"
            />
            <span
              className={
                todo.completed
                  ? "min-w-0 flex-1 break-words text-muted-foreground line-through"
                  : "min-w-0 flex-1 break-words text-foreground"
              }
            >
              {todo.title}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {todo.id.slice(0, 8)}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
