import { deriveProjectPorts } from "@powerhousedao/shared/clis/project-ports";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
    JSON.stringify({ studio: { port: 3000 }, reactor: { port: 4001 } }, null, 2),
  );
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify(MCP_BODY, null, 2));
  mkdirSync(join(dir, ".cursor"), { recursive: true });
  writeFileSync(
    join(dir, ".cursor", "mcp.json"),
    JSON.stringify(MCP_BODY, null, 2),
  );
  return dir;
}

describe("applyProjectCustomizations port assignment", () => {
  it("writes the derived ports into the config and both MCP files", async () => {
    const dir = scaffold();

    await applyProjectCustomizations({ name: "my-package", projectDir: dir });

    const expected = deriveProjectPorts("my-package");
    const config = JSON.parse(
      readFileSync(join(dir, "powerhouse.config.json"), "utf8"),
    ) as {
      reactor: { port: number };
      studio: { port: number };
      vetra: { connectPort: number };
    };
    expect(config.reactor.port).toBe(expected.switchboardPort);
    expect(config.studio.port).toBe(expected.studioPort);
    expect(config.vetra.connectPort).toBe(expected.vetraConnectPort);

    for (const rel of [".mcp.json", join(".cursor", "mcp.json")]) {
      const mcp = JSON.parse(readFileSync(join(dir, rel), "utf8")) as {
        mcpServers: Record<string, { url: string }>;
      };
      expect(mcp.mcpServers["reactor-mcp"].url).toBe(
        `http://localhost:${expected.switchboardPort}/mcp`,
      );
    }
  });

  it("keeps the remote-drive coordinates alongside the assigned port", async () => {
    const dir = scaffold();
    const remoteDrive = "http://example.test/d/vetra-abc";

    await applyProjectCustomizations({
      name: "my-package",
      projectDir: dir,
      remoteDrive,
    });

    const config = JSON.parse(
      readFileSync(join(dir, "powerhouse.config.json"), "utf8"),
    ) as { vetra: { connectPort: number; driveId: string; driveUrl: string } };
    expect(config.vetra.driveId).toBe("vetra-abc");
    expect(config.vetra.driveUrl).toBe(remoteDrive);
    expect(config.vetra.connectPort).toBe(
      deriveProjectPorts("my-package").vetraConnectPort,
    );
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
