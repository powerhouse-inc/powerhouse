/**
 * Writes a host refuses because nobody signed them for their caller. From
 * Powerhouse 6.4 no host signs for a caller: an action reaches the reactor
 * signed by its caller's own key, or the host refuses the write. One table
 * holds the codes, what each says happened and its fix, for the 6.4 refusal
 * (GraphQL and MCP) and for the 6.3 line's log and `ph` check.
 */

/** The GraphQL error code (`extensions.code`) of every refusal. */
export const UNSIGNED_WRITE_ERROR_CODE = "UNSIGNED_WRITE";

export const UNSIGNED_WRITE_REASONS = [
  "unsigned-actions",
  "host-built",
  "no-identity",
  "mcp-http-write",
] as const;

/**
 * Why a write was refused: it carried unsigned actions, it asked the host to
 * build them, its actions are signed by a key that names no user, or it is a
 * write tool over HTTP `/mcp`.
 */
export type UnsignedWriteReason = (typeof UNSIGNED_WRITE_REASONS)[number];

/** Who asked for the write, as the host's door saw them; null is anonymous. */
export type UnsignedWriteCaller = { address: string; label?: string } | null;

/** One refused write. */
export type UnsignedWrite = {
  reason: UnsignedWriteReason;
  /** The GraphQL field (`Mutation.renameDocument`) or the MCP tool. */
  field: string;
  caller: UnsignedWriteCaller;
  /** The types of the refused actions, in order, each once. */
  actions: readonly string[];
};

/** What each reason's case is, as a log or a check groups it. */
export const UNSIGNED_WRITE_CASES: Record<UnsignedWriteReason, string> = {
  "unsigned-actions": "a mutation carried unsigned actions",
  "host-built": "the mutation asks the host to build the actions",
  "no-identity": "signed by a key that names no user",
  "mcp-http-write": "a write tool over HTTP /mcp",
};

const SIGN_AS_YOURSELF =
  "Sign it as yourself: a Powerhouse client (reactor-browser, clint, `ph mcp`) does it for you";

/** The caller as a refusal names it. */
export function describeUnsignedWriteCaller(
  caller: UnsignedWriteCaller,
): string {
  if (!caller?.address) return "an anonymous caller";
  return caller.label ? `${caller.address} (${caller.label})` : caller.address;
}

/** The `ph mutate` line that sends the refused actions signed. */
export function phMutateFix(actions: readonly string[]): string {
  if (actions.length === 1) {
    const [type] = actions;
    if (type === "CREATE_DOCUMENT") {
      return "ph mutate --create <type> --parent <drive>";
    }
    if (type === "DELETE_DOCUMENT") return "ph mutate --delete <document>";
    return `ph mutate <document> ${type} --input '<json>'`;
  }
  return "ph mutate <document> --actions <file.json>";
}

/** What the refused write did, after its field and caller. */
function whatItDid(write: UnsignedWrite): string {
  const actions = write.actions.length > 0 ? write.actions.join(", ") : "";
  switch (write.reason) {
    case "unsigned-actions":
      return actions
        ? `carries unsigned actions (${actions})`
        : "carries unsigned actions";
    case "host-built":
      return actions
        ? `asks the host to build and sign ${actions}`
        : "asks the host to build and sign its actions";
    case "no-identity":
      return actions
        ? `is signed by a key that names no user (${actions})`
        : "is signed by a key that names no user";
    case "mcp-http-write":
      return actions
        ? `over HTTP /mcp asks the host to sign ${actions}`
        : "over HTTP /mcp asks the host to sign its writes";
  }
}

/** The fix a refusal names. */
function fixFor(write: UnsignedWrite): string {
  switch (write.reason) {
    case "unsigned-actions":
    case "host-built":
      // F3e part 2 (host sessions) adds: ", or send a host session token".
      return `${SIGN_AS_YOURSELF}, or run \`${phMutateFix(write.actions)}\`.`;
    case "no-identity":
      return "Sign as a user: open the page by the sign-in link `ph dev` prints, or use a Powerhouse client with an identity (`ph login`, or the pseudonym it makes for you).";
    case "mcp-http-write":
      // F3e part 2 (host sessions) adds: ", or send a host session token".
      return "Reads stay open over HTTP /mcp. For writes run `ph mcp`, which signs as your session, or use a Powerhouse client.";
  }
}

/** The refusal's text: cause, caller and fix. */
export function unsignedWriteMessage(write: UnsignedWrite): string {
  return `Refused: this host signs no writes for its callers (Powerhouse 6.4). \`${write.field}\` from ${describeUnsignedWriteCaller(write.caller)} ${whatItDid(write)}. ${fixFor(write)}`;
}

/** A refusal's GraphQL `extensions`. */
export function unsignedWriteExtensions(write: UnsignedWrite): {
  code: typeof UNSIGNED_WRITE_ERROR_CODE;
  reason: UnsignedWriteReason;
  field: string;
  caller: UnsignedWriteCaller;
  actions: string[];
} {
  return {
    code: UNSIGNED_WRITE_ERROR_CODE,
    reason: write.reason,
    field: write.field,
    caller: write.caller?.address
      ? {
          address: write.caller.address,
          ...(write.caller.label ? { label: write.caller.label } : {}),
        }
      : null,
    actions: [...write.actions],
  };
}
