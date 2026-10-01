// Publishes throwaway packages that ship one piece, laid out as `ph build`
// leaves a piece-only package (fixture/package/build, from ph-cli's piece-only fixture).
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { log, run } from "./sh.js";

const FIXTURE = path.resolve(import.meta.dirname, "../../fixture/package");

export interface ProbePackage {
  name: string;
  version: string;
  /** The piece id, `@<name>/piece-probe`. */
  piece: string;
}

export function probePackage(name: string, version: string): ProbePackage {
  return { name, version, piece: `@${name}/piece-probe` };
}

/** The path under `/-/pieces/bundled/` a piece version is served at. */
export function bundleFile(piece: string, version: string): string {
  return `${piece}/${version}.tgz`;
}

function editJson(file: string, edit: (json: Record<string, unknown>) => void) {
  const json = JSON.parse(readFileSync(file, "utf8")) as Record<
    string,
    unknown
  >;
  edit(json);
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}

/** Packs the fixture as `pkg`; returns the tarball path. */
export async function packProbe(pkg: ProbePackage): Promise<string> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "registry-e2e-pkg-"));
  cpSync(FIXTURE, dir, { recursive: true });
  renameSync(path.join(dir, "build"), path.join(dir, "dist"));
  const pieceDir = path.join(dir, "dist/node/pieces/probe");
  editJson(path.join(dir, "package.json"), (json) => {
    json.name = pkg.name;
    json.version = pkg.version;
  });
  editJson(path.join(dir, "dist/powerhouse.manifest.json"), (json) => {
    json.name = pkg.name;
    const [piece] = json.pieces as Record<string, unknown>[];
    piece.id = pkg.piece;
    piece.version = pkg.version;
  });
  for (const file of ["package.json", "descriptor.json"]) {
    editJson(path.join(pieceDir, file), (json) => {
      json.name = pkg.piece;
      json.version = pkg.version;
    });
  }
  const out = path.join(dir, "out");
  mkdirSync(out);
  const packed = await run(
    "npm",
    ["pack", "--pack-destination", out, "--json"],
    {
      cwd: dir,
      env: npmEnv(dir),
    },
  );
  const [{ filename }] = JSON.parse(packed.stdout) as { filename: string }[];
  return path.join(out, filename);
}

// An empty user config so ~/.npmrc tokens and registries stay out of it.
function npmEnv(dir: string): Record<string, string> {
  const userconfig = path.join(dir, ".npmrc-empty");
  writeFileSync(userconfig, "");
  return {
    npm_config_userconfig: userconfig,
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
  };
}

function authKey(registryUrl: string): string {
  const url = new URL(registryUrl);
  const pathname = url.pathname.endsWith("/")
    ? url.pathname
    : `${url.pathname}/`;
  return `//${url.host}${pathname}:_authToken`;
}

export interface PublishRecord {
  name: string;
  version: string;
  registryUrl: string;
  startedAt: number;
  finishedAt: number;
  ok: boolean;
  output: string;
}

let publishLog: string | undefined;

/** Every publish and unpublish is appended here as a JSON line. */
export function setPublishLog(file: string): void {
  publishLog = file;
}

function record(entry: object): void {
  if (publishLog) appendFileSync(publishLog, `${JSON.stringify(entry)}\n`);
}

export async function publishProbe(
  pkg: ProbePackage,
  registryUrl: string,
  token: string | undefined,
): Promise<PublishRecord> {
  const tgz = await packProbe(pkg);
  const dir = path.dirname(path.dirname(tgz));
  const args = ["publish", tgz, "--registry", registryUrl, "--tag", "latest"];
  if (token) args.push(`--${authKey(registryUrl)}=${token}`);
  const startedAt = Date.now();
  const result = await run("npm", args, {
    cwd: dir,
    env: npmEnv(dir),
    allowFailure: true,
  });
  const finishedAt = Date.now();
  const entry: PublishRecord = {
    name: pkg.name,
    version: pkg.version,
    registryUrl,
    startedAt,
    finishedAt,
    ok: result.code === 0,
    output: (result.stderr || result.stdout).trim().slice(-600),
  };
  record({ action: "publish", ...entry });
  log(
    `publish ${pkg.name}@${pkg.version} -> ${registryUrl}: ${entry.ok ? "ok" : "FAILED"} ` +
      `(${finishedAt - startedAt} ms, done ${new Date(finishedAt).toISOString()})`,
  );
  if (!entry.ok) log(entry.output);
  return entry;
}

/** `npm unpublish <name> --force`, as `ph unpublish <name>` runs it. */
export async function unpublishAll(
  name: string,
  registryUrl: string,
  token: string,
): Promise<{ ok: boolean; output: string }> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "registry-e2e-unpub-"));
  const result = await run(
    "npm",
    [
      "unpublish",
      name,
      "--registry",
      registryUrl,
      "--force",
      `--${authKey(registryUrl)}=${token}`,
    ],
    { cwd: dir, env: npmEnv(dir), allowFailure: true },
  );
  const ok = result.code === 0;
  const output = (result.stderr || result.stdout).trim().slice(-600);
  record({
    action: "unpublish",
    name,
    registryUrl,
    at: Date.now(),
    ok,
    output,
  });
  log(`unpublish ${name} from ${registryUrl}: ${ok ? "ok" : "FAILED"}`);
  if (!ok) log(output);
  return { ok, output };
}
