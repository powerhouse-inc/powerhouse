import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSelectedDocumentOfType } from "@powerhousedao/reactor-browser";
import { generateId, type ActionOf, type DocumentOf } from "document-model";
import { CodeFirstTodoV2 } from "../../document-models/code-first-todo/index.js";
import { AddTodoForm } from "./components/add-todo-form.js";
import { TodoList } from "./components/todo-list.js";

type CodeFirstTodoDocument = DocumentOf<typeof CodeFirstTodoV2>;
type CodeFirstTodoAction = ActionOf<typeof CodeFirstTodoV2>;

const DOCUMENT_TYPE = CodeFirstTodoV2.documentModel.global.id;

export default function Editor() {
  const [document, dispatch] = useSelectedDocumentOfType<
    CodeFirstTodoDocument,
    CodeFirstTodoAction
  >(DOCUMENT_TYPE);
  const { listName, todos } = document.state.global;
  const completedCount = todos.reduce(
    (count, todo) => count + Number(todo.completed),
    0,
  );

  function renameList(name: string) {
    if (name !== listName) {
      dispatch(CodeFirstTodoV2.actions.renameCodeFirstList({ name }));
    }
  }

  function addTodo(title: string) {
    dispatch(
      CodeFirstTodoV2.actions.addCodeFirstTodo({
        id: generateId(),
        title,
      }),
    );
  }

  function toggleTodo(id: string) {
    dispatch(CodeFirstTodoV2.actions.toggleCodeFirstTodo({ id }));
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <DocumentToolbar />

      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="mb-10 border-b border-border pb-8">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span>Code-first document model</span>
            <span aria-hidden="true">/</span>
            <span>Version {document.state.document.version}</span>
          </div>

          <label
            className="block text-sm font-medium text-muted-foreground"
            htmlFor="code-first-list-name"
          >
            List name
          </label>
          <input
            className="mt-2 w-full border-0 border-b border-border bg-transparent px-0 pb-3 text-3xl font-semibold tracking-tight text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground sm:text-4xl"
            defaultValue={listName}
            id="code-first-list-name"
            key={listName}
            onBlur={(event) => {
              const name = event.currentTarget.value.trim();
              if (!name) {
                event.currentTarget.value = listName;
                return;
              }
              renameList(name);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                event.currentTarget.value = listName;
                event.currentTarget.blur();
              }
            }}
          />

          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <div className="flex gap-2">
              <dt>Total</dt>
              <dd className="font-semibold text-foreground">{todos.length}</dd>
            </div>
            <div className="flex gap-2">
              <dt>Completed</dt>
              <dd className="font-semibold text-foreground">
                {completedCount}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt>Document</dt>
              <dd className="max-w-52 truncate font-mono text-xs text-foreground">
                {document.header.id}
              </dd>
            </div>
          </dl>
        </header>

        <section aria-labelledby="add-todo-heading">
          <h2 className="sr-only" id="add-todo-heading">
            Add a todo
          </h2>
          <AddTodoForm onAdd={addTodo} />
        </section>

        <section aria-labelledby="todo-list-heading" className="mt-8">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2
              className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              id="todo-list-heading"
            >
              Todos
            </h2>
            <p className="text-xs text-muted-foreground">
              Changes dispatch through the code-first reducer
            </p>
          </div>
          <TodoList onToggle={toggleTodo} todos={todos} />
        </section>
      </main>
    </div>
  );
}
