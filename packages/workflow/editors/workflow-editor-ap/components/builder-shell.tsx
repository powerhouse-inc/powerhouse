// Hosts the vendored Activepieces builder: store creation, flowsApi bridge,
// document->FlowVersion sync, canvas + right sidebar layout.
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import type {
  WorkflowEditorCallbacks,
  WorkflowModel,
} from "../../workflow-editor/ui/model.js";
import {
  deriveFlowVersion,
  AP_FLOW_ID,
} from "../mapping/derive-flow-version.js";
import { flowVersionsEquivalent } from "../mapping/flow-compare.js";
import {
  translateOperation,
  type ApDocumentBridge,
} from "../mapping/translate-operation.js";
import { setFlowsApiBridge } from "../shims/flows.js";
import { queryClient } from "../shims/query-client.js";
import { createInertSocket } from "../shims/socket.js";
import {
  BuilderStateContext,
  createBuilderStore,
  useBuilderStateContext,
  type BuilderStore,
} from "../vendor/web/app/builder/builder-hooks.js";
import { CanvasControls } from "../vendor/web/app/builder/flow-canvas/canvas-controls/index.js";
import { FlowCanvas } from "../vendor/web/app/builder/flow-canvas/index.js";
import { CursorPositionProvider } from "../vendor/web/app/builder/state/cursor-position-context.js";
import { RightSideBarType } from "../vendor/web/app/builder/types/index.js";
import {
  FlowOperationStatus,
  FlowStatus,
  type FlowVersion,
  type PopulatedFlow,
} from "../vendor/shared/index.js";
import { StepSettingsPanel } from "./step-settings-panel.js";

function buildPopulatedFlow(
  model: WorkflowModel,
  version: FlowVersion,
): PopulatedFlow {
  return {
    id: AP_FLOW_ID,
    created: "",
    updated: "",
    projectId: "ph-project",
    externalId: AP_FLOW_ID,
    ownerId: null,
    folderId: null,
    status:
      model.status === "ENABLED" ? FlowStatus.ENABLED : FlowStatus.DISABLED,
    publishedVersionId: null,
    metadata: null,
    operationStatus: FlowOperationStatus.NONE,
    timeSavedPerRun: null,
    templateId: null,
    createdBy: null,
    version,
  };
}

export interface BuilderShellProps {
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
  setName: (name: string) => void;
  replaceTrigger: (input: { blockType: string; config: unknown }) => void;
  initialVersion: FlowVersion;
}

export function BuilderShell(props: BuilderShellProps) {
  const { model, callbacks, initialVersion } = props;

  const bridgeRef = useRef<ApDocumentBridge>({
    model,
    callbacks,
    setName: props.setName,
    replaceTrigger: props.replaceTrigger,
  });
  useEffect(() => {
    bridgeRef.current = {
      model,
      callbacks,
      setName: props.setName,
      replaceTrigger: props.replaceTrigger,
    };
  });

  const [store] = useState<BuilderStore>(() =>
    createBuilderStore({
      flow: buildPopulatedFlow(model, initialVersion),
      flowVersion: initialVersion,
      readonly: false,
      hideTestWidget: true,
      run: null,
      outputSampleData: {},
      inputSampleData: {},
      socket: createInertSocket(),
      queryClient,
    }),
  );

  // The write seam: their flowsApi.update lands here and becomes dispatches.
  useEffect(() => {
    setFlowsApiBridge({
      update: (operation) => {
        translateOperation(bridgeRef.current, operation);
        // Echo their optimistic version; the document sync below corrects it.
        const version = store.getState().flowVersion;
        return Promise.resolve(
          buildPopulatedFlow(bridgeRef.current.model, version),
        );
      },
      get: () =>
        Promise.resolve(
          buildPopulatedFlow(
            bridgeRef.current.model,
            store.getState().flowVersion,
          ),
        ),
    });
    return () => setFlowsApiBridge(null);
  }, [store]);

  // Document is the source of truth: reset the store when they diverge.
  useEffect(() => {
    const derived = deriveFlowVersion(model);
    const current = store.getState().flowVersion;
    if (!flowVersionsEquivalent(derived.version, current)) {
      store.getState().setVersion(derived.version, false);
    }
  }, [model, store]);

  return (
    <QueryClientProvider client={queryClient}>
      <BuilderStateContext.Provider value={store}>
        <ReactFlowProvider>
          <CursorPositionProvider>
            <BuilderBody
              model={model}
              callbacks={callbacks}
              replaceTrigger={props.replaceTrigger}
            />
          </CursorPositionProvider>
        </ReactFlowProvider>
      </BuilderStateContext.Provider>
    </QueryClientProvider>
  );
}

function BuilderBody(props: {
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
  replaceTrigger: (input: { blockType: string; config: unknown }) => void;
}) {
  const [hasCanvasBeenInitialised, setHasCanvasBeenInitialised] =
    useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selectedStep, rightSidebar] = useBuilderStateContext((state) => [
    state.selectedStep,
    state.rightSidebar,
  ]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const showSettings =
    rightSidebar === RightSideBarType.PIECE_SETTINGS && selectedStep !== null;

  return (
    <div className="flex min-h-0 flex-1">
      <div ref={containerRef} className="relative min-h-[480px] min-w-0 flex-1">
        <FlowCanvas setHasCanvasBeenInitialised={setHasCanvasBeenInitialised} />
        <CanvasControls
          canvasWidth={size.width}
          canvasHeight={size.height}
          hasCanvasBeenInitialised={hasCanvasBeenInitialised}
          selectedStep={selectedStep}
        />
      </div>
      {showSettings ? (
        <aside className="min-h-0 w-96 overflow-y-auto border-l border-solid border-border bg-background">
          <StepSettingsPanel
            key={selectedStep}
            stepName={selectedStep}
            model={props.model}
            callbacks={props.callbacks}
            replaceTrigger={props.replaceTrigger}
          />
        </aside>
      ) : null}
    </div>
  );
}
