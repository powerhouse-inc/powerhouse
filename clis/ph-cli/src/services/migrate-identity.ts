import {
  credentialBindingOf,
  writeCredentialWithdrawal,
  type CredentialLike,
} from "@powerhousedao/shared/clis/credential-records";
import {
  identityDataDir,
  identityHome,
  readLoginFile,
  shortAddress,
} from "@powerhousedao/shared/clis/identity";
import { legacyIdentityPaths } from "@powerhousedao/shared/clis/ph-dir";
import type { DelegationCredentialStatus, JwkKeyPair } from "@renown/sdk/node";
import type { LoginFiles, WithdrawResult } from "@renown/sdk/identity";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * `ph migrate`'s identity step (F3e, D3 (6)): what a project kept of
 * identities before Powerhouse 6.4, which 6.4 reads no more, withdrawn,
 * removed or reported. `ph migrate` runs it first, `ph migrate --identity`
 * alone; it moves to the upgrade package with the rest of the migrations.
 *
 * 1. `.ph/.renown.json` with a user: withdrawn at Renown with a bearer of
 *    `.ph/.keypair.json`, kept as a tombstone in `.ph/credentials/withdrawn/`
 *    (the credential with it), deleted. The key stays: it is the
 *    switchboard's own. One `ph login` puts the login in the home folder.
 * 2. `.ph/vetra/agent/`: the same, then the folder goes, its key with it;
 *    both `preview-trusted-keys.json` (`.ph/`, `.ph/vetra/`) go.
 * 3. `.ph/.owner.json`: its address printed, the file deleted, ADMINS named.
 * 4. Dead settings: removed from powerhouse.config.json and `.env`; in the
 *    host files, reported by line.
 * 5. `.ph/.gitignore` written when missing; the `.ph` files git tracks listed.
 * 6. Who administers the host over HTTP, or that nobody is configured to.
 * 7. A 6.3 host's record of the unsigned writes it signed
 *    (`.ph/unsigned-writes/`): summarised once, by code and field, and deleted.
 *
 * Each item acts on what exists, so a second run has nothing to do. A dry run
 * asks Renown nothing and writes nothing. A withdraw Renown refuses, or one
 * whose key is gone, asks Renown's read model whether it still holds the
 * credential: revoked, expired or never held, the item is done as withdrawn;
 * a key gone but in PH_RENOWN_PRIVATE_KEY withdraws with that key. Otherwise
 * the item's files stay, the step says why and where to withdraw by hand
 * (after which a run finishes it), and exits 1; the other items go on.
 *
 * Outside a project (`projectDir` unset, PH_USER_DATA_DIR set) the step acts
 * on the data folder only, never on the current folder's files. It removes
 * nothing that holds the identity home.
 */

type Env = Readonly<Record<string, string | undefined>>;

export type IdentityStepIo = {
  out: (line: string) => void;
  env: Env;
  /**
   * Withdraws a login at Renown, with `keyPair` when its key file is gone;
   * renown's `withdrawLoginAt` by default.
   */
  withdraw?: (
    files: LoginFiles,
    renownUrl: string,
    keyPair?: JwkKeyPair,
  ) => Promise<WithdrawResult>;
  /** Renown's read model on a login's credential; renown's `checkLoginAt` by default. */
  check?: (
    files: LoginFiles,
    renownUrl: string,
  ) => Promise<DelegationCredentialStatus>;
  /** The key in PH_RENOWN_PRIVATE_KEY when it is `did`'s; renown's `envSessionKey` by default. */
  envKey?: (did: string) => Promise<JwkKeyPair | undefined>;
  /** The files git tracks under `dir`, relative to it; `git ls-files` by default. */
  gitTracked?: (dir: string) => string[];
};

export type IdentityStepOptions = {
  /** The Powerhouse project; unset outside one (then PH_USER_DATA_DIR names the data folder). */
  projectDir?: string;
  dryRun: boolean;
  /** The Renown the logins were made at. */
  renownUrl: string;
  /** Why that Renown, as the step says it: the flag, or the default. */
  renownUrlFrom?: string;
};

/** The settings nothing reads since 6.4, in powerhouse.config.json. */
const DEAD_CONFIG_KEYS = [
  "auth.renown.source",
  "auth.ownerClaim",
  "auth.offlineCredentials",
  "auth.resolveIdentity",
] as const;

/** The variables nothing reads since 6.4, in `.env`. */
const DEAD_ENV_VARS = ["RENOWN_SOURCE", "RESOLVE_CALLER_IDENTITY"] as const;

/** What a host file may still set of them, by line. */
const DEAD_HOST_SETTINGS: { pattern: RegExp; what: string }[] = [
  {
    pattern: /\bsource\s*:\s*["'](?:remote|self|kept)["']/,
    what: "auth.renown.source (RENOWN_SOURCE)",
  },
  { pattern: /\bownerClaim\b/, what: "auth.ownerClaim" },
  { pattern: /\bofflineCredentials\b/, what: "auth.offlineCredentials" },
  { pattern: /\bresolveIdentity\b/, what: "auth.resolveIdentity" },
  { pattern: /\bstoragePath\b/, what: "identity.storagePath" },
  { pattern: /\bRENOWN_SOURCE\b/, what: "RENOWN_SOURCE" },
  { pattern: /\bRESOLVE_CALLER_IDENTITY\b/, what: "RESOLVE_CALLER_IDENTITY" },
];

const HOST_FILE = /\.(?:[cm]?js|[cm]?ts|json)$/;

type Step = {
  /** The project; unset outside one, where only the data folder is acted on. */
  projectDir: string | undefined;
  dataDir: string;
  phDir: string;
  dryRun: boolean;
  renownUrl: string;
  renownUrlFrom: string;
  /** Which Renown is asked has been said. */
  renownSaid: boolean;
  io: IdentityStepIo;
  /** Lines to print under the heading. */
  lines: string[];
  acted: number;
  findings: number;
  failed: number;
  /** A login was removed: one `ph login` is asked for at the end. */
  loginRemoved: boolean;
};

const say = (step: Step, line: string) => step.lines.push(`  ${line}`);

const unread = (count: number) =>
  `nothing reads ${count === 1 ? "it" : "them"} since 6.4`;

/** A path as the person reads it: relative to the project (or data folder) when inside it. */
function shown(step: Step, file: string): string {
  const relative = path.relative(step.projectDir ?? step.dataDir, file);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative.replaceAll("\\", "/")
    : file;
}

/** `outer` is `inner` or holds it. */
function holds(outer: string, inner: string): boolean {
  const relative = path.relative(path.resolve(outer), path.resolve(inner));
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

/**
 * Whether `files` may be removed: none holds the identity home (a
 * PH_IDENTITY_HOME set inside `.ph`), which the step never deletes. Says so
 * when not.
 */
function removable(step: Step, files: readonly string[]): boolean {
  const home = identityHome(step.io.env);
  const held = files.find((file) => holds(file, home));
  if (held === undefined) return true;
  step.findings++;
  say(
    step,
    `Kept ${shown(step, held)}: it holds the identity home ${home} (PH_IDENTITY_HOME), which this step never deletes. Point PH_IDENTITY_HOME elsewhere and run \`ph migrate --identity\` again.`,
  );
  return false;
}

function remove(file: string): void {
  fs.rmSync(file, { recursive: true, force: true });
}

/** The stored login's credential, whole, for the tombstone. */
function storedCredential(file: string): CredentialLike | undefined {
  try {
    const stored = JSON.parse(fs.readFileSync(file, "utf8")) as {
      user?: { credential?: CredentialLike };
    };
    return stored.user?.credential;
  } catch {
    return undefined;
  }
}

async function defaultWithdraw(
  files: LoginFiles,
  renownUrl: string,
  keyPair?: JwkKeyPair,
): Promise<WithdrawResult> {
  const { withdrawLoginAt } = await import("@renown/sdk/identity");
  return withdrawLoginAt({ files, renownUrl, ...(keyPair ? { keyPair } : {}) });
}

async function defaultCheck(
  files: LoginFiles,
  renownUrl: string,
): Promise<DelegationCredentialStatus> {
  const { checkLoginAt } = await import("@renown/sdk/identity");
  return checkLoginAt({ files, renownUrl });
}

/** Says once, before the first question to Renown, which Renown it is and why. */
function sayRenown(step: Step): void {
  if (step.renownSaid) return;
  step.renownSaid = true;
  say(
    step,
    `${step.dryRun ? "Would ask" : "Asking"} Renown at ${step.renownUrl} (${step.renownUrlFrom}).`,
  );
}

/** What Renown's read model answered, as a line says it; undefined while it holds it. */
function goneAtRenown(
  step: Step,
  status: DelegationCredentialStatus,
  what: string,
): string | undefined {
  switch (status) {
    case "revoked":
      return `${step.renownUrl} withdrew ${what} already`;
    case "expired":
      return `${step.renownUrl} holds ${what} as expired`;
    case "absent":
      return `${step.renownUrl} never held ${what}`;
    default:
      return undefined;
  }
}

type Login = NonNullable<ReturnType<typeof readLoginFile>>;

/**
 * After a withdraw Renown refused, or one whose key file is gone: Renown's
 * read model, then the key in PH_RENOWN_PRIVATE_KEY. Returns the line that
 * opens the item's "done", or undefined when the item stays (said here).
 */
async function settleFailedWithdraw(
  step: Step,
  o: { what: string; files: LoginFiles; removed: string },
  who: string,
  result: Extract<WithdrawResult, { status: "refused" | "unavailable" }>,
): Promise<string | undefined> {
  const meUrl = new URL("/me", step.renownUrl).href;
  let failure = result;
  const keyMissing = result.status === "unavailable" && result.keyMissing;
  if (result.status === "refused" || keyMissing) {
    const status = await (step.io.check ?? defaultCheck)(
      o.files,
      step.renownUrl,
    );
    const gone = goneAtRenown(step, status, `${o.what} of ${who}`);
    if (gone) return `${gone}, so there was nothing to withdraw`;
  }
  if (keyMissing) {
    const subject = storedCredential(o.files.file)?.credentialSubject?.id;
    const keyPair = subject
      ? await (
          step.io.envKey ??
          (async (did: string) => {
            const { envSessionKey } = await import("@renown/sdk/identity");
            return envSessionKey(did, step.io.env);
          })
        )(subject)
      : undefined;
    if (keyPair) {
      const again = await (step.io.withdraw ?? defaultWithdraw)(
        o.files,
        step.renownUrl,
        keyPair,
      );
      if (again.status === "withdrawn") {
        return `Withdrew ${o.what} of ${who} at ${step.renownUrl} with the key in PH_RENOWN_PRIVATE_KEY, which its credential names`;
      }
      if (again.status === "not-found" || again.status === "not-logged-in") {
        return `${step.renownUrl} holds ${o.what} of ${who} no more, so there was nothing to withdraw`;
      }
      failure = again;
    }
  }
  step.failed++;
  if (failure.status === "refused") {
    say(
      step,
      `Could not withdraw ${o.what} of ${who}: Renown did not take its key as proof (${failure.reason}).`,
    );
    say(
      step,
      `  Withdraw it with your wallet at ${failure.revokeUrl}, then run \`ph migrate --identity\` again: it finds it withdrawn and finishes. ${o.removed} stay until then.`,
    );
    return undefined;
  }
  say(
    step,
    `Could not withdraw ${o.what} of ${who} at ${step.renownUrl}: ${failure.reason}.`,
  );
  say(
    step,
    failure.keyMissing
      ? `  Withdraw it with your wallet at ${meUrl}, then run \`ph migrate --identity\` again: it finds it withdrawn and finishes. ${o.removed} stay until then.`
      : `  Run \`ph migrate --identity\` again, or withdraw it with your wallet at ${meUrl}. ${o.removed} stay until then.`,
  );
  return undefined;
}

/**
 * A login that names no credential: nothing withdraws it by its id. Renown's
 * read model may say it holds none; otherwise its files stay, with the
 * wallet page to withdraw it at.
 */
async function loginWithoutCredential(
  step: Step,
  o: { what: string; files: LoginFiles; removed: string },
  who: string,
): Promise<string | undefined> {
  const subject = storedCredential(o.files.file)?.credentialSubject?.id;
  const meUrl = new URL("/me", step.renownUrl).href;
  if (step.dryRun) {
    say(
      step,
      `${o.what.charAt(0).toUpperCase()}${o.what.slice(1)} of ${who} names no credential: nothing withdraws it by its id. ${subject ? `Would ask Renown's read model whether it still holds it, and keep ${o.removed} while it does.` : `Would keep ${o.removed}.`}`,
    );
    return undefined;
  }
  if (subject) {
    const status = await (step.io.check ?? defaultCheck)(
      o.files,
      step.renownUrl,
    );
    const gone = goneAtRenown(step, status, `${o.what} of ${who}`);
    if (gone) return `${gone}, so there was nothing to withdraw`;
  }
  step.findings++;
  say(
    step,
    `Kept ${o.removed}: ${o.what} of ${who} names no credential, so nothing withdraws it here.`,
  );
  say(
    step,
    subject
      ? `  Withdraw it with your wallet at ${meUrl}, then run \`ph migrate --identity\` again: it finds it withdrawn and deletes ${o.removed}.`
      : `  Withdraw it with your wallet at ${meUrl}, then delete ${o.removed}.`,
  );
  return undefined;
}

/**
 * Items 1 and 2: a login kept in `files`, withdrawn at Renown, then its
 * tombstone written and `removes` deleted. A file with no user in it, or an
 * expired login, is only deleted.
 */
async function withdrawLegacyLogin(
  step: Step,
  o: {
    what: string;
    files: LoginFiles;
    removes: string[];
    /** Said once it is done. */
    kept?: string;
  },
): Promise<void> {
  if (!removable(step, o.removes)) return;
  const login: Login | undefined = readLoginFile(o.files);
  const removed = o.removes.map((file) => shown(step, file)).join(" and ");
  if (!login) {
    step.acted++;
    if (step.dryRun) {
      say(step, `Would delete ${removed}: it holds no login.`);
      return;
    }
    for (const file of o.removes) remove(file);
    say(step, `Deleted ${removed}: it held no login.`);
    return;
  }
  const who = `${login.label === shortAddress(login.address) ? login.address : `${login.label} (${login.address})`}`;
  const expired = login.expired ? `expired on ${login.expiresAt}` : undefined;
  const tombstone = shown(
    step,
    path.join(step.dataDir, ".ph", "credentials", "withdrawn"),
  );
  const what = `${o.what.charAt(0).toUpperCase()}${o.what.slice(1)}`;
  const item = { what: o.what, files: o.files, removed };
  if (!expired) sayRenown(step);
  if (step.dryRun) {
    step.acted++;
    if (expired) {
      say(
        step,
        `Would delete ${removed}: ${o.what} of ${who} ${expired}, so there is nothing to withdraw.`,
      );
    } else if (!login.credentialId) {
      await loginWithoutCredential(step, item, who);
      return;
    } else {
      say(
        step,
        `Would withdraw ${o.what} of ${who} at ${step.renownUrl} with a bearer of ${shown(step, o.files.keypair)}, keep it as a tombstone in ${tombstone}/ and delete ${removed}.`,
      );
    }
    if (o.kept) say(step, `  ${o.kept}`);
    return;
  }
  let heard: string | undefined =
    `${what} of ${who} ${expired}: nothing to withdraw`;
  if (!expired && !login.credentialId) {
    heard = await loginWithoutCredential(step, item, who);
  } else if (!expired) {
    const result = await (step.io.withdraw ?? defaultWithdraw)(
      o.files,
      step.renownUrl,
    );
    switch (result.status) {
      case "withdrawn":
        heard = `Withdrew ${o.what} of ${who} at ${step.renownUrl}`;
        break;
      case "not-found":
      case "not-logged-in":
        heard = `${step.renownUrl} holds ${o.what} of ${who} no more, so there was nothing to withdraw`;
        break;
      default:
        heard = await settleFailedWithdraw(step, item, who, result);
    }
  }
  if (heard === undefined) return;
  const credential = storedCredential(o.files.file);
  const binding = credential ? credentialBindingOf(credential) : undefined;
  if (credential && binding) {
    writeCredentialWithdrawal({
      dataDir: step.dataDir,
      binding,
      by: "command",
      label: credential.credentialSubject.app,
      credentialId: credential.id,
      ...(credential.expirationDate
        ? { expiresAt: credential.expirationDate }
        : {}),
      credential,
    });
  }
  for (const file of o.removes) remove(file);
  step.acted++;
  step.loginRemoved = true;
  say(
    step,
    `${heard}; ${credential && binding ? `kept its credential as a tombstone in ${tombstone}/ and ` : ""}deleted ${removed}.`,
  );
  if (o.kept) say(step, `  ${o.kept}`);
}

/** Item 1: the project's login. */
async function projectLogin(step: Step): Promise<void> {
  const { projectLogin: files } = legacyIdentityPaths(step.phDir);
  if (!fs.existsSync(files.file)) return;
  await withdrawLegacyLogin(step, {
    what: "the project's Renown login",
    files,
    removes: [files.file],
    ...(fs.existsSync(files.keypair)
      ? {
          kept: `${shown(step, files.keypair)} stays: it is this project's switchboard key, which signs the host's own work.`,
        }
      : {}),
  });
}

/** Item 2: Studio's agent login, and the preview's trusted keys. */
async function agentLogin(step: Step): Promise<void> {
  const legacy = legacyIdentityPaths(step.phDir);
  if (fs.existsSync(legacy.agentLogin.file)) {
    await withdrawLegacyLogin(step, {
      what: "Studio's agent login",
      files: legacy.agentLogin,
      removes: [legacy.agent],
    });
  } else if (fs.existsSync(legacy.agent) && removable(step, [legacy.agent])) {
    step.acted++;
    if (step.dryRun) {
      say(
        step,
        `Would delete ${shown(step, legacy.agent)}: Studio's agent signs as its own session now.`,
      );
    } else {
      remove(legacy.agent);
      say(
        step,
        `Deleted ${shown(step, legacy.agent)}: Studio's agent signs as its own session now.`,
      );
    }
  }
  const trusted = legacy.trustedKeys.filter((file) => fs.existsSync(file));
  if (trusted.length > 0 && removable(step, trusted)) {
    step.acted++;
    const files = trusted.map((file) => shown(step, file)).join(" and ");
    if (step.dryRun) {
      say(step, `Would delete ${files}: ${unread(trusted.length)}.`);
    } else {
      for (const file of trusted) remove(file);
      say(step, `Deleted ${files}: ${unread(trusted.length)}.`);
    }
  }
}

/** Item 3: the owner claim. */
function ownerClaim(step: Step): void {
  const file = legacyIdentityPaths(step.phDir).owner;
  if (!fs.existsSync(file) || !removable(step, [file])) return;
  let owner: string | undefined;
  try {
    const value = (
      JSON.parse(fs.readFileSync(file, "utf8")) as { owner?: unknown }
    ).owner;
    if (typeof value === "string" && value) owner = value;
  } catch {
    // An unreadable claim names nobody.
  }
  step.acted++;
  const named = owner
    ? `it made ${owner} this host's owner, and 6.4 reads no owner claim`
    : "6.4 reads no owner claim";
  if (step.dryRun) {
    say(step, `Would delete ${shown(step, file)}: ${named}.`);
  } else {
    remove(file);
    say(step, `Deleted ${shown(step, file)}: ${named}.`);
  }
  say(
    step,
    `  Whoever runs the host on this computer administers it; for a deployment set ADMINS=${owner ?? "<address>"}.`,
  );
}

function dropKey(config: Record<string, unknown>, dotted: string): boolean {
  const parts = dotted.split(".");
  let cursor: unknown = config;
  for (const part of parts.slice(0, -1)) {
    if (cursor === null || typeof cursor !== "object") return false;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  const last = parts.at(-1)!;
  if (
    cursor === null ||
    typeof cursor !== "object" ||
    !(last in (cursor as Record<string, unknown>))
  ) {
    return false;
  }
  delete (cursor as Record<string, unknown>)[last];
  return true;
}

function hostFiles(dir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : hostFiles(at);
    }
    return entry.isFile() && HOST_FILE.test(entry.name) ? [at] : [];
  });
}

/**
 * `value` as JSON in the layout of `text`, the file it was read from: the
 * same indentation (its first indented line's; none for a file on one line),
 * line ends and final newline.
 */
export function jsonLike(text: string, value: unknown): string {
  const lines = text.trim().includes("\n");
  const indent = lines ? (/\n([ \t]+)\S/.exec(text)?.[1] ?? "  ") : "";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const body = JSON.stringify(value, null, indent).replaceAll("\n", eol);
  return /\r?\n$/.test(text) ? `${body}${eol}` : body;
}

/** Item 4: the settings nothing reads since 6.4. */
function deadSettings(step: Step): void {
  if (step.projectDir === undefined) return;
  const configFile = path.join(step.projectDir, "powerhouse.config.json");
  if (fs.existsSync(configFile)) {
    const text = fs.readFileSync(configFile, "utf8");
    let config: Record<string, unknown> | undefined;
    try {
      config = JSON.parse(text) as Record<string, unknown>;
    } catch {
      say(
        step,
        `${shown(step, configFile)} is no JSON: its settings were not checked.`,
      );
      step.findings++;
    }
    if (config) {
      const dropped = DEAD_CONFIG_KEYS.filter((key) => dropKey(config, key));
      if (dropped.length > 0) {
        step.acted++;
        const keys = dropped.map((key) => `"${key}"`).join(", ");
        if (step.dryRun) {
          say(
            step,
            `Would remove ${keys} from ${shown(step, configFile)}: ${unread(dropped.length)}.`,
          );
        } else {
          fs.writeFileSync(configFile, jsonLike(text, config));
          say(
            step,
            `Removed ${keys} from ${shown(step, configFile)}: ${unread(dropped.length)}.`,
          );
        }
      }
    }
  }

  const envFile = path.join(step.projectDir, ".env");
  if (fs.existsSync(envFile)) {
    const text = fs.readFileSync(envFile, "utf8");
    const lines = text.split(/(?<=\n)/);
    const dead = new RegExp(
      `^\\s*(?:export\\s+)?(${DEAD_ENV_VARS.join("|")})\\s*=`,
    );
    const found = lines
      .map((line) => dead.exec(line)?.[1])
      .filter((name): name is string => name !== undefined);
    if (found.length > 0) {
      step.acted++;
      const unique = [...new Set(found)];
      const names = unique.join(", ");
      if (step.dryRun) {
        say(
          step,
          `Would remove ${names} from ${shown(step, envFile)}: ${unread(unique.length)}.`,
        );
      } else {
        fs.writeFileSync(
          envFile,
          lines.filter((line) => !dead.test(line)).join(""),
        );
        say(
          step,
          `Removed ${names} from ${shown(step, envFile)}: ${unread(unique.length)}.`,
        );
      }
    }
  }

  for (const file of hostFiles(path.join(step.projectDir, "hosts"))) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const { pattern, what } of DEAD_HOST_SETTINGS) {
        if (!pattern.test(line)) continue;
        step.findings++;
        say(
          step,
          `${shown(step, file)}:${index + 1}: ${what} is no longer read; remove it.`,
        );
        break;
      }
    });
  }
}

function defaultGitTracked(dir: string): string[] {
  try {
    return execFileSync("git", ["ls-files", "-z", "--", "."], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    })
      .split("\0")
      .filter(Boolean);
  } catch {
    // Not in a git repository, or no git: nothing is tracked.
    return [];
  }
}

/** Item 5: `.ph` out of git. */
function gitIgnore(step: Step): void {
  if (!fs.existsSync(step.phDir)) return;
  const ignore = path.join(step.phDir, ".gitignore");
  if (!fs.existsSync(ignore)) {
    step.acted++;
    if (step.dryRun) {
      say(
        step,
        `Would write ${shown(step, ignore)} ("*"): .ph holds keys and stores, which stay out of git.`,
      );
    } else {
      fs.writeFileSync(ignore, "*\n");
      say(
        step,
        `Wrote ${shown(step, ignore)} ("*"): .ph holds keys and stores, which stay out of git.`,
      );
    }
  }
  const tracked = (step.io.gitTracked ?? defaultGitTracked)(step.phDir).filter(
    (file) => file !== ".gitignore",
  );
  if (tracked.length > 0) {
    step.findings++;
    const listed = tracked.slice(0, 10).join(", ");
    say(
      step,
      `git tracks ${tracked.length} file(s) in ${shown(step, step.phDir)}, which holds keys and stores: ${listed}${tracked.length > 10 ? ", ..." : ""}.`,
    );
    say(
      step,
      `  Untrack them (\`git rm -r --cached ${shown(step, step.phDir)}\`); a key once committed should be replaced.`,
    );
  }
}

type RecordEntry = {
  reason?: unknown;
  field?: unknown;
  count?: unknown;
};

/** Item 7: a 6.3 host's record of the unsigned writes it signed. */
function unsignedWrites(step: Step): void {
  const dir = legacyIdentityPaths(step.phDir).unsignedWrites;
  if (!fs.existsSync(dir) || !removable(step, [dir])) return;
  const totals = new Map<
    string,
    { reason: string; field: string; count: number }
  >();
  let files = 0;
  let unreadable = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    files++;
    let entries: RecordEntry[];
    try {
      const record = JSON.parse(
        fs.readFileSync(path.join(dir, name), "utf8"),
      ) as { entries?: unknown };
      entries = Array.isArray(record.entries)
        ? (record.entries as RecordEntry[])
        : [];
    } catch {
      unreadable++;
      continue;
    }
    for (const entry of entries) {
      const reason = typeof entry.reason === "string" ? entry.reason : "?";
      const field = typeof entry.field === "string" ? entry.field : "?";
      const count =
        typeof entry.count === "number" && entry.count > 0 ? entry.count : 1;
      const key = `${reason}\u0000${field}`;
      const held = totals.get(key) ?? { reason, field, count: 0 };
      held.count += count;
      totals.set(key, held);
    }
  }
  step.acted++;
  const rows = [...totals.values()].sort(
    (a, b) =>
      a.reason.localeCompare(b.reason) ||
      b.count - a.count ||
      a.field.localeCompare(b.field),
  );
  say(
    step,
    `${shown(step, dir)}: a 6.3 host recorded ${rows.reduce((sum, row) => sum + row.count, 0)} unsigned write(s) in ${files} file(s), which 6.4 refuses:`,
  );
  const reasonWidth = Math.max(0, ...rows.map((row) => row.reason.length));
  const fieldWidth = Math.max(0, ...rows.map((row) => row.field.length));
  for (const row of rows) {
    say(
      step,
      `  ${row.reason.padEnd(reasonWidth)}  ${row.field.padEnd(fieldWidth)}  ${row.count}`,
    );
  }
  if (unreadable > 0) say(step, `  (${unreadable} file(s) could not be read.)`);
  say(
    step,
    "  Each caller signs its writes now: a Powerhouse client does it, scripts use `ph mutate`, tools a host session token (`ph token create`).",
  );
  if (step.dryRun) {
    say(step, `Would delete ${shown(step, dir)}.`);
  } else {
    remove(dir);
    say(step, `Deleted ${shown(step, dir)}.`);
  }
}

function envValue(file: string, name: string): string | undefined {
  try {
    const text = fs.readFileSync(file, "utf8");
    const match = new RegExp(
      `^\\s*(?:export\\s+)?${name}\\s*=\\s*["']?([^"'\\r\\n#]*)`,
      "m",
    ).exec(text);
    return match?.[1]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Item 6: who administers the host over HTTP. */
function administration(step: Step): string {
  const configured: { from: string; admins: string[] }[] = [];
  const split = (value: string | undefined) =>
    (value ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
  const fromEnv = split(step.io.env.ADMINS);
  if (fromEnv.length > 0) configured.push({ from: "ADMINS", admins: fromEnv });
  const projectDir = step.projectDir;
  if (projectDir !== undefined) {
    const envFile = path.join(projectDir, ".env");
    const fromFile = split(envValue(envFile, "ADMINS"));
    if (fromFile.length > 0) {
      configured.push({
        from: `ADMINS in ${shown(step, envFile)}`,
        admins: fromFile,
      });
    }
    try {
      const config = JSON.parse(
        fs.readFileSync(
          path.join(projectDir, "powerhouse.config.json"),
          "utf8",
        ),
      ) as { auth?: { admins?: unknown } };
      const listed = config.auth?.admins;
      const admins = Array.isArray(listed)
        ? listed.filter(
            (a: unknown): a is string => typeof a === "string" && a !== "",
          )
        : [];
      if (admins.length > 0) {
        configured.push({
          from: "auth.admins in powerhouse.config.json",
          admins,
        });
      }
    } catch {
      // No config, or none readable: nothing configured there.
    }
  }
  if (configured.length === 0) {
    return "No administrator configured for deployments: on this computer whoever runs the host (`ph dev`, `ph run`) administers it; a deployment needs ADMINS=<address> (`ph whoami` shows yours).";
  }
  return `Administered over HTTP by ${configured.map((c) => `${c.from}: ${c.admins.join(", ")}`).join("; ")}, and by whoever runs the host.`;
}

/** Runs the step and prints it; 1 when a withdraw failed, else 0. */
export async function migrateIdentity(
  options: IdentityStepOptions,
  io: IdentityStepIo = { out: (line) => console.log(line), env: process.env },
): Promise<number> {
  const projectDir =
    options.projectDir === undefined
      ? undefined
      : path.resolve(options.projectDir);
  if (projectDir === undefined && !io.env.PH_USER_DATA_DIR) {
    throw new Error(
      "The identity step acts on a project: run it in one, or set PH_USER_DATA_DIR to the data folder.",
    );
  }
  const dataDir = identityDataDir(projectDir, io.env);
  const step: Step = {
    projectDir,
    dataDir,
    phDir: path.join(dataDir, ".ph"),
    dryRun: options.dryRun,
    renownUrl: options.renownUrl,
    renownUrlFrom:
      options.renownUrlFrom ??
      "the default, where `ph login` logged in before 6.4; `--renown-url` names another",
    renownSaid: false,
    io,
    lines: [],
    acted: 0,
    findings: 0,
    failed: 0,
    loginRemoved: false,
  };
  await projectLogin(step);
  await agentLogin(step);
  ownerClaim(step);
  deadSettings(step);
  gitIgnore(step);
  unsignedWrites(step);
  if (step.loginRemoved) {
    say(
      step,
      "Run `ph login` once: a Renown login lives in your home folder now, for every project.",
    );
  }

  const heading = step.dryRun
    ? "Identity step (dry run: nothing is asked of Renown and nothing is written):"
    : "Identity step:";
  if (step.acted === 0 && step.findings === 0) {
    io.out(`${heading} nothing to do.`);
  } else {
    io.out(heading);
    for (const line of step.lines) io.out(line);
  }
  io.out(`  ${administration(step)}`);
  return step.failed > 0 ? 1 : 0;
}
