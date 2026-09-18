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

const STORE_LIKE = `// The half of the framework's Store this trigger uses; the host serves it.
interface StoreLike {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<unknown>;
}`;

const fetchRecords = (v: PieceTriggerTemplateArgs) =>
  v.withAuth
    ? `  const records = await clientFor(context.auth).request<{ id: string }[]>({
    path: "records",
    query: { ordering: "-created" },
  });`
    : `  const documents = await reactorOf(context).find({ limit: 50 });
  const records = documents.map((document) => ({ id: document.documentId }));`;

const pollingBody = (v: PieceTriggerTemplateArgs) => `
// One cursor per workflow: the host serves ctx.store at FLOW scope, so two
// workflows watching the same service keep their own reading of it.
const CURSOR_KEY = "${v.kebabCaseName}:${v.triggerName}-cursor";

interface Cursor {
  seen: string[];
}

// A cursor that cannot be read is treated as absent rather than fatal: the
// poll then reports nothing new and reseeds, losing one cycle of changes.
function parseCursor(value: unknown): Cursor {
  if (typeof value !== "object" || value === null) return { seen: [] };
  const seen = (value as { seen?: unknown }).seen;
  return {
    seen: Array.isArray(seen) ? seen.filter((id) => typeof id === "string") : [],
  };
}

async function poll(context: {
  auth?: unknown;
  store: StoreLike;
}): Promise<unknown[]> {
${fetchRecords(v)}
  const cursor = parseCursor(await context.store.get(CURSOR_KEY));
  const seen = new Set(cursor.seen);
  const fresh = records.filter((record) => !seen.has(record.id));
  // Rebuilt from each poll rather than accumulated, so the cursor stays
  // bounded by what the service currently reports.
  await context.store.put(CURSOR_KEY, { seen: records.map((r) => r.id) });
  return fresh;
}
`;

const pollingTrigger = () => `  type: TriggerStrategy.POLLING,
  props: {},
  // What the editor shows as the trigger's payload before it has ever fired.
  sampleData: { id: "1", name: "A record" },
  // Called when a workflow using this trigger is switched on: seed the cursor
  // so the first real poll does not replay the whole history.
  async onEnable(context) {
    await poll(context);
  },
  async onDisable(context) {
    await context.store.put(CURSOR_KEY, { seen: [] });
  },
  async run(context) {
    return await poll(context);
  },
`;

const webhookRegistration = (v: PieceTriggerTemplateArgs) =>
  v.withAuth
    ? `  async onEnable(context) {
    const created = await clientFor(context.auth).request<{ id: string }>({
      method: "POST",
      path: "webhooks",
      json: { url: context.webhookUrl, events: ["record.created"] },
    });
    await context.store.put(WEBHOOK_KEY, created.id);
  },
  async onDisable(context) {
    const id = await context.store.get(WEBHOOK_KEY);
    if (typeof id !== "string" || id === "") return;
    await clientFor(context.auth).request({
      method: "DELETE",
      path: \`webhooks/\${encodeURIComponent(id)}\`,
    });
  },`
    : `  // Nothing to register yet: replace these with the calls that tell the
  // service to post to context.webhookUrl, and to stop.
  async onEnable(context) {
    await context.store.put(WEBHOOK_KEY, context.webhookUrl);
  },
  async onDisable(context) {
    await context.store.put(WEBHOOK_KEY, "");
  },`;

const webhookBody = (v: PieceTriggerTemplateArgs) => `
// What onEnable registered, so onDisable can take it down again.
const WEBHOOK_KEY = "${v.kebabCaseName}:${v.triggerName}-webhook";
`;

const webhookTrigger = (
  v: PieceTriggerTemplateArgs,
) => `  type: TriggerStrategy.WEBHOOK,
  props: {},
  // What the editor shows as the trigger's payload before it has ever fired.
  sampleData: { id: "1", name: "A record" },
${webhookRegistration(v)}
  // One delivery, one run: the host has already answered the service.
  run(context) {
    return Promise.resolve([context.payload.body]);
  },
`;

export const pieceTriggerFileTemplate = (v: PieceTriggerTemplateArgs) => {
  const polling = v.strategy === "polling";
  const framework = [
    "createTrigger",
    "TriggerStrategy",
    polling && !v.withAuth ? "reactorOf" : undefined,
  ].filter((name) => name !== undefined);
  const imports = [
    `import { ${framework.join(", ")} } from "${PIECES_FRAMEWORK_PACKAGE}";`,
    v.withAuth
      ? `import { ${v.camelCaseName}Auth } from "../auth.js";`
      : undefined,
    v.withAuth
      ? `import { clientFor${polling ? ", type StoreLike" : ""} } from "../common/context.js";`
      : undefined,
    polling && !v.withAuth ? STORE_LIKE : undefined,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  const description = polling
    ? "Fires once for each record the service has not reported before."
    : "Fires once for each delivery the service posts to this workflow.";

  return ts`
${imports}
${polling ? pollingBody(v) : webhookBody(v)}
export const ${v.exportName} = createTrigger({
${v.withAuth ? `  auth: ${v.camelCaseName}Auth,` : "  requireAuth: false,"}
  name: "${v.triggerName}",
  displayName: "${v.triggerDisplayName}",
  description: "${description}",
${polling ? pollingTrigger() : webhookTrigger(v)}});
`.raw;
};
