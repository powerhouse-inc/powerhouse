"use client";

import { GraphQLReactorProvider } from "@powerhousedao/reactor-browser/graphql-client";
import { Suspense } from "react";
import { ExtensibilityProbe } from "@/components/extensibility-probe";
import { TodoDemo } from "@/components/todo-demo";
import { SWITCHBOARD_URL } from "@/lib/renown";
import { todoPackage } from "@/lib/todo-document";

// One provider is the whole integration: it publishes a GraphQLReactorClient
// and a DocumentCache into the `window.ph` slots the reactor-browser hooks
// read, and `packages` additionally publishes the app's own generated package
// (real manifest, models and editors) so the document-model and editor hooks
// work. Everything below it uses the hooks Connect uses.
export default function DocumentsPage() {
  return (
    <GraphQLReactorProvider url={SWITCHBOARD_URL} packages={[todoPackage]}>
      <Suspense fallback={null}>
        <TodoDemo />
        <ExtensibilityProbe />
      </Suspense>
    </GraphQLReactorProvider>
  );
}
