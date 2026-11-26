/**
 * Instance administration (package installs, the AI gateway's key and model,
 * remote drives, privacy erasure and disclosure, the inspection levers) is
 * logged per action with who did it: the session's label and the address it
 * acts for, so an agent administering as its user reads "0x... (vetra agent
 * X)". Every such log line starts with {@link ADMINISTRATION_LOG_PREFIX}.
 */

/** What every administrative action's log line starts with. */
export const ADMINISTRATION_LOG_PREFIX = "Administration:";

/** The caller as an administrative log line names it. */
export function describeAdministrator(
  user: { address?: string; label?: string } | null | undefined,
): string {
  if (!user?.address) return "an anonymous caller";
  return user.label ? `${user.address} (${user.label})` : user.address;
}

/** A logger with document-model's `@token` placeholders. */
export type AdministrationLogger = {
  info: (message: string, ...replacements: unknown[]) => void;
};

/**
 * Logs one administrative action: `action` says what was done ("installed
 * package @powerhousedao/vetra"), `user` who did it.
 */
export function logAdministration(
  logger: AdministrationLogger,
  action: string,
  user: { address?: string; label?: string } | null | undefined,
): void {
  logger.info(
    `${ADMINISTRATION_LOG_PREFIX} @action by @administrator`,
    action,
    describeAdministrator(user),
  );
}
