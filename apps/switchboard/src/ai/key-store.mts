import type { ComposedWorkflowRuntime } from "../workflow-runtime.mjs";

type SecretStore = Awaited<ReturnType<ComposedWorkflowRuntime["secrets"]>>;

/**
 * The gateway's settings, held as host secrets (`ownerId: null`) in the
 * workflow runtime's encrypted store and addressed by a fixed label. Host
 * secrets resolve for no document and never appear in the
 * `workflowRuntime.secrets` listing, and no API here returns a value.
 */
export const AI_KEY_LABEL = "ai-gateway/openrouter/api-key";
/** The model is not secret; it lives here so the gateway needs no table. */
export const AI_MODEL_LABEL = "ai-gateway/openrouter/model";

export type AiSecretStore = Pick<
  SecretStore,
  "get" | "create" | "rotate" | "list" | "delete"
>;

export interface StoredKey {
  value: string;
  setBy: string | null;
  setAt: string;
}

function findActive(
  stats: Awaited<ReturnType<SecretStore["list"]>>,
  label: string,
) {
  return stats.filter(
    (stat) =>
      stat.label === label && stat.ownerId === null && stat.status === "ACTIVE",
  );
}

async function readSetting(
  store: AiSecretStore,
  label: string,
): Promise<StoredKey | undefined> {
  const newest = findActive(await store.list(), label).at(0);
  if (!newest) return undefined;
  return {
    value: await store.get(newest.ref, null),
    setBy: newest.createdBy,
    setAt: newest.updatedAt,
  };
}

async function writeSetting(
  store: AiSecretStore,
  label: string,
  value: string,
  actor: string | undefined,
): Promise<void> {
  const newest = findActive(await store.list(), label).at(0);
  if (newest) {
    await store.rotate(newest.ref, value);
    return;
  }
  await store.create({ value, label, ownerId: null, createdBy: actor ?? null });
}

export const readKey = (store: AiSecretStore) =>
  readSetting(store, AI_KEY_LABEL);

export const writeKey = (
  store: AiSecretStore,
  value: string,
  actor: string | undefined,
) => writeSetting(store, AI_KEY_LABEL, value, actor);

/** Tombstones the key: the value becomes unrecoverable. */
export async function deleteKey(store: AiSecretStore): Promise<void> {
  const active = findActive(await store.list(), AI_KEY_LABEL);
  for (const stat of active) await store.delete(stat.ref);
}

export const readModel = async (store: AiSecretStore) =>
  (await readSetting(store, AI_MODEL_LABEL))?.value;

export const writeModel = (
  store: AiSecretStore,
  model: string,
  actor: string | undefined,
) => writeSetting(store, AI_MODEL_LABEL, model, actor);

/** `sk-or-v1-…abcd`: the provider prefix and the last four, nothing between. */
export function maskKey(value: string): string {
  const prefix = /^sk-(?:[a-z]+-)*(?:v\d+-)?/i.exec(value)?.[0] ?? "";
  // A value this short would be mostly shown by its tail.
  if (value.length - prefix.length < 16) return `${prefix}…`;
  return `${prefix}…${value.slice(-4)}`;
}
