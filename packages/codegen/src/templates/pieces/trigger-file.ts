import { PIECES_FRAMEWORK_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";
import type { PieceNames } from "../../file-builders/types.js";

export type PieceTriggerTemplateArgs = PieceNames & {
  /** Exported const, e.g. "acmeCrmNewRecordTrigger". */
  exportName: string;
  /** The trigger's own name, the half after "#" in a block type. */
  triggerName: string;
  triggerDisplayName: string;
  strategy: "polling" | "webhook";
  withAuth: boolean;
};

const pollingTemplate = (v: PieceTriggerTemplateArgs) => {
  const auth = v.withAuth
    ? `AppConnectionValueForAuthProperty<typeof ${v.camelCaseName}Auth>`
    : "undefined";
  const imports = [
    `import { createTrigger, ${v.withAuth ? "" : "PieceAuth, "}TriggerStrategy${v.withAuth ? ", type AppConnectionValueForAuthProperty" : ""} } from "${PIECES_FRAMEWORK_PACKAGE}";`,
    `import { DedupeStrategy, pollingHelper, type Polling } from "${PIECES_FRAMEWORK_PACKAGE}/common";`,
    v.withAuth
      ? `import { ${v.camelCaseName}Auth } from "../auth.js";`
      : undefined,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return ts`
${imports}

// The second type argument is the props' values: update it when adding props
const polling: Polling<${auth}, Record<string, never>> = {
  strategy: DedupeStrategy.TIMEBASED,
  // Fetch items newer than lastFetchEpochMS and return each as
  // { epochMilliSeconds, data }; each new item starts one workflow run
  items: () => Promise.resolve([]),
};

export const ${v.exportName} = createTrigger({
${v.withAuth ? `  auth: ${v.camelCaseName}Auth,` : "  // Types context.auth as undefined, as the Polling above expects\n  auth: PieceAuth.None(),\n  requireAuth: false,"}
  // Saved workflows refer to the trigger by name: don't rename it once published
  name: "${v.triggerName}",
  displayName: "${v.triggerDisplayName}",
  // Shown under the trigger in the editor: say what event starts a run
  description: "",
  // Inputs the user fills in on the trigger, read from context.propsValue
  props: {},
  // An example item, so later steps can be wired up before the trigger fires
  sampleData: {},
  type: TriggerStrategy.POLLING,
  async test(context) {
    return await pollingHelper.test(polling, context);
  },
  // Polls every minute by default; call context.setSchedule({ intervalMs })
  // here to change that
  async onEnable(context) {
    const { store, auth, propsValue, isRepublish } = context;
    await pollingHelper.onEnable(polling, {
      store,
      auth,
      propsValue,
      isRepublish,
    });
  },
  async onDisable(context) {
    const { store, auth, propsValue } = context;
    await pollingHelper.onDisable(polling, { store, auth, propsValue });
  },
  async run(context) {
    return await pollingHelper.poll(polling, context);
  },
});
`.raw;
};

const webhookTemplate = (v: PieceTriggerTemplateArgs) => {
  const imports = [
    `import { createTrigger, ${v.withAuth ? "" : "PieceAuth, "}TriggerStrategy } from "${PIECES_FRAMEWORK_PACKAGE}";`,
    v.withAuth
      ? `import { ${v.camelCaseName}Auth } from "../auth.js";`
      : undefined,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return ts`
${imports}

export const ${v.exportName} = createTrigger({
${v.withAuth ? `  auth: ${v.camelCaseName}Auth,` : "  // Types context.auth as undefined\n  auth: PieceAuth.None(),\n  requireAuth: false,"}
  // Saved workflows refer to the trigger by name: don't rename it once published
  name: "${v.triggerName}",
  displayName: "${v.triggerDisplayName}",
  // Shown under the trigger in the editor: say what event starts a run
  description: "",
  // Inputs the user fills in on the trigger, read from context.propsValue
  props: {},
  // An example item, so later steps can be wired up before the trigger fires
  sampleData: {},
  type: TriggerStrategy.WEBHOOK,
  async onEnable() {
    // Called when a workflow is switched on: register context.webhookUrl
    // with the service
  },
  async onDisable() {
    // Called when the workflow is switched off: remove the registration
  },
  // If the service expires registrations, add renewConfiguration and onRenew
  // Testing the trigger shows sampleData; add test() to fetch real items
  run(context) {
    // context.payload holds each delivery ({ body, headers, queryParams }).
    // Also called periodically with no payload: ask the service what changed
    const payload: { body: unknown } | undefined = context.payload;
    return Promise.resolve(payload === undefined ? [] : [payload.body]);
  },
});
`.raw;
};

export const pieceTriggerFileTemplate = (v: PieceTriggerTemplateArgs) =>
  v.strategy === "polling" ? pollingTemplate(v) : webhookTemplate(v);
