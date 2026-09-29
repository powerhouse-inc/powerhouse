// A block is added before its form loads; this is what the loaded form adds
// afterwards: the defaults still unset, and the port the step continues on.
import { flowPorts } from "@powerhousedao/pieces-framework/workflow";
import { sameBlock, type BlockRef } from "./blocks.js";
import type { BlockForm } from "./forms.js";
import { lacksDefaults, withPropDefaults } from "./prop-defaults.js";

// An edge as the follow-up reads and rewrites it.
export interface FollowUpEdge {
  id: string;
  from: string;
  to: string;
  port: string;
  condition?: string | null;
}

// A block just added, for the follow-up that completes it.
export interface AddedBlock {
  id: string;
  // Undo takes the add and its follow-up back together.
  group: string;
  block: BlockRef;
  // The edge the step continues on, when its port was guessed.
  continuation?: { edgeId: string; port: string };
}

// The config with the form's defaults written into unset fields, or null
// when there is nothing to add. A value set in the meantime wins.
export function followUpConfig(
  form: Pick<BlockForm, "props">,
  config: unknown,
): Record<string, unknown> | null {
  return lacksDefaults(form.props, config)
    ? withPropDefaults(form.props, config)
    : null;
}

export interface FollowUp {
  config?: Record<string, unknown>;
  // Re-points the continuing edge onto the port the form declares.
  repoint?: { edge: FollowUpEdge; port: string };
}

// Null when there is nothing to do, or the block is gone.
export function planFollowUp(
  added: AddedBlock,
  current: { block: BlockRef; config: unknown } | undefined,
  edges: readonly FollowUpEdge[],
  form: BlockForm,
): FollowUp | null {
  if (!current || !sameBlock(current.block, added.block)) return null;
  const config = followUpConfig(form, current.config);
  const port = form.ports ? flowPorts(form.ports)[0] : undefined;
  const edge = added.continuation
    ? edges.find((entry) => entry.id === added.continuation!.edgeId)
    : undefined;
  const repoint =
    edge && port && edge.port !== port && edge.port === added.continuation!.port
      ? { edge, port }
      : undefined;
  if (!config && !repoint) return null;
  return {
    ...(config ? { config } : {}),
    ...(repoint ? { repoint } : {}),
  };
}
