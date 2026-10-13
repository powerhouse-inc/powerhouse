import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeGeneratedHostsFiles } from "./generated-project-files.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-hosts-scaffold-"));
  temporary.push(dir);
  return dir;
}

describe("writeGeneratedHostsFiles", () => {
  it("scaffolds hosts/ and the agents/ stub on a fresh project", async () => {
    const dir = makeTempProject();
    await writeGeneratedHostsFiles(dir, "my-project");

    for (const file of [
      "hosts/README.md",
      "hosts/connect/host.js",
      "hosts/switchboard/host.js",
      "hosts/vetra/host.js",
      "agents/index.ts",
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }

    const connect = readFileSync(join(dir, "hosts/connect/host.js"), "utf-8");
    expect(connect).toContain(`name: "my-project-connect"`);
    expect(connect).toContain("@powerhousedao/ph-cli/runners/connect");
    // ports are REFERENCED from powerhouse.config.json, never copied:
    expect(connect).toContain("config.studio?.port");
    expect(connect).toContain(
      `import config from "../../powerhouse.config.json" with { type: "json" }`,
    );

    const vetra = readFileSync(join(dir, "hosts/vetra/host.js"), "utf-8");
    expect(vetra).toContain(`defaultVerb: "dev"`);
    expect(vetra).toContain(`host: "connect"`);
    expect(vetra).toContain("config.vetra?.connectPort");

    // P2.8: single-sourced protocol — the switchboard host references the
    // SAME connect.reactor block the connect host receives via its config.
    const switchboard = readFileSync(
      join(dir, "hosts/switchboard/host.js"),
      "utf-8",
    );
    expect(switchboard).toContain("protocol: config.connect?.reactor ?? {}");
    expect(connect).toContain(`appId: "inc.powerhouse.connect.my-project"`);
  });

  it("is preserve-on-migrate: never clobbers an existing host file", async () => {
    const dir = makeTempProject();
    await writeGeneratedHostsFiles(dir, "my-project");
    const file = join(dir, "hosts/connect/host.js");
    writeFileSync(file, "// user-owned edit\nexport default {};\n");

    await writeGeneratedHostsFiles(dir, "my-project");
    expect(readFileSync(file, "utf-8")).toContain("user-owned edit");
    // ...while still seeding files the project lacks:
    rmSync(join(dir, "hosts/vetra/host.js"));
    await writeGeneratedHostsFiles(dir, "my-project");
    expect(existsSync(join(dir, "hosts/vetra/host.js"))).toBe(true);
  });
});
