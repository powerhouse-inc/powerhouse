"use client";

import { GraphQLReactorProvider } from "@powerhousedao/reactor-browser/graphql-client";
import { Suspense } from "react";
import { ExtensibilityProbe } from "@/components/extensibility-probe";
import { TodoDemo } from "@/components/todo-demo";
import { SWITCHBOARD_URL } from "@/lib/renown";

// One provider is the whole integration: it publishes a GraphQLReactorClient
// and a DocumentCache into the `window.ph` slots the reactor-browser hooks
// read. Everything below it uses the hooks Connect uses.
export default function DocumentsPage() {
  return (
    <GraphQLReactorProvider url={SWITCHBOARD_URL}>
      <Suspense fallback={null}>
        <TodoDemo />
        <ExtensibilityProbe />
      </Suspense>
    </GraphQLReactorProvider>
  );
}
