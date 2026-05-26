import { yellow, bold } from "colorette";

const UNRECOVERABLE_DB_PATTERNS: RegExp[] = [
  /Database migration failed:/i,
  /Migration .* failed/i,
  /relation "[^"]+" already exists/i,
  /column "[^"]+" does not exist/i,
  /schema "reactor" does not exist/i,
  /Unsupported PGLite data dir/i,
  /PG_VERSION/i,
];

function collectMessages(err: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      messages.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      messages.push(String(current));
      break;
    }
  }
  return messages;
}

export function isUnrecoverableDbError(err: unknown): boolean {
  const messages = collectMessages(err);
  return messages.some((msg) =>
    UNRECOVERABLE_DB_PATTERNS.some((re) => re.test(msg)),
  );
}

export function printDbRecoveryHint(err: unknown): void {
  const messages = collectMessages(err);
  const offending = messages.find((msg) =>
    UNRECOVERABLE_DB_PATTERNS.some((re) => re.test(msg)),
  );
  console.error("");
  console.error(
    yellow(bold("Switchboard hit an unrecoverable database error.")),
  );
  if (offending) {
    console.error(yellow(`  ${offending}`));
  }
  console.error("");
  console.error(
    yellow("If this is a local PGlite store, you can reset it with:"),
  );
  console.error(yellow("  ph switchboard --reset"));
  console.error(
    yellow(
      "This is destructive: it wipes the local .ph/reactor-storage and .ph/read-storage directories.",
    ),
  );
  console.error(
    yellow(
      "For Postgres-backed deployments (PH_REACTOR_DATABASE_URL / DATABASE_URL), reset the database manually instead.",
    ),
  );
  console.error("");
}
