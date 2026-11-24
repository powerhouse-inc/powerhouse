import {
  checkSignInCode,
  LOCAL_SIGN_IN_PARAM,
} from "@powerhousedao/shared/clis/local-sign-in";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCompound } from "../src/compound.js";
import { loadHost } from "../src/host-loader.js";
import { signInLinksOf, signInSecretOf } from "../src/local-sign-in.js";
import { readRunRecord } from "../src/run-record.js";

/**
 * Sign-in by link (F3d) in a compound: the secret made at start reaches the
 * Connect member alone, the record keeps it, and the compound prints a link
 * with a code minted from it, at start and at a second start.
 */

const ZOD_DIR = path.dirname(
  createRequire(import.meta.url).resolve("zod/package.json"),
);

const temporary: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A project whose compound runs a fake switchboard and a fake Connect; the
 * Connect's runner declares `runner.localSignIn` and reports it as asked. */
function makeProject(connect: { signIn: boolean; open?: boolean }) {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-compound-sign-in-"));
  temporary.push(dir);
  writeFileSync(path.join(dir, "powerhouse.config.json"), "{}");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lab", type: "module" }),
  );
  const sink = path.join(dir, "seen.json");
  mkdirSync(path.join(dir, "node_modules"), { recursive: true });
  symlinkSync(ZOD_DIR, path.join(dir, "node_modules", "zod"), "junction");
  const pkg = path.join(dir, "node_modules", "fake-runner");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "fake-runner",
      type: "module",
      exports: { ".": { import: "./index.js", default: "./index.js" } },
    }),
  );
  writeFileSync(
    path.join(pkg, "index.js"),
    `
import { appendFileSync } from "node:fs";
import { z } from "zod";
const sink = ${JSON.stringify(sink)};
export const kind = "reactor";
export const hostSchema = z.looseObject({
  name: z.string(),
  runner: z.looseObject({ module: z.string(), localSignIn: z.unknown().optional() }),
});
export const outputsSchema = z.looseObject({ origin: z.url() });
export async function dev(host, ctx) {
  appendFileSync(sink, JSON.stringify({ name: host.name, secret: ctx.env.PH_LOCAL_SIGN_IN_SECRET ?? null }) + "\\n");
  const shutdown = async () => {};
  if (host.name === "lab-switchboard") {
    return { outputs: { origin: "http://localhost:7064" }, shutdown };
  }
  return {
    outputs: {
      origin: "http://localhost:2064",
      endpoints: { connect: "http://localhost:2064/" },
      ${connect.signIn ? `localSignIn: ${JSON.stringify(connect.open === undefined ? {} : { open: connect.open })},` : ""}
    },
    shutdown,
  };
}
export const run = dev;
`,
  );
  // The switchboard's runner: the same verbs, a schema without the key.
  const switchboardPkg = path.join(dir, "node_modules", "fake-switchboard");
  mkdirSync(switchboardPkg, { recursive: true });
  writeFileSync(
    path.join(switchboardPkg, "package.json"),
    JSON.stringify({
      name: "fake-switchboard",
      type: "module",
      exports: { ".": { import: "./index.js", default: "./index.js" } },
    }),
  );
  writeFileSync(
    path.join(switchboardPkg, "index.js"),
    `export * from "fake-runner";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
`,
  );
  const write = (name: string, source: string) => {
    mkdirSync(path.join(dir, "hosts", name), { recursive: true });
    writeFileSync(path.join(dir, "hosts", name, "host.js"), source);
  };
  write(
    "connect",
    `export default { name: "lab-connect", runner: { module: "fake-runner" } };`,
  );
  write(
    "switchboard",
    `export default { name: "lab-switchboard", runner: { module: "fake-switchboard" } };`,
  );
  write(
    "app",
    `export default {
      name: "app",
      runner: { module: "fake-runner", defaultVerb: "dev" },
      children: {
        "app-switchboard": { host: "switchboard" },
        "app-connect": { host: "connect" },
      },
      config: { runtimeRecord: true, startOrder: ["app-switchboard", "app-connect"] },
    };`,
  );
  const seen = () =>
    existsSync(sink)
      ? readFileSync(sink, "utf8")
          .trim()
          .split("\n")
          .map(
            (line) =>
              JSON.parse(line) as { name: string; secret: string | null },
          )
      : [];
  return { dir, seen };
}

async function start(dir: string, openBrowser: (url: string) => void) {
  const host = (await loadHost(dir, "app")).host;
  return runCompound(
    host,
    { projectRoot: dir, verb: "dev", env: {} },
    { projectName: "lab", installSignalHandlers: false, openBrowser },
  );
}

/** The code in a printed `Sign in:` line, checked against the secret. */
function codeHolds(line: string, secret: string): boolean {
  const link = new URL(line.replace(/^.*Sign in: /, ""));
  const code = new URLSearchParams(link.hash.slice(1)).get(LOCAL_SIGN_IN_PARAM);
  return code !== null && checkSignInCode(secret, code, link.origin).ok;
}

describe("a compound with a Connect that signs in by link", () => {
  it("hands the Connect alone the secret, keeps it in the record, and prints the link", async () => {
    const { dir, seen } = makeProject({ signIn: true });
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(String(line));
    });
    const opened: string[] = [];
    const result = await start(dir, (url) => opened.push(url));
    const record = readRunRecord(dir, "app")!;
    const secret = signInSecretOf(record)!;
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(seen()).toEqual([
      { name: "lab-switchboard", secret: null },
      { name: "lab-connect", secret },
    ]);
    // Never an output: outputs are printed and passed on as tokens.
    expect(JSON.stringify(record.members)).not.toContain(secret);
    const signIn = lines.filter((line) => line.includes("Sign in: "));
    expect(signIn).toHaveLength(1);
    expect(signIn[0]).toMatch(/Sign in: http:\/\/localhost:2064\/#ph-sign-in=/);
    expect(codeHolds(signIn[0]!, secret)).toBe(true);
    // Not on a terminal and not asked: nothing opens.
    expect(opened).toEqual([]);
    await result.shutdown();
  });

  it("opens the link when the Connect was asked to", async () => {
    const { dir } = makeProject({ signIn: true, open: true });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const opened: string[] = [];
    const result = await start(dir, (url) => opened.push(url));
    expect(opened).toHaveLength(1);
    expect(signInLinksOf(readRunRecord(dir, "app")!)).toMatchObject([
      { member: "app-connect", open: true },
    ]);
    await result.shutdown();
  });

  it("prints a fresh link at a second start", async () => {
    const { dir } = makeProject({ signIn: true });
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(String(line));
    });
    const first = await start(dir, () => {});
    const secret = signInSecretOf(readRunRecord(dir, "app"))!;
    const before = lines.filter((line) => line.includes("Sign in: "));
    const second = await start(dir, () => {});
    expect(second.running).toBeDefined();
    const after = lines.filter((line) => line.includes("Sign in: "));
    expect(after).toHaveLength(2);
    expect(after[1]).not.toBe(before[0]);
    expect(codeHolds(after[1]!, secret)).toBe(true);
    await first.shutdown();
  });

  it("keeps no secret when no member signs in by link", async () => {
    const { dir } = makeProject({ signIn: false });
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(String(line));
    });
    const result = await start(dir, () => {});
    expect(signInSecretOf(readRunRecord(dir, "app"))).toBeUndefined();
    expect(lines.some((line) => line.includes("Sign in: "))).toBe(false);
    await result.shutdown();
  });
});
