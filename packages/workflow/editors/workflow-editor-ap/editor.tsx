import "@xyflow/react/dist/style.css";
import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { generateId } from "document-model";
import { actions, useSelectedWorkflowDocument } from "document-models/workflow";
import { useEffect, useMemo } from "react";
import { useWorkflowModel } from "../workflow-editor/document/useWorkflowModel.js";
import { EditorSwitch } from "../workflow-editor/EditorSwitch.js";
import {
  useSyncWorkflowRuntimeUrl,
  useWorkflowRuntimeUrl,
} from "../workflow-editor/use-runtime-url.js";
import { BuilderShell } from "./components/builder-shell.js";
import { deriveFlowVersion } from "./mapping/derive-flow-version.js";
import { setApRuntimeUrl } from "./shims/ap-runtime.js";

function UnsupportedPanel(props: { reasons: string[] }) {
  return (
    <div className="mx-auto mt-16 max-w-lg rounded border border-solid border-amber-300 bg-amber-50 p-6">
      <h3 className="mb-2 text-sm font-semibold text-amber-900">
        This workflow uses features the Activepieces editor can&apos;t display
      </h3>
      <p className="mb-3 text-xs text-amber-800">
        Open the classic editor to keep working on it — nothing was changed.
      </p>
      <ul className="mb-4 list-disc pl-4 text-xs text-amber-800">
        {[...new Set(props.reasons)].map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <EditorSwitch active="workflow-editor-ap" />
    </div>
  );
}

export default function Editor() {
  useSyncWorkflowRuntimeUrl();
  const runtimeUrl = useWorkflowRuntimeUrl();
  useEffect(() => setApRuntimeUrl(runtimeUrl), [runtimeUrl]);

  const { model, callbacks } = useWorkflowModel();
  const [, dispatch] = useSelectedWorkflowDocument();

  const derived = useMemo(() => deriveFlowVersion(model), [model]);

  const setName = (name: string) => dispatch(actions.setName(name));

  // Trigger swap that keeps the outgoing chain attached to the new trigger.
  const replaceTrigger = (input: { blockType: string; config: unknown }) => {
    const outgoing = model.trigger
      ? model.edges.filter((edge) => edge.from === model.trigger?.id)
      : [];
    const triggerId = generateId();
    dispatch(
      actions.setTrigger({
        id: triggerId,
        blockType: input.blockType,
        config: input.config,
      }),
    );
    for (const edge of outgoing) {
      dispatch(actions.removeEdge({ id: edge.id }));
      dispatch(
        actions.addEdge({
          id: generateId(),
          from: triggerId,
          to: edge.to,
          port: edge.port,
          condition: edge.condition ?? undefined,
        }),
      );
    }
  };

  return (
    <div className="ap-builder flex h-full min-h-0 flex-col bg-background">
      <DocumentToolbar />
      <div className="flex items-center gap-3 border-b border-solid border-slate-200 px-4 py-2">
        <input
          className="rounded border border-solid border-transparent px-1 py-0.5 text-sm font-semibold text-slate-800 hover:border-slate-200"
          defaultValue={model.name || "Untitled workflow"}
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (next && next !== model.name) setName(next);
          }}
        />
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
          v{model.version}
        </span>
        <span className="ml-auto" />
        <EditorSwitch active="workflow-editor-ap" />
      </div>
      {derived.unsupported.length > 0 ? (
        <UnsupportedPanel reasons={derived.unsupported} />
      ) : (
        <BuilderShell
          model={model}
          callbacks={callbacks}
          setName={setName}
          replaceTrigger={replaceTrigger}
          initialVersion={derived.version}
        />
      )}
    </div>
  );
}
