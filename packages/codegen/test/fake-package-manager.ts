import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

const REPOSITORY = resolve(import.meta.dirname, "..", "..", "..");
const REACTOR_API = join(REPOSITORY, "packages", "reactor-api");

export const REACTOR_API_INSTALL: Readonly<Record<string, string>> = {
  "@powerhousedao/reactor-api": REACTOR_API,
  "@powerhousedao/shared": join(REPOSITORY, "packages", "shared"),
  graphql: realpathSync(join(REACTOR_API, "node_modules", "graphql")),
  pg: realpathSync(join(REACTOR_API, "node_modules", "pg")),
};

export type FakeInstall = {
  readonly command: string;
  readonly args: readonly string[];
  readonly reactorApiBefore: boolean;
  readonly stdin?: string;
  readonly cwd?: string;
};

const SCRIPT = `#!/usr/bin/env node
const { appendFileSync, existsSync, mkdirSync, symlinkSync, readFileSync, writeFileSync } = require("node:fs");
const { basename, dirname, join } = require("node:path");
const modules = join(process.cwd(), "node_modules");
appendFileSync(process.env.PH_FAKE_INSTALL_LOG, JSON.stringify({
  command: basename(process.argv[1]),
  args: process.argv.slice(2),
  cwd: process.env.PH_FAKE_INSTALL_RECORD_CWD === "true" ? process.cwd() : undefined,
  stdin: process.env.PH_FAKE_INSTALL_READ_STDIN === "true" ? readFileSync(0, "utf8") : undefined,
  reactorApiBefore: existsSync(join(modules, "@powerhousedao", "reactor-api")),
}) + "\\n");
if (process.env.PH_FAKE_INSTALL_FAIL_ONCE && !existsSync(process.env.PH_FAKE_INSTALL_FAIL_ONCE)) {
  writeFileSync(process.env.PH_FAKE_INSTALL_FAIL_ONCE, "failed\\n");
  process.exit(17);
}
if (process.env.PH_FAKE_INSTALL_EVENTS) {
  appendFileSync(process.env.PH_FAKE_INSTALL_EVENTS, "start\\n");
  setTimeout(() => appendFileSync(process.env.PH_FAKE_INSTALL_EVENTS, "end\\n"), 100);
}
for (const [name, target] of Object.entries(JSON.parse(process.env.PH_FAKE_INSTALL_LINKS))) {
  const link = join(modules, name);
  if (existsSync(link)) continue;
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(target, link);
}
if (process.env.PH_FAKE_INSTALL_SUCCESS) appendFileSync(process.env.PH_FAKE_INSTALL_SUCCESS, "complete\\n");
`;

export function useFakePackageManager(
  links: Readonly<Record<string, string>> = REACTOR_API_INSTALL,
  {
    recordStdin = false,
    recordCwd = false,
  }: { readonly recordStdin?: boolean; readonly recordCwd?: boolean } = {},
): { readonly calls: () => FakeInstall[]; readonly restore: () => void } {
  const bin = mkdtempSync(join(tmpdir(), "ph-fake-package-manager-"));
  for (const command of ["npm", "pnpm"]) {
    writeFileSync(join(bin, command), SCRIPT);
    chmodSync(join(bin, command), 0o755);
  }
  const log = join(bin, "calls.jsonl");
  writeFileSync(log, "");
  const saved = {
    PATH: process.env.PATH,
    PH_FAKE_INSTALL_LOG: process.env.PH_FAKE_INSTALL_LOG,
    PH_FAKE_INSTALL_LINKS: process.env.PH_FAKE_INSTALL_LINKS,
    PH_FAKE_INSTALL_READ_STDIN: process.env.PH_FAKE_INSTALL_READ_STDIN,
    PH_FAKE_INSTALL_RECORD_CWD: process.env.PH_FAKE_INSTALL_RECORD_CWD,
  };
  process.env.PATH = `${bin}${delimiter}${process.env.PATH ?? ""}`;
  process.env.PH_FAKE_INSTALL_LOG = log;
  process.env.PH_FAKE_INSTALL_LINKS = JSON.stringify(links);
  process.env.PH_FAKE_INSTALL_READ_STDIN = String(recordStdin);
  process.env.PH_FAKE_INSTALL_RECORD_CWD = String(recordCwd);
  return {
    calls: () =>
      existsSync(log)
        ? readFileSync(log, "utf8")
            .split("\n")
            .filter((line) => line !== "")
            .map((line) => JSON.parse(line) as FakeInstall)
        : [],
    restore: () => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(bin, { recursive: true, force: true });
    },
  };
}
