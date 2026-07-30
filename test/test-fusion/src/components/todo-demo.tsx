"use client";

import {
  useDispatch,
  useDocument,
  useDocumentModelModuleById,
  useDocumentModelModules,
  useReactorClient,
} from "@powerhousedao/reactor-browser/graphql-client";
import { generateId, type PHDocument } from "document-model";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  readTodos,
  TODO_DOCUMENT_TYPE,
  type TodoModule,
} from "@/lib/todo-document";

// The demo for the light GraphQL reactor client: create, read and dispatch
// against a Switchboard through the same hooks Connect uses, with no reactor
// in the bundle. The open document's id lives in the URL so a reload proves
// the state came back from the server rather than from memory.
//
// The todo module itself is resolved through useDocumentModelModuleById - not
// imported directly - so the page exercises the whole documentModels chain:
// provider prop -> StaticPackageManager -> package-derived hooks.
export function TodoDemo() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const client = useReactorClient();
  const models = useDocumentModelModules();
  const todoModule = useDocumentModelModuleById(TODO_DOCUMENT_TYPE) as
    | TodoModule
    | undefined;
  const documentId = searchParams.get("id");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();

  async function createDocument() {
    if (!client || !todoModule) return;
    setCreating(true);
    setError(undefined);
    try {
      const created = await client.create(todoModule.utils.createDocument());
      router.replace(`/documents?id=${created.header.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main
      className="flex flex-1 flex-col items-center gap-6 p-16"
      data-testid="todo-demo"
    >
      <h1 className="text-2xl font-semibold">Todo lists</h1>
      <p
        className="font-mono text-xs text-foreground/50"
        data-testid="model-registered"
      >
        {(models ?? [])
          .map(
            (module) => `${module.documentModel.global.id}@${module.version}`,
          )
          .join(", ")}
      </p>
      <button
        type="button"
        data-testid="create-document"
        disabled={!client || !todoModule || creating}
        onClick={() => void createDocument()}
        className="h-9 rounded-lg border border-black/15 px-4 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10"
      >
        Create todo list
      </button>
      <p
        className="font-mono text-xs text-foreground/50"
        data-testid="document-id"
      >
        {documentId ?? ""}
      </p>
      {error ? (
        <p className="text-sm text-red-600" data-testid="demo-error">
          {error}
        </p>
      ) : null}
      {documentId ? (
        <Suspense
          fallback={
            <p
              className="text-sm text-foreground/50"
              data-testid="document-loading"
            >
              Loading document…
            </p>
          }
        >
          <TodoList documentId={documentId} />
        </Suspense>
      ) : null}
    </main>
  );
}

function TodoList({ documentId }: { documentId: string }) {
  const document = useDocument(documentId) as PHDocument | undefined;
  const todoModule = useDocumentModelModuleById(TODO_DOCUMENT_TYPE) as
    | TodoModule
    | undefined;
  const [, dispatch] = useDispatch(document);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string>();
  const todos = readTodos(document);

  function add() {
    const trimmed = title.trim();
    if (!trimmed || !todoModule) return;
    setError(undefined);
    dispatch(
      todoModule.actions.addTodo({
        id: generateId(),
        title: trimmed,
        completed: false,
      }),
      (errors) => setError(errors.map((e) => e.message).join("; ")),
    );
    setTitle("");
  }

  return (
    <section className="flex w-96 flex-col gap-3" data-testid="todo-document">
      <div className="flex gap-2">
        <input
          data-testid="todo-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
          placeholder="What needs doing?"
          className="h-9 flex-1 rounded-lg border border-black/15 px-3 text-sm dark:border-white/20"
        />
        <button
          type="button"
          data-testid="add-todo"
          onClick={add}
          className="h-9 rounded-lg border border-black/15 px-4 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Add
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-600" data-testid="dispatch-error">
          {error}
        </p>
      ) : null}
      <ul
        className="flex flex-col gap-1 text-left text-sm"
        data-testid="todo-list"
      >
        {todos.map((todo) => (
          <li key={todo.id} data-testid="todo-item">
            {todo.title}
          </li>
        ))}
      </ul>
    </section>
  );
}
