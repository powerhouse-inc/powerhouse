---
toc_max_heading_level: 3
---

# Overview and quickstart

`GraphQLReactorClient` is a light client for the `@powerhousedao/reactor-browser`
hooks. It talks plain GraphQL to a [Switchboard](/academy/Reference/Reactor/WorkingWithTheReactor)
and fills the document slots of `window.ph` the full in-browser reactor fills, so
`useDocument`, `useDispatch` and `useReactorClient` work in a plain web app with
no reactor, no PGLite and no job queue in the bundle.

It fills the document slots and no others. The provider publishes neither
`window.ph.vetraPackageManager` nor `window.ph.reactorClientModule`, so the
package, document-model and editor-module hooks find nothing below it. An app
renders the components it imports itself and builds its own actions. See
[Limitations](/academy/Reference/ReactorBrowserClient/ApiReference#limitations).

```tsx
import {
  GraphQLReactorProvider,
  useSwitchboardClient,
} from "@powerhousedao/reactor-browser/graphql-client";
```

Two implementations satisfy the same interface. Connect and Vetra Studio run the
full reactor client; a web app runs this one. The document hooks below the
provider are identical either way, so a component that reads and writes
documents moves between them unchanged.

## When to use it

Use the light client when the app reads and writes documents that live on a
Switchboard, and does not need local-first editing. Everything is remote-first:
a dispatch is a round trip to the server, and there is no offline queue.

Use the full reactor (Connect, Vetra Studio, or your own `ReactorBuilder` setup)
when you need local-first state, drives, jobs, or the document-model modules in
the browser.

## What you need

- A running Switchboard with the document model your app writes. `ph switchboard`
  in a Powerhouse project serves one on `http://localhost:4001/graphql`.
- React 19 or later, the package's peer requirement. The document hooks read
  through `use()`.
- Any bundler. Import the `/graphql-client` subpath and no build configuration
  is needed - see [Bundling](#bundling) below.

## Mount the provider

One provider is the whole integration. It builds the client, publishes it and a
`DocumentCache` over it into `window.ph`, and registers the `window.ph` event
handlers the hooks read through.

```tsx
"use client";

import { GraphQLReactorProvider } from "@powerhousedao/reactor-browser/graphql-client";
import { TodoDemo } from "@/components/todo-demo";

const SWITCHBOARD_URL = "http://localhost:4001/graphql";

export default function DocumentsPage() {
  return (
    <GraphQLReactorProvider url={SWITCHBOARD_URL}>
      <TodoDemo />
    </GraphQLReactorProvider>
  );
}
```

The client is built in the browser only. During server rendering the slots stay
empty and the hooks report their loading states, which is why the provider and
its children are client components.

## Describe the document without a reducer

The app builds actions and documents; the Switchboard owns the model and its
reducer. Nothing generated has to ship to the browser.

```ts
import {
  baseCreateDocument,
  createAction,
  createBaseState,
  generateId,
  type Action,
  type PHBaseState,
  type PHDocument,
} from "document-model";

export const TODO_DOCUMENT_TYPE = "test/todo";
const TODO_DOCUMENT_VERSION = 2;

export type TodoItem = { id: string; title: string; completed: boolean };

type TodoPHState = PHBaseState & {
  global: { title: string; todos: TodoItem[] };
  local: Record<string, never>;
};

function createTodoState(state?: Partial<TodoPHState>): TodoPHState {
  return {
    ...createBaseState(state?.auth, {
      version: TODO_DOCUMENT_VERSION,
      ...state?.document,
    }),
    global: { title: "", todos: [], ...state?.global },
    local: {},
  };
}

export function createTodoDocument(): PHDocument<TodoPHState> {
  return baseCreateDocument<TodoPHState>(
    createTodoState,
    undefined,
    TODO_DOCUMENT_TYPE,
  );
}

export function addTodo(title: string): Action {
  return createAction(
    "ADD_TODO",
    { id: generateId(), title, completed: false },
    undefined,
    undefined,
    "global",
  );
}

/** Reads the todo list off a document whose state shape is not known statically. */
export function readTodos(document: PHDocument | undefined): TodoItem[] {
  const state = document?.state as Partial<TodoPHState> | undefined;
  return state?.global?.todos ?? [];
}
```

If the action's input does not match the model, the server says so per action
and the dispatch error callback below receives it.

## Create, read, dispatch

`useReactorClient()` returns the client for imperative calls such as `create`.
`useDocument(id)` reads through the cache and suspends while the document loads.
`useDispatch(document)` pushes actions.

```tsx
"use client";

import {
  useDispatch,
  useDocument,
  useReactorClient,
} from "@powerhousedao/reactor-browser/graphql-client";
import { Suspense, useState } from "react";
import { addTodo, createTodoDocument, readTodos } from "@/lib/todo-document";

export function TodoDemo() {
  const client = useReactorClient();
  const [documentId, setDocumentId] = useState<string>();

  async function create() {
    if (!client) return;
    const created = await client.create(createTodoDocument());
    setDocumentId(created.header.id);
  }

  return (
    <main>
      <button disabled={!client} onClick={() => void create()}>
        Create todo list
      </button>
      {documentId ? (
        <Suspense fallback={<p>Loading document…</p>}>
          <TodoList documentId={documentId} />
        </Suspense>
      ) : null}
    </main>
  );
}

function TodoList({ documentId }: { documentId: string }) {
  const document = useDocument(documentId);
  const [, dispatch] = useDispatch(document);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string>();
  const todos = readTodos(document);

  function add() {
    dispatch(addTodo(title), (errors) =>
      setError(errors.map((e) => e.message).join("; ")),
    );
    setTitle("");
  }

  return (
    <section>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <button onClick={add}>Add</button>
      {error ? <p>{error}</p> : null}
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
    </section>
  );
}
```

Read documents by id. The client's change events carry resolved document ids, so
a cache entry keyed by slug is never invalidated.

Keep the open document's id in the URL if you want a reload to prove the state
came back from the Switchboard rather than from memory.

## Realtime

The first `subscribe` call opens a websocket to the Switchboard and subscribes to
the `documentChanges` firehose. The `DocumentCache` the provider builds
subscribes in its constructor, so the socket opens as soon as the provider
mounts. A change written by another user, another tab or a server-side processor
lands on the page with no reload.

The websocket endpoint is derived from `url`: `http` becomes `ws`, `https`
becomes `wss`, and `/subscriptions` is appended. For
`http://localhost:4001/graphql` that is
`ws://localhost:4001/graphql/subscriptions`. Override it with the
`subscriptionsUrl` prop, or set `realtime={false}` where there is no websocket
to talk to.

Realtime is an enhancement, never a dependency. A socket that cannot be opened
is logged once and ignored, and the app keeps working on the changes it makes
itself. The failed socket is closed rather than kept, so the next component to
subscribe tries again - but nothing subscribes on a sign-in of its own accord.
An app on a Switchboard that refuses anonymous subscribers, and that
authenticates after mount, should remount the provider once the user is in.

## Signing

With a logged-in [Renown](/academy/Reference/Authorization/renown-sdk/Authentication) user, a
single-action dispatch is stamped with the previous operation's hash and index
and signed before it is pushed. Nothing else is required: the client resolves
the signer from `window.ph.renown` at push time, so a client built before login
signs after login.

A batch of more than one action is pushed unsigned with a warning. See
[API reference](/academy/Reference/ReactorBrowserClient/ApiReference#signing)
for why.

## Bundling

Import from `@powerhousedao/reactor-browser/graphql-client`, as every example on
this page does. It bundles in Next, Vite or anything else with no alias, stub or
other build configuration.

Do not import the light client from the package root. The root barrel re-exports
the whole package, and part of that value-imports `@powerhousedao/reactor`, whose
single entry reaches `pg` (`dns`/`fs`/`net`/`tls`), `@electric-sql/pglite` and
`node:worker_threads`. None of it runs on this path, but a browser bundler still
has to resolve it, and Turbopack fails on `node:worker_threads` before any app
code runs.

The `/graphql-client` entry avoids that by importing the reactor for types only.
Types are erased at compile time, so a bundler never sees them; the few runtime
values the client needs are mirrored inside `reactor-browser` instead, with
compile-time assertions that fail if they ever drift from the reactor's own
definitions.

The built entry imports exactly `react`, `document-model`, `graphql`,
`graphql-request`, `graphql-tag`, `graphql-ws/client`,
`@powerhousedao/shared/document-model`, `@powerhousedao/shared/document-drive`,
`change-case`, `remeda` and `slug` - no database driver, no node built-ins. A
test walks the entry's import graph and fails if that regresses.

The monorepo's `test/test-fusion/` app is a worked example: it imports the
subpath and has no bundler configuration at all.

## Next

- [API reference](/academy/Reference/ReactorBrowserClient/ApiReference) - provider
  props, client methods, and the full limitations list.
- [Subgraphs and attachments](/academy/Reference/ReactorBrowserClient/SubgraphsAndAttachments) -
  typed access to your project's own subgraphs, and the attachment service.
- [React Hooks](/academy/Reference/EditorsUI/ReactHooks) - the hooks that run on
  top of this client.
