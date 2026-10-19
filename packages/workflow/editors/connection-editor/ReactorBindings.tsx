// The steps and triggers that bind a reactor connection, and what each declares.
import { parseReactorConnectionConfig } from "document-models/connection";
import { BlockLogo } from "../workflow-editor/ui/BlockSelector.js";
import {
  stepBlock,
  triggerBlock,
  type BlockRef,
} from "../workflow-editor/ui/blocks.js";
import { useBlockForms } from "../workflow-editor/ui/design-time.js";
import { blockRefKey } from "../workflow-editor/ui/query-keys.js";
import { accessMismatch } from "../workflow-editor/ui/reactor-access.js";
import type { ConnectionUsage } from "./connection-usage.js";

interface Binding {
  workflowId: string;
  workflowName: string;
  stepId: string;
  label: string;
  block: BlockRef;
}

function bindingsOf(usage: readonly ConnectionUsage[]): Binding[] {
  return usage.flatMap((entry) => {
    const { workflow } = entry;
    const trigger = workflow.trigger;
    const triggerBinding: Binding[] =
      entry.reactorTrigger &&
      trigger?.id &&
      trigger.pieceName &&
      trigger.pieceVersion &&
      trigger.triggerName
        ? [
            {
              workflowId: workflow.id,
              workflowName: workflow.name,
              stepId: trigger.id,
              label: "Trigger",
              block: triggerBlock({
                pieceName: trigger.pieceName,
                pieceVersion: trigger.pieceVersion,
                triggerName: trigger.triggerName,
              }),
            },
          ]
        : [];
    return [
      ...triggerBinding,
      ...entry.reactorSteps.map((step) => ({
        workflowId: workflow.id,
        workflowName: workflow.name,
        stepId: step.id,
        label: step.name || step.key,
        block: stepBlock(step),
      })),
    ];
  });
}

const DECLARED_LABEL = {
  read: "Reads",
  write: "Reads and writes",
} as const;

function BindingRow(props: {
  binding: Binding;
  declared: "read" | "write" | null | undefined;
  access: "read" | undefined;
}) {
  const { binding } = props;
  const mismatch = accessMismatch(props.declared, props.access);
  return (
    <li className="flex flex-col gap-2 py-2.5">
      <div className="flex items-center gap-2.5 text-[13px]">
        <BlockLogo block={binding.block} size={16} bare />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-foreground">
            {binding.workflowName}
          </span>
          <span className="text-muted-foreground"> · {binding.label}</span>
        </span>
        <span
          className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
          aria-label={`${binding.label} declares`}
        >
          {props.declared === undefined
            ? "…"
            : props.declared
              ? DECLARED_LABEL[props.declared]
              : "Declares no access"}
        </span>
      </div>
      {mismatch ? <p className="text-xs text-wf-warn">{mismatch}</p> : null}
    </li>
  );
}

export function ReactorBindings(props: {
  config: unknown;
  usage: readonly ConnectionUsage[];
}) {
  const bindings = bindingsOf(props.usage);
  const forms = useBlockForms(bindings.map((binding) => binding.block));
  const parsed = parseReactorConnectionConfig(props.config);
  const access = parsed.ok ? parsed.config.access : undefined;
  return (
    <section
      aria-label="Steps that use this connection"
      className="mt-8 border-t border-solid border-foreground/10 pt-5"
    >
      <h3 className="text-[13px] font-semibold text-foreground">
        What the steps declare
      </h3>
      {bindings.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          No step binds this connection yet. Pick it as a step&apos;s reactor
          connection in a workflow&apos;s editor.
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-solid divide-foreground/10">
          {bindings.map((binding) => {
            const form = forms.get(blockRefKey(binding.block));
            return (
              <BindingRow
                key={`${binding.workflowId}:${binding.stepId}`}
                binding={binding}
                declared={
                  form === "loading"
                    ? undefined
                    : (form?.requireReactor ?? null)
                }
                access={access}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
