import {
  openInBrowser,
  opensBrowser,
  signInLink,
} from "@powerhousedao/shared/clis/local-sign-in";
import type { RunRecord } from "./run-record-schema.js";

/**
 * Sign-in by link (F3d), as a stack sees it: the compound makes a secret at
 * each start, hands it to the members that serve Connect, and keeps it in
 * its owner-only run record (`extra.signIn`), beside the control channel's
 * token. Whoever holds the record mints a link with a fresh code: the
 * compound at start, the Cli of a stack that has one, a second start.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The secret a stack's record keeps, if any. */
export function signInSecretOf(
  record: Pick<RunRecord, "extra"> | undefined,
): string | undefined {
  const signIn = record?.extra?.signIn;
  return isRecord(signIn) && typeof signIn.secret === "string"
    ? signIn.secret
    : undefined;
}

/** A Connect member's sign-in link, with a code minted now. */
export interface SignInLink {
  member: string;
  link: string;
  /** As the member was asked (`--open`, `runner.openBrowser`). */
  open?: boolean;
}

/** The members of a stack that sign pages in by link (their outputs say
 * `localSignIn`), and their app URLs. */
export function signInMembersOf(
  members: Readonly<Record<string, { outputs?: unknown }>>,
): { member: string; app: string; open?: boolean }[] {
  return Object.entries(members).flatMap(([member, entry]) => {
    const outputs = entry.outputs;
    if (!isRecord(outputs) || !isRecord(outputs.localSignIn)) return [];
    const app = isRecord(outputs.endpoints)
      ? outputs.endpoints.connect
      : undefined;
    if (typeof app !== "string") return [];
    const { open } = outputs.localSignIn;
    return [{ member, app, ...(typeof open === "boolean" ? { open } : {}) }];
  });
}

/** A fresh link for each member of the stack that signs pages in by link. */
export function signInLinksOf(record: RunRecord): SignInLink[] {
  const secret = signInSecretOf(record);
  if (!secret) return [];
  return signInMembersOf(record.members ?? {}).map(({ member, app, open }) => ({
    member,
    link: signInLink(app, secret),
    ...(open === undefined ? {} : { open }),
  }));
}

/** Prints each link, and opens it as asked, else on a terminal. */
export function announceSignInLinks(
  links: readonly SignInLink[],
  open: (url: string) => void = openInBrowser,
): void {
  for (const { link, open: asked } of links) {
    console.log(`  ➜  Sign in: ${link}`);
    if (opensBrowser({ asked, isTTY: process.stdout.isTTY })) open(link);
  }
}
