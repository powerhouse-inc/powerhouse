import { z } from "zod";
import type { Action } from "./actions.js";
import {
  initialAuthDigest,
  resolveInitialAuthTemplate,
} from "./initial-auth.js";
import type { InitialAuthTemplate } from "./initial-auth.js";
import { assertValidInitialGrants, GrantSchema } from "./auth-v1.js";
import type { PHAuthState } from "./state.js";
import type { PHDocumentHeader } from "./documents.js";

export const AUTH_BOOTSTRAP_PROTOCOL = "auth-bootstrap";
const digest = z.templateLiteral([
  "sha256:",
  z.string().regex(/^[a-f0-9]{64}$/u),
]);
const common = {
  version: z.literal(1),
  initializerKey: z.string().min(1),
  origin: z.string().min(1),
  intentDigest: digest,
  modelVersion: z.number().int().positive(),
  stateDigest: digest,
  policyDigest: digest,
  actionIds: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
};
export const InitialAuthCommitmentSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...common,
      kind: z.literal("template"),
      templateDigest: digest,
      bindings: z
        .object({
          deployment: z.record(z.string(), z.string()),
          instance: z.record(z.string(), z.string()),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("copy"),
      source: z
        .object({
          documentId: z.string().min(1),
          branch: z.string().min(1),
          revision: z.record(z.string(), z.number().int().nonnegative()),
        })
        .strict(),
    })
    .strict(),
]);
export type InitialAuthCommitment = z.infer<typeof InitialAuthCommitmentSchema>;

export class AuthBootstrapError extends Error {
  constructor(
    readonly code:
      | "invalid-bootstrap"
      | "untrusted-origin"
      | "unsupported-bootstrap"
      | "incomplete-bootstrap"
      | "intent-conflict",
    message: string,
  ) {
    super(message);
    this.name = "AuthBootstrapError";
  }
}

export function parseInitialAuthCommitment(
  value: unknown,
): InitialAuthCommitment {
  const parsed = InitialAuthCommitmentSchema.safeParse(value);
  if (!parsed.success || new Set(parsed.data.actionIds).size !== 3)
    throw new AuthBootstrapError(
      "invalid-bootstrap",
      "Malformed initial authorization commitment.",
    );
  const { intentDigest, ...intent } = parsed.data;
  if (initialAuthDigest(intent) !== intentDigest)
    throw new AuthBootstrapError(
      "invalid-bootstrap",
      "The canonical creation intent digest does not match its contents.",
    );
  return parsed.data;
}

/** A routing hint only; admission validates every part before writing anything. */
export function isAuthBootstrapEnvelope(actions: readonly Action[]): boolean {
  return (
    actions.length === 3 &&
    actions[0]?.type === "CREATE_DOCUMENT" &&
    actions[1]?.type === "UPGRADE_DOCUMENT" &&
    actions[2]?.type === "INITIALIZE_AUTH"
  );
}

export function hasAuthBootstrapHint(action: Action): boolean {
  return (
    action.context?.initialAuth !== undefined ||
    (action.type === "CREATE_DOCUMENT" &&
      typeof action.input === "object" &&
      action.input !== null &&
      "initialAuth" in action.input)
  );
}

/** Signed snapshots are indivisible: a reader must be allowed every embedded domain scope. */
export function canReadBootstrapSnapshot(
  action: Action,
  header: Pick<PHDocumentHeader, "protocolVersions">,
  readable: (scope: string) => boolean,
): boolean {
  if (
    header.protocolVersions?.[AUTH_BOOTSTRAP_PROTOCOL] !== 1 ||
    action.type !== "UPGRADE_DOCUMENT"
  )
    return true;
  const input = z
    .object({
      initialState: z.record(z.string(), z.unknown()).optional(),
      state: z.record(z.string(), z.unknown()).optional(),
    })
    .safeParse(action.input);
  if (!input.success) return false;
  const snapshot = input.data.initialState ?? input.data.state;
  return (
    snapshot === undefined ||
    Object.keys(snapshot).every(
      (scope) => scope === "auth" || scope === "document" || readable(scope),
    )
  );
}

const createInputSchema = z.object({
  model: z.string(),
  version: z.literal(0),
  documentId: z.string(),
  signing: z.object({ publicKey: z.object({}).strict() }),
  protocolVersions: z.record(z.string(), z.number()),
  initialAuth: InitialAuthCommitmentSchema,
});
const upgradeInputSchema = z.object({
  model: z.string(),
  fromVersion: z.literal(0),
  toVersion: z.number(),
  documentId: z.string(),
  initialState: z
    .object({
      auth: z
        .object({ version: z.literal(0), grants: z.array(z.never()) })
        .strict(),
    })
    .passthrough(),
});

/** Pure envelope checks; signature verification and origin trust belong to admission. */
export function validateAuthBootstrapEnvelope(
  actions: readonly Action[],
  documentId: string,
  template: InitialAuthTemplate | undefined,
): {
  commitment: InitialAuthCommitment;
  policy: PHAuthState;
  documentType: string;
} {
  const invalid = (message: string): never => {
    throw new AuthBootstrapError("invalid-bootstrap", message);
  };
  if (!isAuthBootstrapEnvelope(actions))
    return invalid(
      "Initial authorization requires the complete creation envelope.",
    );
  const create = createInputSchema.safeParse(actions[0].input);
  const upgrade = upgradeInputSchema.safeParse(actions[1].input);
  const initialize = z
    .object({ version: z.literal(1), grants: z.array(GrantSchema()) })
    .strict()
    .safeParse(actions[2].input);
  if (!create.success || !upgrade.success || !initialize.success)
    return invalid("Malformed initial authorization creation actions.");
  const commitment = parseInitialAuthCommitment(create.data.initialAuth);
  if (
    create.data.protocolVersions[AUTH_BOOTSTRAP_PROTOCOL] !== 1 ||
    create.data.protocolVersions.signature !== 2
  )
    return invalid(
      "Initial authorization requires auth-bootstrap:1 and signature:2.",
    );
  if (
    create.data.documentId !== documentId ||
    upgrade.data.documentId !== documentId ||
    upgrade.data.model !== create.data.model ||
    upgrade.data.toVersion !== commitment.modelVersion
  )
    return invalid(
      "Creation actions disagree on document identity or model version.",
    );
  if (
    actions.some(
      (action, index) =>
        action.id !== commitment.actionIds[index] ||
        action.scope !== (index === 2 ? "auth" : "document") ||
        action.context?.signer?.app?.key !== commitment.initializerKey,
    )
  )
    return invalid(
      "Creation actions disagree with the committed action IDs or initializer.",
    );
  if (
    actions.some(
      (action) => action.context?.initialAuth !== commitment.intentDigest,
    )
  )
    return invalid(
      "Creation fragments disagree on their bootstrap routing commitment.",
    );
  if (initialAuthDigest(upgrade.data.initialState) !== commitment.stateDigest)
    return invalid("The initial state does not match its creation commitment.");
  const grants = initialize.data.grants;
  assertValidInitialGrants(grants, create.data.model, undefined);
  const policy: PHAuthState = { version: 1, grants };
  if (initialAuthDigest(policy) !== commitment.policyDigest)
    return invalid(
      "The initial policy does not match its creation commitment.",
    );
  if (commitment.kind === "template") {
    if (!template || template.digest !== commitment.templateDigest)
      return invalid(
        "The initial policy references an unavailable model template.",
      );
    const resolved = resolveInitialAuthTemplate(
      template,
      commitment.bindings,
      create.data.model,
    );
    if (initialAuthDigest(resolved) !== commitment.policyDigest)
      return invalid(
        "The initial policy does not resolve from the recorded bindings.",
      );
  }
  return { commitment, policy, documentType: create.data.model };
}
