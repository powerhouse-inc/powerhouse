import { Handle, Position, type NodeProps } from "@xyflow/react";
import { stepPorts, type StepModel, type TriggerModel } from "./model.js";

const PORT_COLORS: Record<string, string> = {
  next: "#64748b",
  true: "#16a34a",
  false: "#dc2626",
  error: "#f59e0b",
};

function sourceHandles(ports: string[]) {
  return ports.map((port, index) => (
    <Handle
      key={port}
      id={port}
      type="source"
      position={Position.Bottom}
      style={{
        left: `${((index + 1) / (ports.length + 1)) * 100}%`,
        background: PORT_COLORS[port] ?? "#64748b",
        width: 10,
        height: 10,
      }}
      title={port}
    />
  ));
}

export function TriggerNode(props: NodeProps) {
  const trigger = props.data.trigger as TriggerModel;
  return (
    <div
      className={`min-w-44 rounded-lg border-2 bg-violet-50 px-3 py-2 text-left shadow-sm ${
        props.selected ? "border-violet-500" : "border-violet-200"
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">
        Trigger
      </div>
      <div className="truncate text-sm font-medium text-slate-800">
        {trigger.blockType}
      </div>
      <Handle
        id="next"
        type="source"
        position={Position.Bottom}
        style={{ background: "#8b5cf6", width: 10, height: 10 }}
      />
    </div>
  );
}

export function StepNode(props: NodeProps) {
  const step = props.data.step as StepModel;
  const ports = stepPorts(step.blockType);
  return (
    <div
      className={`min-w-44 rounded-lg border-2 bg-white px-3 py-2 text-left shadow-sm ${
        props.selected ? "border-blue-500" : "border-slate-200"
      }`}
    >
      <Handle
        id="in"
        type="target"
        position={Position.Top}
        style={{ background: "#94a3b8", width: 10, height: 10 }}
      />
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {step.key}
      </div>
      <div className="truncate text-sm font-medium text-slate-800">
        {step.name || step.key}
      </div>
      <div className="truncate text-[11px] text-slate-500">
        {step.blockType}
      </div>
      {sourceHandles(ports)}
    </div>
  );
}

export const nodeTypes = { trigger: TriggerNode, step: StepNode };
