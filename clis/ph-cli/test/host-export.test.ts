import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hostExportSchema } from "@powerhousedao/host-core/schema";
import { afterEach, describe, expect, it } from "vitest";
import { runHostExport } from "../src/services/host/export.js";

const temporary: string[] = [];
afterEach(() => {
  delete process.env.PH_CALLER_CWD;
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-host-export-"));
  temporary.push(dir);
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lab" }),
  );
  const hosts: Record<string, unknown> = {
    switchboard: {
      name: "lab-switchboard",
      runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
      reactor: { drives: [{ slug: "lab", name: "Lab" }] },
    },
    stack: {
      name: "stack",
      runner: { module: "@powerhousedao/host-core/runners/compound" },
      children: { sb: { host: "switchboard" } },
    },
  };
  for (const [name, host] of Object.entries(hosts)) {
    mkdirSync(path.join(dir, "hosts", name), { recursive: true });
    writeFileSync(
      path.join(dir, "hosts", name, "host.js"),
      `export default ${JSON.stringify(host)};`,
    );
  }
  return dir;
}

describe("ph host export", () => {
  it("prints the export on stdout", async () => {
    const dir = makeProject();
    const result = await runHostExport({ host: "stack", projectRoot: dir });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBeUndefined();
    expect(result.stdout).toMatch(/\n$/);
    const parsed = hostExportSchema.parse(JSON.parse(result.stdout ?? ""));
    expect(parsed.project).toEqual({ name: "lab", root: path.resolve(dir) });
    expect(Object.keys(parsed.members)).toEqual(["switchboard"]);
  });

  it("writes --out and leaves stdout empty", async () => {
    const dir = makeProject();
    const out = path.join(dir, "export.json");
    const result = await runHostExport({
      host: "stack",
      projectRoot: dir,
      out,
    });
    expect(result).toEqual({ exitCode: 0 });
    const written: unknown = JSON.parse(readFileSync(out, "utf8"));
    expect(hostExportSchema.safeParse(written).success).toBe(true);
  });

  it("resolves a relative --out against the caller's cwd", async () => {
    const dir = makeProject();
    const caller = path.join(dir, "hosts");
    process.env.PH_CALLER_CWD = caller;
    const result = await runHostExport({
      host: "stack",
      projectRoot: dir,
      out: "stack.json",
    });
    expect(result).toEqual({ exitCode: 0 });
    expect(existsSync(path.join(caller, "stack.json"))).toBe(true);
    expect(existsSync(path.join(dir, "stack.json"))).toBe(false);
  });

  it("fails an unknown host on stderr", async () => {
    const result = await runHostExport({
      host: "nope",
      projectRoot: makeProject(),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBeUndefined();
    expect(result.stderr).toMatch(/Unknown host "nope"/);
  });

  it("fails a write it cannot make", async () => {
    const dir = makeProject();
    const result = await runHostExport({
      host: "stack",
      projectRoot: dir,
      out: path.join(dir, "missing", "export.json"),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBeUndefined();
    expect(result.stderr).toMatch(/^Cannot write /);
  });
});
