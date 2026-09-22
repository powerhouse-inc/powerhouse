// The engine's own blocks, described the way a piece's are. They belong to no
// package, so without this they are absent from every discovery surface.
import type {
  PieceActionDescriptor,
  PieceDescriptor,
  PiecePropDescriptor,
  PieceTriggerDescriptor,
} from "../pieces/index.js";

export const CORE_PIECE_NAME = "core";

// Versionless like a package piece: the engine running the workflow is the one
// that implements these, so there is nothing for an author to pin.
export const CORE_PIECE_VERSION = "";

function prop(
  name: string,
  displayName: string,
  description: string,
  options: { type?: string; required?: boolean } = {},
): PiecePropDescriptor {
  return {
    name,
    displayName,
    description,
    type: options.type ?? "SHORT_TEXT",
    required: options.required ?? false,
    hasDynamicResolver: false,
  };
}

const BRANCH: PieceActionDescriptor = {
  name: "branch",
  displayName: "Branch",
  description:
    "Routes to the true or false port. With `equals` set it compares the two " +
    "values, trimmed and case-insensitively; without it, any non-empty " +
    'condition other than "false" or "0" is true. It resolves values — it ' +
    "does not evaluate expressions, so a condition of \"{{a}} == 'x'\" is a " +
    "non-empty string and always takes the true port.",
  requireAuth: false,
  props: [
    prop(
      "condition",
      "Condition",
      "The value to route on, usually an expression like {{trigger.payload.status}}.",
      { required: true },
    ),
    prop(
      "equals",
      "Equals",
      "Take the true port when the condition matches this value. Omit to route on truthiness instead.",
    ),
  ],
};

const ASSERT: PieceActionDescriptor = {
  name: "assert",
  displayName: "Assert",
  description:
    "Fails the step when its value is blank or rejected, so a bad value stops " +
    "the run instead of reaching a step with a side effect.",
  requireAuth: false,
  props: [
    prop("value", "Value", "The value to check.", { required: true }),
    prop(
      "rejectValues",
      "Reject values",
      "Fail when the value is one of these.",
      {
        type: "ARRAY",
      },
    ),
    prop(
      "allowValues",
      "Allow values",
      "Fail unless the value is one of these.",
      {
        type: "ARRAY",
      },
    ),
    prop("allowEmpty", "Allow empty", "Treat a blank value as acceptable.", {
      type: "CHECKBOX",
    }),
    prop(
      "message",
      "Message",
      "Error message to fail with instead of the default.",
    ),
  ],
};

const SCHEDULE: PieceTriggerDescriptor = {
  name: "schedule",
  displayName: "Schedule",
  description: "Fires on a cron expression or a fixed interval.",
  strategy: "POLLING",
  requireAuth: false,
  hasSampleData: true,
  props: [
    prop("cron", "Cron expression", "A cron expression, e.g. 0 * * * *."),
    prop("everyMs", "Every (ms)", "Fixed interval in milliseconds.", {
      type: "NUMBER",
    }),
  ],
};

const WEBHOOK: PieceTriggerDescriptor = {
  name: "webhook",
  displayName: "Webhook",
  description:
    "Fires on an HTTP delivery to the workflow's endpoint. Ask for the URL " +
    "with the webhookEndpoint query rather than constructing it.",
  strategy: "WEBHOOK",
  requireAuth: false,
  hasSampleData: true,
  props: [],
};

const MANUAL: PieceTriggerDescriptor = {
  name: "manual",
  displayName: "Manual",
  description:
    "Fires only when something asks it to, with the fire mutation. The trigger " +
    "to use for a workflow driven by a test or a script.",
  strategy: "MANUAL",
  requireAuth: false,
  hasSampleData: false,
  props: [],
};

export const CORE_DESCRIPTOR: PieceDescriptor = {
  id: CORE_PIECE_NAME,
  source: { packageName: CORE_PIECE_NAME, version: CORE_PIECE_VERSION },
  displayName: "Core",
  description:
    "The engine's own blocks: branching, assertions, and the triggers that " +
    "belong to no service.",
  logoUrl: "",
  categories: ["CORE"],
  actions: [BRANCH, ASSERT],
  triggers: [SCHEDULE, WEBHOOK, MANUAL],
};

export function isCoreBlock(blockType: string): boolean {
  return blockType.startsWith(`${CORE_PIECE_NAME}#`);
}

// Same shape blockDescriptor returns for a piece block, so a caller reads one
// descriptor format whatever the block belongs to.
export function coreBlockDescriptor(blockType: string): unknown {
  const fragment = blockType.slice(CORE_PIECE_NAME.length + 1);
  const common = {
    displayName: CORE_DESCRIPTOR.displayName,
    logoUrl: CORE_DESCRIPTOR.logoUrl,
    auth: null,
  };
  if (fragment.startsWith("trigger:")) {
    const name = fragment.slice("trigger:".length);
    const trigger = CORE_DESCRIPTOR.triggers.find(
      (entry) => entry.name === name,
    );
    return trigger ? { ...common, trigger } : null;
  }
  const action = CORE_DESCRIPTOR.actions.find(
    (entry) => entry.name === fragment,
  );
  return action ? { ...common, action } : null;
}
