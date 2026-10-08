// A REACTOR connection's settings: how much it allows, and the Switchboard's
// grants. It holds no secrets (ADR 0005 §5, §8).
import {
  parseReactorConnectionConfig,
  type ConnectionState,
} from "document-models/connection";
import { useState } from "react";
import { FieldError, FieldLabel, Hint, Segmented } from "../shared/controls.js";
import { withReactorConfig } from "../workflow-editor/ui/reactor-access.js";
import { SwitchboardGrants } from "../workflow-editor/ui/SwitchboardGrants.js";
import type { ConnectionCallbacks } from "./connection-form.js";

export function ReactorConnectionSettings(props: {
  state: ConnectionState;
  callbacks: ConnectionCallbacks;
}) {
  const parsed = parseReactorConnectionConfig(props.state.config);
  const current = parsed.ok ? parsed.config : { endpoint: "local" as const };
  const [error, setError] = useState<string | null>(
    parsed.ok ? null : parsed.error,
  );
  const save = (patch: Parameters<typeof withReactorConfig>[1]) => {
    const next = withReactorConfig(current, patch);
    const check = parseReactorConnectionConfig(next);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    props.callbacks.setReactorConfig(check.config);
  };
  return (
    <div className="flex flex-col gap-5 border-t border-solid border-foreground/10 pt-5">
      <div>
        <h3 className="text-[13px] font-semibold text-foreground">
          Reactor access
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Each workflow&apos;s runs act as its last publisher, and reach only
          what this connection allows and that person may do.
        </p>
      </div>
      <div>
        <FieldLabel label="Access" />
        <Segmented
          value={current.access === "read" ? "read" : "write"}
          options={[
            { value: "write", label: "Read and write" },
            { value: "read", label: "Read only" },
          ]}
          onChange={(value) =>
            save({ access: value === "read" ? "read" : "write" })
          }
        />
        <Hint text="Read only refuses every write, whatever the step declares." />
      </div>
      <FieldError>{error}</FieldError>
      <SwitchboardGrants />
    </div>
  );
}
