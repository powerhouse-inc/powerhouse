import {
  addressOfKey,
  askPassword,
  changePseudonymPassword,
  generatePrivateKey,
  identityDataDir,
  type IdentityInfo,
  IDENTITY_KEY_ENV,
  loginPaths,
  pseudonymLabel,
  readActiveIdentity,
  readPseudonym,
} from "@powerhousedao/shared/clis/identity";
import { createOwnerOnlyFile } from "@powerhousedao/shared/clis/owner-only";
import fs from "node:fs";
import path from "node:path";

/**
 * `ph whoami`, `ph logout` and `ph identity`: who acts here, the Renown login
 * in the home folder, the pseudonym when nobody is logged in, and new
 * identities for services (`ph identity new`).
 */

type Print = (line: string) => void;

function keyLine(info: IdentityInfo): string {
  switch (info.source) {
    case "env":
      return `${IDENTITY_KEY_ENV} (never written)`;
    case "data-folder":
      return `${info.file} (this store's own)`;
    default:
      return `${info.file} (copied into this store at its first signature)`;
  }
}

/** What `ph whoami` prints for `info`. */
export function describeIdentity(info: IdentityInfo | undefined): string[] {
  if (!info) {
    return [
      "Nobody yet: no Renown login, and no pseudonym on this computer.",
      "A pseudonym is made, readable by you only, when something must be signed here.",
      "`ph login` logs in with Renown.",
    ];
  }
  if (info.kind === "renown") {
    const login = info.renown!;
    if (login.expired) {
      return [
        `Your Renown login as ${login.label} expired on ${login.expiresAt}.`,
        "Nothing signs with it: run `ph login` again, or `ph logout` to act as your pseudonym.",
      ];
    }
    return [
      `Logged in with Renown as ${login.label}`,
      `  Address:  ${login.address}`,
      ...(login.expiresAt ? [`  Expires:  ${login.expiresAt}`] : []),
      `  Login:    ${login.file}`,
    ];
  }
  return [
    `${info.label} (no Renown login)`,
    `  Address:  ${info.address}`,
    `  Key:      ${keyLine(info)}`,
    `  Password: ${info.encrypted ? "yes" : "no"}`,
    ...(info.differsFromHome
      ? [
          `  Your default pseudonym is ${pseudonymLabel(info.differsFromHome)}; this store keeps its own, which wrote its documents.`,
        ]
      : []),
  ];
}

/** A login `ph login` wrote into the project before 6.4: no longer read. */
export function projectLoginNotice(dataDir: string): string | undefined {
  const file = path.join(dataDir, ".ph", ".renown.json");
  try {
    const stored = JSON.parse(fs.readFileSync(file, "utf8")) as {
      user?: unknown;
    };
    if (!stored.user) return undefined;
  } catch {
    return undefined;
  }
  return `This project holds a login from before 6.4 in ${file}. It is no longer read; the upgrade step withdraws and removes it.`;
}

export async function runWhoami(
  args: { json?: boolean; check?: boolean; renownUrl: string },
  print: Print = console.log,
): Promise<number> {
  const dataDir = identityDataDir();
  let info = readActiveIdentity({ dataDir });
  let checked: "valid" | "withdrawn" | undefined;
  if (args.check && info?.kind === "renown" && !info.renown!.expired) {
    const { homeLoginRenown } = await import("@renown/sdk/identity");
    // Revalidation logs out a login Renown no longer knows.
    const renown = await homeLoginRenown({ baseUrl: args.renownUrl });
    checked = renown.user ? "valid" : "withdrawn";
    info = readActiveIdentity({ dataDir });
  }
  if (args.json) {
    print(
      JSON.stringify(
        { identity: info ?? null, ...(checked ? { renown: checked } : {}) },
        null,
        2,
      ),
    );
    return 0;
  }
  if (checked === "withdrawn") {
    print(
      "Renown no longer knows your login: it was withdrawn or has expired.",
    );
  }
  for (const line of describeIdentity(info)) print(line);
  if (checked === "valid") print("  Renown:   still valid");
  const notice = projectLoginNotice(dataDir);
  if (notice) print(notice);
  return 0;
}

export async function runLogout(
  args: { renownUrl: string },
  print: Print = console.log,
): Promise<number> {
  const paths = loginPaths();
  if (!fs.existsSync(paths.file) && !fs.existsSync(paths.keypair)) {
    print("Not logged in.");
  } else {
    const { logoutHome } = await import("@renown/sdk/identity");
    const { withdraw, removed } = await logoutHome({
      renownUrl: args.renownUrl,
    });
    switch (withdraw.status) {
      case "withdrawn":
        print("Withdrew the login at Renown.");
        break;
      case "not-found":
        print("Renown holds no such login any more.");
        break;
      case "refused": {
        print(
          `Renown did not take this computer's key as proof (${withdraw.reason}).`,
        );
        print(
          `Withdraw it with your wallet at ${withdraw.revokeUrl} (opening it now).`,
        );
        const { openBrowser } = await import("@renown/sdk/node");
        await openBrowser(withdraw.revokeUrl).catch(() => undefined);
        break;
      }
      case "unavailable":
        print(
          `Could not withdraw the login at Renown: ${withdraw.reason}. It lapses ${withdraw.expiresAt ? `on ${withdraw.expiresAt}` : "at its expiry"}.`,
        );
        break;
      case "not-logged-in":
        break;
    }
    for (const file of removed) print(`Deleted ${file}`);
  }
  const now = readActiveIdentity({ dataDir: identityDataDir() });
  print(
    now
      ? `Now acting as ${now.label}.`
      : "Now acting as your pseudonym, made at the first signature.",
  );
  return 0;
}

export async function runIdentityPassword(
  args: { remove?: boolean },
  print: Print = console.log,
): Promise<number> {
  const dataDir = identityDataDir();
  const info = readPseudonym({ dataDir });
  if (info?.source === "env") {
    print(`${IDENTITY_KEY_ENV} is set: that key has no file to protect.`);
    return 1;
  }
  if (!process.stdin.isTTY) {
    print("`ph identity password` asks for passwords: run it in a terminal.");
    return 1;
  }
  let newPassword: string | undefined;
  if (!args.remove) {
    newPassword = await askPassword("New password: ");
    if (!newPassword) {
      print("An empty password: use --remove to remove the password.");
      return 1;
    }
    if ((await askPassword("Repeat it: ")) !== newPassword) {
      print("The two passwords differ; nothing changed.");
      return 1;
    }
  }
  const result = await changePseudonymPassword({
    dataDir,
    unlock: { interactive: true },
    ...(newPassword ? { newPassword } : {}),
  });
  const label = pseudonymLabel(result.address);
  print(
    result.created
      ? `Made your pseudonym ${label}${newPassword ? ", locked with the password" : ""}.`
      : newPassword
        ? `${label} is locked with the new password.`
        : `${label} has no password now: its files are readable by you only.`,
  );
  for (const file of result.written) print(`  wrote ${file}`);
  for (const file of result.missing)
    print(`  not found (moved or deleted): ${file}`);
  return 0;
}

export type IdentityNewIo = {
  /** stdout: the identity, and its key unless it was saved. */
  out: Print;
  /** stderr: what to do with it. */
  err: Print;
  now?: () => Date;
};

/**
 * `ph identity new`: a new Ethereum key for a service, printed as the line
 * the service is given (`PH_IDENTITY_KEY=0x...`) after a comment naming it as
 * `ph whoami` names a pseudonym, which together read as an env file. Nothing
 * is written unless `save` names a file; that file gets the same lines,
 * readable by the OS user only, and an existing file is never overwritten.
 */
export function runIdentityNew(
  args: { label?: string; save?: string; json?: boolean },
  io: IdentityNewIo = {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  },
): number {
  const label = args.label?.replace(/\s+/g, " ").trim() || undefined;
  const key = generatePrivateKey();
  const address = addressOfKey(key);
  const name = pseudonymLabel(address);
  const privateKey = `0x${Buffer.from(key).toString("hex")}`;
  const heading = `# ${name}${label ? ` "${label}"` : ""}: ${address}`;
  const variable = `${IDENTITY_KEY_ENV}=${privateKey}`;
  const identity = { address, name, ...(label ? { label } : {}) };
  const advice = [
    `The service signs its own writes as ${name} when ${IDENTITY_KEY_ENV} is set: no \`ph login\`, no Renown.`,
    `A service that administers a host (installs packages, say) goes into that host's ADMINS=${address}.`,
  ];

  if (!args.save) {
    if (args.json) {
      io.out(
        JSON.stringify(
          { ...identity, env: IDENTITY_KEY_ENV, privateKey },
          null,
          2,
        ),
      );
    } else {
      io.out(heading);
      io.out(variable);
    }
    io.err(
      "Nothing was written. Whoever holds this key signs as this identity: give it to the service as a secret.",
    );
    for (const line of advice) io.err(line);
    return 0;
  }

  const file = path.resolve(args.save);
  const createdAt = (io.now?.() ?? new Date()).toISOString();
  const text = [
    heading,
    `# Made by \`ph identity new\` on ${createdAt}. Whoever holds this key signs as this identity.`,
    variable,
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { created, restricted } = createOwnerOnlyFile(file, text);
  if (!created) {
    io.err(`${file} exists: nothing was written. Name a new file.`);
    return 1;
  }
  if (!restricted) {
    fs.rmSync(file, { force: true });
    io.err(
      `Could not limit ${file} to your user, so the key is not kept there: nothing was written.`,
    );
    return 1;
  }
  if (args.json) {
    io.out(
      JSON.stringify({ ...identity, env: IDENTITY_KEY_ENV, file }, null, 2),
    );
  } else {
    io.out(`${name}${label ? ` "${label}"` : ""}: ${address}`);
    io.out(`Saved its key to ${file}, readable by you only.`);
  }
  io.err(
    `It is an env file: load it into the service's environment (\`node --env-file=${file}\`, \`docker run --env-file ${file}\`).`,
  );
  for (const line of advice) io.err(line);
  return 0;
}
