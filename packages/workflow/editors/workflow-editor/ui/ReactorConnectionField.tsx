// The reactor connection a step or trigger binds when its block declares
// requireReactor: a pick among REACTOR connections, or a new one (ADR 0005 §5).
import {
  addDocument,
  dispatchActions,
  useSelectedDriveId,
} from "@powerhousedao/reactor-browser";
import { useEffect, useRef, useState } from "react";
import { FieldLabel, Hint, Select } from "../../shared/controls.js";
import { usePublisher, useSignInGate } from "../reactor-hooks.js";
import { runsAsText } from "./reactor-view.js";
import type { BlockRef } from "./blocks.js";
import { CONNECTION_TYPE } from "./connection-create.js";
import { useBlockForm, useConnectionList } from "./design-time.js";
import { reactorConnections } from "./reactor-access.js";
import { newReactorConnectionActions } from "./reactor-connection-create.js";
import { SignInPrompt } from "./SignInPrompt.js";

const LINK_ATTEMPTS = 30;
const LINK_INTERVAL_MS = 500;

const DECLARED: Record<"read" | "write", string> = {
  read: "Reads documents only",
  write: "Reads and writes documents",
};

export function ReactorConnectionField(props: {
  block: BlockRef;
  value: string;
  onChange: (connectionId: string | null) => void;
  workflowId?: string;
  // The live snapshot's version, which says who runs act as.
  publishedVersion?: number | null;
}) {
  const { form } = useBlockForm(props.block);
  const { connections, refetch, invalidate } = useConnectionList();
  const driveId = useSelectedDriveId();
  const gate = useSignInGate();
  const { publisher, loading } = usePublisher(
    props.workflowId,
    props.publishedVersion,
  );
  const runsAs = runsAsText(
    publisher,
    loading,
    gate.access?.reactorIdentity?.address,
  );
  const [creating, setCreating] = useState(false);
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  });
  const [error, setError] = useState<string | null>(null);
  // A new or just-bound connection reaches the listing a moment later.
  const linking = props.value || null;
  const listed = connections.some((connection) => connection.id === linking);
  useEffect(() => {
    if (!linking || listed) return;
    let attempts = 0;
    const timer = setInterval(() => {
      if (++attempts > LINK_ATTEMPTS) clearInterval(timer);
      else refetchRef.current();
    }, LINK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [linking, listed]);

  const declared = form && form !== "loading" ? form.requireReactor : undefined;
  // A stale binding stays visible so it can be cleared.
  if (!declared && !props.value) return null;

  const options = reactorConnections(connections).map((connection) => ({
    value: connection.id,
    label: connection.name || connection.id,
    description: connection.status === "REVOKED" ? "Revoked" : undefined,
  }));

  const create = () => {
    if (!driveId || creating) return;
    setCreating(true);
    setError(null);
    const name = "Reactor access";
    addDocument(driveId, name, CONNECTION_TYPE)
      .then(async (node) => {
        let failure: string | undefined;
        await dispatchActions(
          newReactorConnectionActions(name, declared ?? "write"),
          node.id,
          (errors) => {
            failure = errors[0]?.message;
          },
        );
        if (failure) throw new Error(failure);
        invalidate();
        setCreating(false);
        props.onChange(node.id);
      })
      .catch((cause: unknown) => {
        setCreating(false);
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  };

  const known = options.some((option) => option.value === props.value);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <FieldLabel
          label="Reactor connection"
          needsValue={Boolean(declared) && !props.value}
          action={
            props.value ? (
              <button
                type="button"
                className="rounded px-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => props.onChange(null)}
              >
                Clear
              </button>
            ) : undefined
          }
        />
        <div onPointerDown={refetch}>
          <Select
            ariaLabel="Reactor connection"
            value={props.value}
            options={options}
            invalid={Boolean(declared) && !props.value}
            placeholder={
              creating ? "Creating connection…" : "Choose a reactor connection"
            }
            emptyText="No reactor connection in this drive yet."
            disabled={creating}
            onChange={(id) => props.onChange(id || null)}
            actions={
              driveId && declared
                ? [
                    {
                      label: "New reactor connection",
                      icon: "plus",
                      onSelect: create,
                    },
                  ]
                : undefined
            }
          />
        </div>
        {declared ? (
          <Hint>
            {DECLARED[declared]}, within what the connection allows.
            {runsAs ? (
              <span className="block" aria-label="Runs as">
                {runsAs}
              </span>
            ) : null}
          </Hint>
        ) : (
          <Hint>This block takes no reactor connection.</Hint>
        )}
        {props.value && connections.length > 0 && !known ? (
          <p className="mt-1.5 text-xs text-wf-warn">
            Not a reactor connection in this drive.
          </p>
        ) : null}
        {error ? (
          <p className="mt-1.5 text-xs font-medium text-wf-fail">{error}</p>
        ) : null}
      </div>
      {!props.value ? (
        <SignInPrompt
          gate={gate}
          reason="Sign in so the workflow runs as you when it reaches documents."
        />
      ) : null}
    </div>
  );
}
