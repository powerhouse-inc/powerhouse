import type { Action, ActionContext } from "./actions.js";
import { serializeSignature } from "./signatures.js";

/**
 * An action's signer, as the wire declares it: signatures joined into strings,
 * because GraphQL declares them as a list of strings rather than of lists.
 */
export type TransportSigner = {
  user?: { address: string; networkId: string; chainId: number };
  app?: { name: string; key: string };
  signatures: string[];
};

/** An action's context, as the wire declares it. */
export type TransportActionContext = {
  prevOpIndex?: number;
  prevOpHash?: string;
  nonce?: string;
  signer?: TransportSigner;
};

/** An action projected onto exactly the fields the wire declares. */
export type TransportAction = {
  id: string;
  type: string;
  timestampUtcMs: string;
  /**
   * Non-nullable, because the wire declares it so. An action's own type says
   * `unknown`, which admits the absent input an action creator called without
   * one produces - {@link toTransportAction} refuses that rather than passing
   * it on.
   */
  input: NonNullable<unknown>;
  scope: string;
  context?: TransportActionContext;
};

/**
 * Projects an action onto the fields the GraphQL `ActionInput` declares.
 *
 * A projection rather than a spread, because an input object rejects a field it
 * does not declare, and that refusal takes the whole request with it. An action
 * read back out of storage can carry fields the type no longer has - a legacy
 * `attachments` array, or the operation fields left behind by a signing helper
 * that returns an operation - and any one of them would sink an otherwise valid
 * submission.
 *
 * Only fields the action actually carries are emitted, so an unsigned action
 * sends no context at all rather than a context full of nulls.
 */
export function toTransportAction(action: Action): TransportAction {
  if (action.input === undefined || action.input === null) {
    // The wire declares an input, so this would be refused on arrival as a
    // missing required field, naming the field but not the action. Refused here
    // instead, where the action is still in hand.
    throw new Error(
      `Action ${action.id} (${action.type}) has no input, which the wire requires`,
    );
  }

  const projected: TransportAction = {
    id: action.id,
    type: action.type,
    timestampUtcMs: action.timestampUtcMs,
    input: action.input,
    scope: action.scope,
  };

  const context = toTransportContext(action.context);
  return context ? { ...projected, context } : projected;
}

function toTransportContext(
  context: ActionContext | undefined,
): TransportActionContext | undefined {
  if (!context) {
    return undefined;
  }

  const projected: TransportActionContext = {};
  if (context.prevOpIndex !== undefined) {
    projected.prevOpIndex = context.prevOpIndex;
  }
  if (context.prevOpHash !== undefined) {
    projected.prevOpHash = context.prevOpHash;
  }
  if (context.nonce !== undefined) {
    projected.nonce = context.nonce;
  }

  const signer = context.signer;
  if (signer) {
    projected.signer = {
      ...(signer.user ? { user: signer.user } : {}),
      ...(signer.app ? { app: signer.app } : {}),
      signatures: (signer.signatures ?? []).map(serializeSignature),
    };
  }

  return Object.keys(projected).length > 0 ? projected : undefined;
}
