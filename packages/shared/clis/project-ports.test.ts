import { describe, expect, it } from "vitest";
import { deriveProjectPorts } from "./project-ports.js";

describe("deriveProjectPorts", () => {
  it("is deterministic for a given name", () => {
    expect(deriveProjectPorts("my-package")).toEqual(
      deriveProjectPorts("my-package"),
    );
  });

  it("lands each port in its band", () => {
    const ports = deriveProjectPorts("my-package");
    expect(ports.switchboardPort).toBeGreaterThanOrEqual(41000);
    expect(ports.switchboardPort).toBeLessThan(42000);
    expect(ports.studioPort).toBeGreaterThanOrEqual(31000);
    expect(ports.studioPort).toBeLessThan(32000);
    expect(ports.vetraConnectPort).toBeGreaterThanOrEqual(32000);
    expect(ports.vetraConnectPort).toBeLessThan(33000);
  });

  it("never returns two identical ports", () => {
    const ports = deriveProjectPorts("my-package");
    expect(new Set(Object.values(ports)).size).toBe(3);
  });

  it("spreads realistic project names across distinct offsets", () => {
    const names = [
      "todo-demo",
      "billing-models",
      "@acme/contracts",
      "vetra-playground",
      "powerhouse-atlas",
      "my-package",
      "invoice-suite",
      "chatroom",
    ];
    const assigned = new Set(
      names.map((name) => deriveProjectPorts(name).switchboardPort),
    );
    expect(assigned.size).toBe(names.length);
  });

  it("rejects an empty name", () => {
    expect(() => deriveProjectPorts("")).toThrow(/project name/i);
    expect(() => deriveProjectPorts("   ")).toThrow(/project name/i);
  });
});
