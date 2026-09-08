import { useState, type FormEvent } from "react";

type AddTodoFormProps = {
  readonly onAdd: (title: string) => void;
};

export function AddTodoForm({ onAdd }: AddTodoFormProps) {
  const [title, setTitle] = useState("");
  const trimmedTitle = title.trim();

  function submitTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedTitle) return;
    onAdd(trimmedTitle);
    setTitle("");
  }

  return (
    <form className="flex gap-3" onSubmit={submitTodo}>
      <label className="sr-only" htmlFor="new-code-first-todo">
        Todo title
      </label>
      <input
        autoComplete="off"
        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground"
        id="new-code-first-todo"
        onChange={(event) => setTitle(event.currentTarget.value)}
        placeholder="What needs to be done?"
        value={title}
      />
      <button
        className="rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background transition-opacity enabled:hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35"
        disabled={!trimmedTitle}
        type="submit"
      >
        Add todo
      </button>
    </form>
  );
}
