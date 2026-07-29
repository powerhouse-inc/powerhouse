"use client";

import { useSwitchboardClient } from "@powerhousedao/reactor-browser/graphql-client";
import { useState } from "react";
import { getRenownReadModelSdk } from "@/lib/renown-read-model-sdk";

// The single-surface principle, exercised: the very client that serves
// `useDocument` and `useDispatch` also reaches a project's own subgraph and runs
// a one-off document, over the same URL, transport and auth.

const RENOWN_READ_MODEL = "renown-read-model";

// Nobody has this address, so the read model answers with an empty list -
// deterministic on a freshly booted Switchboard.
const UNKNOWN_ADDRESS = "0x0000000000000000000000000000000000000000";

const DOCUMENT_MODEL_IDS = `
  query DocumentModelIds {
    documentModels {
      items {
        id
      }
    }
  }
`;

type DocumentModelIds = {
  documentModels: { items: { id: string }[] };
};

export function ExtensibilityProbe() {
  const client = useSwitchboardClient();
  const [sdl, setSdl] = useState<string>();
  const [users, setUsers] = useState<string>();
  const [models, setModels] = useState<string>();
  const [error, setError] = useState<string>();

  async function probe() {
    if (!client) return;
    setError(undefined);
    const sdk = client.subgraph(RENOWN_READ_MODEL, getRenownReadModelSdk);
    try {
      const [service, renownUsers, documentModels] = await Promise.all([
        sdk.Service(),
        sdk.RenownUsers([UNKNOWN_ADDRESS]),
        client.request<DocumentModelIds>(DOCUMENT_MODEL_IDS),
      ]);
      // The root supergraph has no `_service` field, so an SDL that names the
      // read model's own types is proof the request went to the subgraph's own
      // endpoint rather than to the base URL.
      setSdl(
        service._service.sdl.includes("ReadRenownUser")
          ? "renown-read-model"
          : "unexpected schema",
      );
      setUsers(String(renownUsers.renownUsers.length));
      setModels(documentModels.documentModels.items.map(({ id }) => id).join());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <section
      className="mx-auto flex w-96 flex-col gap-2 pb-16 text-left text-sm"
      data-testid="extensibility-probe"
    >
      <button
        type="button"
        data-testid="probe-extensibility"
        disabled={!client}
        onClick={() => void probe()}
        className="h-9 rounded-lg border border-black/15 px-4 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10"
      >
        Probe subgraph
      </button>
      <p className="font-mono text-xs" data-testid="subgraph-schema">
        {sdl ?? ""}
      </p>
      <p className="font-mono text-xs" data-testid="subgraph-users">
        {users ?? ""}
      </p>
      <p className="font-mono text-xs" data-testid="request-models">
        {models ?? ""}
      </p>
      {error ? (
        <p className="text-red-600" data-testid="probe-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
