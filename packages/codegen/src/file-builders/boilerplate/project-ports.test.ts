import { deriveProjectPorts } from "@powerhousedao/shared/clis/project-ports";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPowerhouseConfigTemplate } from "templates";
import { applyProjectCustomizations } from "./generated-project-files.js";

const MCP_BODY = {
  mcpServers: {
    "reactor-mcp": { type: "http", url: "http://localhost:4001/mcp" },
  },
};

function scaffold(): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-ports-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "placeholder" }, null, 2),
  );
  writeFileSync(
    join(dir, "powerhouse.config.json"),
    JSON.stringify(
      { studio: { port: 3000 }, reactor: { port: 4001 } },
      null,
      2,
    ),
  );
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify(MCP_BODY, null, 2));
  for (const rel of [
    join(".cursor", "mcp.json"),
    join(".gemini", "settings.json"),
  ]) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), JSON.stringify(MCP_BODY, null, 2));
  }
  return dir;
}

describe("applyProjectCustomizations port assignment", () => {
  it("writes the derived ports and points every MCP file at the launcher", async () => {
    const dir = scaffold();

    await applyProjectCustomizations({ name: "my-package", projectDir: dir });

    const expected = deriveProjectPorts("my-package");
    const config = JSON.parse(
      readFileSync(join(dir, "powerhouse.config.json"), "utf8"),
    ) as {
      reactor: { port: number };
      studio: { port: number };
    };
    expect(config.reactor.port).toBe(expected.switchboardPort);
    expect(config.studio.port).toBe(expected.studioPort);
    expect(config).not.toHaveProperty("vetra");

    for (const rel of [
      ".mcp.json",
      join(".cursor", "mcp.json"),
      join(".gemini", "settings.json"),
    ]) {
      const mcp = JSON.parse(readFileSync(join(dir, rel), "utf8")) as {
        mcpServers: Record<string, { command?: string; url?: string }>;
      };
      expect(mcp.mcpServers["reactor-mcp"].command).toBe("node");
      expect(mcp.mcpServers["reactor-mcp"].url).toBeUndefined();
    }
  });

  it("writes the remote-drive url, and no port beside it", async () => {
    const dir = scaffold();
    const remoteDrive = "http://example.test/d/vetra-abc";

    await applyProjectCustomizations({
      name: "my-package",
      projectDir: dir,
      remoteDrive,
    });

    const config = JSON.parse(
      readFileSync(join(dir, "powerhouse.config.json"), "utf8"),
    ) as { vetra: unknown };
    expect(config.vetra).toEqual({ driveUrl: remoteDrive });
  });

  it("gives a cloned project with hosts/vetra a Connect port for that host", async () => {
    const dir = scaffold();
    mkdirSync(join(dir, "hosts", "vetra"), { recursive: true });
    writeFileSync(
      join(dir, "hosts", "vetra", "host.js"),
      "export default {};\n",
    );

    await applyProjectCustomizations({ name: "my-package", projectDir: dir });

    const config = JSON.parse(
      readFileSync(join(dir, "powerhouse.config.json"), "utf8"),
    ) as { vetra: unknown };
    expect(config.vetra).toEqual({
      connectPort: deriveProjectPorts("my-package").vetraConnectPort,
    });
  });

  it("gives two differently named projects different ports", async () => {
    const a = scaffold();
    const b = scaffold();
    await applyProjectCustomizations({ name: "project-a", projectDir: a });
    await applyProjectCustomizations({ name: "project-b", projectDir: b });

    const portOf = (dir: string) =>
      (
        JSON.parse(
          readFileSync(join(dir, "powerhouse.config.json"), "utf8"),
        ) as { reactor: { port: number } }
      ).reactor.port;

    expect(portOf(a)).not.toBe(portOf(b));
  });
});

describe("buildPowerhouseConfigTemplate", () => {
  it("emits the project's derived ports on the fresh-scaffold path", async () => {
    const raw = await buildPowerhouseConfigTemplate({ name: "my-package" });
    const config = JSON.parse(raw) as {
      studio: { port: number };
      reactor: { port: number };
    };
    const expected = deriveProjectPorts("my-package");
    expect(config.reactor.port).toBe(expected.switchboardPort);
    expect(config.studio.port).toBe(expected.studioPort);
    expect(config).not.toHaveProperty("vetra");
  });

  it("emits the remote drive url, and no port beside it", async () => {
    const raw = await buildPowerhouseConfigTemplate({
      name: "my-package",
      remoteDrive: "http://example.test/d/vetra-abc",
    });
    const config = JSON.parse(raw) as { vetra: unknown };
    expect(config.vetra).toEqual({
      driveUrl: "http://example.test/d/vetra-abc",
    });
  });
});
