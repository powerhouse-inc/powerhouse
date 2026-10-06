// Validity is computed where it is shown, never stored: one blockMissing
// reading per block, for the canvas badge, the panel header and Publish.
import { useEffect, useMemo } from "react";
import { flowOrder } from "./ap-layout.js";
import {
  useBlockForm,
  useBlockForms,
  useDynamicLookup,
  useDynamicPrefetch,
} from "./design-time.js";
import { stepBlock, triggerBlock, type BlockRef } from "./blocks.js";
import type { BlockForm, BlockFormProp } from "./forms.js";
import { blockRefKey } from "./query-keys.js";
import type { PropertySettingModel, WorkflowModel } from "./model.js";
import type { ResolverKeyInput } from "./query-keys.js";
import {
  blockMissing,
  isPropVisible,
  resolverInputFor,
  settingFor,
  storedSchema,
  undeclaredPortIssues,
  workflowReadiness,
  type WorkflowReadiness,
} from "./validation.js";

export interface CheckedBlock {
  id: string;
  block: BlockRef;
  config: unknown;
  connectionId: string | null;
  reactorConnectionId?: string | null;
  propertySettings?: PropertySettingModel[] | null;
  skip?: boolean;
  // Ports of the edges leaving this block, checked against the declared ones.
  outgoingPorts?: readonly string[];
}

export interface BlockCheck {
  form: BlockForm | null | "loading";
  formError?: string;
  // Null while not checked.
  missing: string[] | null;
  // Wiring the block cannot honour, e.g. an edge on an undeclared port.
  issues: string[];
  lookup: (input: ResolverKeyInput) => BlockFormProp[] | undefined;
}

function configOf(block: CheckedBlock): Record<string, unknown> {
  return block.config && typeof block.config === "object"
    ? (block.config as Record<string, unknown>)
    : {};
}

// Resolver inputs for the DYNAMIC props nothing has stored a schema for.
function unknownDynamic(
  block: CheckedBlock,
  form: BlockForm | null | "loading" | undefined,
): ResolverKeyInput[] {
  if (!form || form === "loading" || block.skip) return [];
  const config = configOf(block);
  return form.props
    .filter(
      (prop) =>
        prop.type === "DYNAMIC" &&
        isPropVisible(prop, config) &&
        settingFor(block.propertySettings, prop.name)?.mode !== "EXPRESSION" &&
        !storedSchema(block.propertySettings, prop.name),
    )
    .map((prop) =>
      resolverInputFor(
        block.block,
        prop,
        config,
        block.connectionId,
        block.reactorConnectionId,
      ),
    );
}

// Missing fields and wiring issues, as one list a Publish gate can read.
function withIssues(
  missing: string[] | null,
  issues: readonly string[],
): string[] | null {
  if (issues.length === 0) return missing;
  return [...(missing ?? []), ...issues];
}

export function useBlockCheck(block: CheckedBlock): BlockCheck {
  const { form, error } = useBlockForm(block.block);
  const lookup = useDynamicLookup();
  return {
    form,
    formError: error,
    issues: block.skip ? [] : undeclaredPortIssues(form, block.outgoingPorts),
    missing: blockMissing({
      form,
      block: block.block,
      config: block.config,
      connectionId: block.connectionId,
      reactorConnectionId: block.reactorConnectionId,
      propertySettings: block.propertySettings,
      skip: block.skip,
      resolveDynamic: lookup,
    }),
    lookup,
  };
}

export interface WorkflowCheck {
  readiness: WorkflowReadiness;
  missing: ReadonlyMap<string, string[] | null>;
}

// Every block of the draft, opened or not: forms and unknown DYNAMIC
// children are fetched into the cache the panels read.
export function useWorkflowCheck(model: WorkflowModel): WorkflowCheck {
  const blocks = useMemo(() => {
    const byId = new Map<string, CheckedBlock>(
      model.steps.map((step) => [step.id, { ...step, block: stepBlock(step) }]),
    );
    const ordered: CheckedBlock[] = model.trigger
      ? [{ ...model.trigger, block: triggerBlock(model.trigger) }]
      : [];
    for (const id of flowOrder(model)) {
      const step = byId.get(id);
      if (step) ordered.push(step);
    }
    return ordered.map((block) => ({
      ...block,
      outgoingPorts: model.edges
        .filter((edge) => edge.from === block.id)
        .map((edge) => edge.port),
    }));
  }, [model]);
  const forms = useBlockForms(blocks.map((block) => block.block));
  const formOf = (block: CheckedBlock) => forms.get(blockRefKey(block.block));
  const lookup = useDynamicLookup();
  const prefetch = useDynamicPrefetch();

  const wanted = blocks.flatMap((block) =>
    unknownDynamic(block, formOf(block)).map((input) => ({
      input,
      config: configOf(block),
    })),
  );
  const wantedKey = JSON.stringify(wanted);
  useEffect(() => {
    const entries = JSON.parse(wantedKey) as {
      input: ResolverKeyInput;
      config: Record<string, unknown>;
    }[];
    for (const entry of entries) prefetch(entry.input, entry.config);
  }, [wantedKey, prefetch]);

  const results = blocks.map((block) => ({
    id: block.id,
    missing: withIssues(
      blockMissing({
        form: formOf(block),
        block: block.block,
        config: block.config,
        connectionId: block.connectionId,
        reactorConnectionId: block.reactorConnectionId,
        propertySettings: block.propertySettings,
        skip: block.skip,
        resolveDynamic: lookup,
      }),
      block.skip
        ? []
        : undeclaredPortIssues(formOf(block), block.outgoingPorts),
    ),
  }));
  return {
    readiness: workflowReadiness(results, Boolean(model.trigger)),
    missing: new Map(results.map((result) => [result.id, result.missing])),
  };
}
