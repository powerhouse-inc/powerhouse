// Asks for the manual trigger's inputs before a run, or a raw JSON payload.
import { Modal } from "@powerhousedao/design-system/connect";
import { useId, useMemo, useRef, useState } from "react";
import { Switch, textAreaClass } from "../../shared/controls.js";
import { PropertyForm } from "../../workflow-editor/ui/PropertyForm.js";
import {
  manualInputProp,
  manualInputValues,
  manualRunPayload,
  type ManualInput,
} from "../../workflow-editor/ui/manual-inputs.js";
import { Button, Icon } from "./ui.js";

export function RunDialog(props: {
  inputs: ManualInput[];
  onCancel: () => void;
  // Resolves to the fire's error, or null once the run started.
  onFire: (payload: unknown) => Promise<string | null>;
}) {
  const fields = useMemo(
    () => props.inputs.map(manualInputProp),
    [props.inputs],
  );
  const [values, setValues] = useState(() => manualInputValues(props.inputs));
  // Read on submit after blurring the focused field, which commits its text.
  const latest = useRef(values);
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [firing, setFiring] = useState(false);
  const rawId = useId();

  const payload = (): unknown => {
    if (raw === null) return manualRunPayload(props.inputs, latest.current);
    try {
      return JSON.parse(raw === "" ? "{}" : raw) as unknown;
    } catch {
      throw new Error("The payload is not valid JSON.");
    }
  };

  return (
    <Modal
      open
      title="Run workflow"
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
      contentProps={{
        className:
          "max-h-[85vh] w-[32rem] max-w-[92vw] overflow-y-auto rounded-xl border border-solid border-foreground/10",
        "aria-label": "Run workflow",
      }}
    >
      <form
        className="flex flex-col gap-4 p-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (firing) return;
          (document.activeElement as HTMLElement | null)?.blur();
          let body: unknown;
          try {
            body = payload();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
            return;
          }
          setFiring(true);
          setError(null);
          props
            .onFire(body)
            .then(
              (fireError) => fireError,
              (cause: unknown) =>
                cause instanceof Error ? cause.message : String(cause),
            )
            .then((fireError) => {
              setFiring(false);
              if (fireError) setError(fireError);
              else props.onCancel();
            });
        }}
      >
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">
            Run workflow
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            The run reads these as {"{{trigger.payload.<key>}}"}.
          </p>
        </div>
        <Switch
          label="Raw JSON"
          checked={raw !== null}
          onChange={(on) => {
            setError(null);
            if (!on) return setRaw(null);
            setRaw(JSON.stringify(latest.current, null, 2));
          }}
        />
        {raw === null ? (
          <PropertyForm
            props={fields}
            value={values}
            onChange={(next) => {
              latest.current = next;
              setValues(next);
            }}
          />
        ) : (
          <div>
            <label
              htmlFor={rawId}
              className="mb-1.5 block text-[13px] font-medium text-foreground"
            >
              Payload
            </label>
            <textarea
              id={rawId}
              className={`${textAreaClass} min-h-40 font-mono text-xs`}
              value={raw}
              spellCheck={false}
              onChange={(event) => setRaw(event.target.value)}
            />
          </div>
        )}
        {error ? (
          <p
            role="alert"
            className="rounded-md bg-wf-fail/10 px-3 py-2 text-[13px] text-wf-fail"
          >
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={firing}>
            <Icon name="play" className="h-3.5 w-3.5" />
            {firing ? "Running…" : "Run"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
