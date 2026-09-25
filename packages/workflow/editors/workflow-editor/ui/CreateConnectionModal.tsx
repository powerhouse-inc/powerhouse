// The connection editor's own form over a just-created document, hosted in the
// host modal so binding a step never leaves the workflow editor.
import { Modal } from "@powerhousedao/design-system";
import { actions, useConnectionDocumentById } from "document-models/connection";
import { useEffect, useState } from "react";
import { connectionCallbacks } from "../../connection-editor/connection-callbacks.js";
import { ConnectionForm } from "../../connection-editor/connection-form.js";
import { planFromAuth } from "../../connection-editor/piece-auth.js";
import { fetchPieceCatalog } from "../runtime-api.js";
import {
  connectionNameFor,
  type ConnectionDraft,
} from "./connection-create.js";

export function CreateConnectionModal(props: {
  connectionId: string;
  draft: ConnectionDraft;
  onDone: (connectionId: string) => void;
}) {
  const [document, dispatch] = useConnectionDocumentById(props.connectionId);
  const [prefilled, setPrefilled] = useState(false);
  const state = document?.state.global;

  // The picker knows the piece; the connector is prefilled once, exactly as
  // picking it by hand would, so only the credentials are left to fill in.
  useEffect(() => {
    if (!dispatch || prefilled || state === undefined) return;
    if (state.connectorId) return;
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect -- one-shot latch so the prefill dispatches exactly once
    setPrefilled(true);
    dispatch(actions.setConnectionName({ name: props.draft.name }));
    dispatch(actions.setName(props.draft.name));
    const setConnector = (auth: unknown) =>
      dispatch(
        actions.setConnector({
          connectorId: props.draft.connectorId,
          authType: planFromAuth(auth).authType,
        }),
      );
    fetchPieceCatalog().then(
      (pieces) => {
        const piece = pieces.find(
          (entry) => entry.name === props.draft.piecePackage,
        );
        setConnector(piece?.auth);
        // The draft may have been named before the catalog knew the piece.
        const name = connectionNameFor(
          props.draft.piecePackage,
          piece?.displayName,
        );
        if (name !== props.draft.name) {
          dispatch(actions.setConnectionName({ name }));
          dispatch(actions.setName(name));
        }
      },
      // Unreachable catalog: the connector still points at the piece and the
      // form recovers the auth kind once the catalog loads.
      () => setConnector(null),
    );
  }, [dispatch, prefilled, props.draft, state]);

  const callbacks =
    state && dispatch ? connectionCallbacks(state, dispatch) : null;

  return (
    <Modal
      open
      title="New connection"
      onOpenChange={(open) => {
        if (!open) props.onDone(props.connectionId);
      }}
      contentProps={{
        className: "max-h-[85vh] w-[36rem] max-w-[92vw] overflow-y-auto",
      }}
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-2">
          <input
            key={state?.name}
            className="min-w-0 flex-1 rounded border border-transparent px-1 py-0.5 text-sm font-semibold text-foreground hover:border-foreground/10 focus:border-foreground/15 focus:outline-none"
            defaultValue={state?.name ?? props.draft.name}
            placeholder="Untitled connection"
            spellCheck={false}
            aria-label="Connection name"
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            onBlur={(event) => {
              const name = event.target.value.trim();
              if (name && name !== state?.name) callbacks?.setName(name);
            }}
          />
          <button
            type="button"
            className="shrink-0 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            onClick={() => props.onDone(props.connectionId)}
          >
            Use this connection
          </button>
        </div>
        {state && callbacks ? (
          <ConnectionForm state={state} callbacks={callbacks} />
        ) : (
          <p className="text-xs text-muted-foreground/80">
            Loading the new connection document…
          </p>
        )}
      </div>
    </Modal>
  );
}
