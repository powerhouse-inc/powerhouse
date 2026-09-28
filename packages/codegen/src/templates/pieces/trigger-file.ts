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

const polling: Polling<${auth}, Record<string, never>> = {
  strategy: DedupeStrategy.TIMEBASED,
  // Receives { auth, propsValue, lastFetchEpochMS }: fetch the items and
  // return each as { epochMilliSeconds, data }
  items: () => Promise.resolve([]),
};

export const ${v.exportName} = createTrigger({
${v.withAuth ? `  auth: ${v.camelCaseName}Auth,` : "  // Types context.auth as undefined, as the Polling above expects\n  auth: PieceAuth.None(),\n  requireAuth: false,"}
  name: "${v.triggerName}",
  displayName: "${v.triggerDisplayName}",
  description: "",
  props: {},
  sampleData: {},
  type: TriggerStrategy.POLLING,
  async test(context) {
    return await pollingHelper.test(polling, context);
  },
  async onEnable(context) {
    const { store, auth, propsValue } = context;
    await pollingHelper.onEnable(polling, { store, auth, propsValue });
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
    `import { createTrigger, TriggerStrategy } from "${PIECES_FRAMEWORK_PACKAGE}";`,
    v.withAuth
      ? `import { ${v.camelCaseName}Auth } from "../auth.js";`
      : undefined,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return ts`
${imports}

export const ${v.exportName} = createTrigger({
${v.withAuth ? `  auth: ${v.camelCaseName}Auth,` : "  requireAuth: false,"}
  name: "${v.triggerName}",
  displayName: "${v.triggerDisplayName}",
  description: "",
  props: {},
  sampleData: {},
  type: TriggerStrategy.WEBHOOK,
  async onEnable() {
    // Register context.webhookUrl with the service
  },
  async onDisable() {
    // Remove the registration
  },
  run(context) {
    // Called for each delivery, and by the reconciliation sweep with no
    // payload: ask the service for what changed then
    return Promise.resolve([context.payload.body]);
  },
});
`.raw;
};

export const pieceTriggerFileTemplate = (v: PieceTriggerTemplateArgs) =>
  v.strategy === "polling" ? pollingTemplate(v) : webhookTemplate(v);
