// Right-sidebar settings panel driving the workflow document. Piece props
// render through the runtime BlockForm; unknown blocks fall back to JSON.
import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { blockMeta } from "../../workflow-editor/ui/block-meta.js";
import {
  getBlockForm,
  loadBlockOptions,
} from "../../workflow-editor/runtime-api.js";
import { PropertyForm } from "../../workflow-editor/ui/PropertyForm.js";
import type { BlockForm } from "../../workflow-editor/ui/forms.js";
import type {
  StepModel,
  WorkflowEditorCallbacks,
  WorkflowModel,
} from "../../workflow-editor/ui/model.js";
import { AP_TRIGGER_NAME } from "../mapping/derive-flow-version.js";
import { useBuilderStateContext } from "../vendor/web/app/builder/builder-hooks.js";

function useBlockForm(blockType: string): BlockForm | null | "loading" {
  const [state, setState] = useState<{
    blockType: string;
    form: BlockForm | null | "loading";
  }>({ blockType, form: "loading" });
  if (state.blockType !== blockType) setState({ blockType, form: "loading" });
  useEffect(() => {
    let alive = true;
    getBlockForm(blockType).then(
      (form) => alive && setState({ blockType, form }),
      () => alive && setState({ blockType, form: null }),
    );
    return () => {
      alive = false;
    };
  }, [blockType]);
  return state.form;
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function JsonConfigEditor(props: {
  value: unknown;
  onApply: (config: unknown) => void;
}) {
  const [text, setText] = useState(() => stringify(props.value));
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <textarea
        className="min-h-32 w-full rounded border border-solid border-border px-2 py-1.5 font-mono text-xs"
        value={text}
        spellCheck={false}
        onChange={(event) => setText(event.target.value)}
      />
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      <button
        type="button"
        className="mt-1 rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
        onClick={() => {
          try {
            props.onApply(JSON.parse(text) as unknown);
            setError(null);
          } catch (parseError) {
            setError(
              parseError instanceof Error ? parseError.message : "Invalid JSON",
            );
          }
        }}
      >
        Apply JSON
      </button>
    </div>
  );
}

function ConfigSection(props: {
  blockType: string;
  config: unknown;
  onChange: (config: unknown) => void;
  connectionId?: string;
}) {
  const form = useBlockForm(props.blockType);
  const config = (props.config ?? {}) as Record<string, unknown>;
  if (form === "loading") {
    return <p className="text-xs text-muted-foreground">Loading properties…</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {form && form.requireAuth ? (
        <p className="rounded bg-muted px-2 py-1.5 text-xs text-muted-foreground">
          Connection is managed in the Classic editor.
        </p>
      ) : null}
      {form && form.props.length > 0 ? (
        <PropertyForm
          props={form.props}
          value={config}
          onChange={props.onChange}
          loadOptions={(propName, current) =>
            loadBlockOptions(
              props.blockType,
              propName,
              current,
              props.connectionId,
            )
          }
        />
      ) : null}
      {form && form.props.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          This block has no configuration.
        </p>
      ) : null}
      {!form ? (
        <JsonConfigEditor value={props.config} onApply={props.onChange} />
      ) : null}
    </div>
  );
}

function PanelHeader(props: {
  blockType: string;
  title: string;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const meta = blockMeta(props.blockType);
  return (
    <div className="flex items-center gap-2 border-b border-solid border-border px-4 py-3">
      {meta.logoUrl ? (
        <img src={meta.logoUrl} alt="" className="size-7 object-contain" />
      ) : (
        <span className="flex size-7 items-center justify-center rounded bg-muted text-sm">
          {meta.glyph ?? "?"}
        </span>
      )}
      {props.onRename ? (
        <input
          className="min-w-0 flex-1 rounded border border-solid border-transparent px-1 py-0.5 text-sm font-semibold hover:border-border"
          defaultValue={props.title}
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (next && next !== props.title) props.onRename?.(next);
          }}
        />
      ) : (
        <span className="flex-1 truncate text-sm font-semibold">
          {props.title}
        </span>
      )}
      {props.onDelete ? (
        <button
          type="button"
          title="Delete step"
          className="rounded p-1 text-destructive hover:bg-muted"
          onClick={props.onDelete}
        >
          <Trash2 size={16} />
        </button>
      ) : null}
      <button
        type="button"
        title="Close"
        className="rounded p-1 text-muted-foreground hover:bg-muted"
        onClick={props.onClose}
      >
        <X size={16} />
      </button>
    </div>
  );
}

// Branch subtrees are deleted with the branch, mirroring the AP router delete.
function collectCascade(model: WorkflowModel, root: StepModel): string[] {
  if (root.blockType !== "core#branch") return [root.id];
  const ids = new Set<string>([root.id]);
  const queue = model.edges
    .filter((edge) => edge.from === root.id && edge.port !== "error")
    .map((edge) => edge.to);
  while (queue.length > 0) {
    const id = queue.pop();
    if (id === undefined || ids.has(id)) continue;
    ids.add(id);
    for (const edge of model.edges) {
      if (edge.from === id) queue.push(edge.to);
    }
  }
  return [...ids];
}

export function StepSettingsPanel(props: {
  stepName: string;
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
  replaceTrigger: (input: { blockType: string; config: unknown }) => void;
}) {
  const { model, callbacks } = props;
  const exitStepSettings = useBuilderStateContext(
    (state) => state.exitStepSettings,
  );

  if (props.stepName === AP_TRIGGER_NAME) {
    const trigger = model.trigger;
    if (!trigger) return null;
    const meta = blockMeta(trigger.blockType);
    return (
      <div className="flex flex-col">
        <PanelHeader
          blockType={trigger.blockType}
          title={meta.displayName}
          onDelete={() => {
            callbacks.clearTrigger();
            exitStepSettings();
          }}
          onClose={exitStepSettings}
        />
        <div className="flex flex-col gap-3 p-4">
          <ConfigSection
            blockType={trigger.blockType}
            config={trigger.config}
            onChange={(config) =>
              props.replaceTrigger({ blockType: trigger.blockType, config })
            }
          />
        </div>
      </div>
    );
  }

  const step = model.steps.find((entry) => entry.key === props.stepName);
  if (!step) return null;

  const deleteStep = () => {
    const ids = collectCascade(model, step);
    const deleted = new Set(ids);
    const incoming = model.edges.find(
      (edge) => edge.to === step.id && !deleted.has(edge.from),
    );
    const outgoing = model.edges.find(
      (edge) =>
        edge.from === step.id && edge.port === "next" && !deleted.has(edge.to),
    );
    for (const id of ids) callbacks.removeStep(id);
    if (incoming && outgoing) {
      callbacks.addEdge({
        from: incoming.from,
        to: outgoing.to,
        port: incoming.port,
        condition: incoming.condition ?? undefined,
      });
    }
    exitStepSettings();
  };

  return (
    <div className="flex flex-col">
      <PanelHeader
        blockType={step.blockType}
        title={step.name}
        onRename={(name) => callbacks.updateStep({ id: step.id, name })}
        onDelete={deleteStep}
        onClose={exitStepSettings}
      />
      <div className="flex flex-col gap-3 p-4">
        {step.connectionId ? (
          <p className="rounded bg-muted px-2 py-1.5 text-xs text-muted-foreground">
            Connection: <span className="font-mono">{step.connectionId}</span>
          </p>
        ) : null}
        <ConfigSection
          blockType={step.blockType}
          config={step.config}
          onChange={(config) => callbacks.updateStep({ id: step.id, config })}
          connectionId={step.connectionId ?? undefined}
        />
      </div>
    </div>
  );
}
