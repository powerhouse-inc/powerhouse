import { describe, expect, it } from "vitest";
import {
  PROJECT_PORT_BAND_SIZE,
  PROJECT_PORT_BAND_STUDIO,
  PROJECT_PORT_BAND_SWITCHBOARD,
  PROJECT_PORT_BAND_VETRA_CONNECT,
} from "./constants.js";
import {
  deriveProjectPorts,
  PROJECT_PORT_DENYLIST,
  projectPortBands,
} from "./project-ports.js";

// A corpus wide enough to exercise the offset space rather than one lucky name.
const NAMES = [
  "todo-demo",
  "billing-models",
  "@acme/contracts",
  "vetra-playground",
  "powerhouse-atlas",
  "my-package",
  "invoice-suite",
  "chatroom",
  "test-project",
  "project-a",
  "project-b",
  ...Array.from({ length: 2000 }, (_, i) => `generated-project-${i}`),
];

const allPorts = (name: string) => Object.values(deriveProjectPorts(name));

describe("deriveProjectPorts", () => {
  it("is deterministic for a given name", () => {
    expect(deriveProjectPorts("my-package")).toEqual(
      deriveProjectPorts("my-package"),
    );
  });

  it("lands each port in its band", () => {
    for (const name of NAMES) {
      const ports = deriveProjectPorts(name);
      expect(ports.switchboardPort).toBeGreaterThanOrEqual(
        PROJECT_PORT_BAND_SWITCHBOARD,
      );
      expect(ports.switchboardPort).toBeLessThan(
        PROJECT_PORT_BAND_SWITCHBOARD + PROJECT_PORT_BAND_SIZE,
      );
      expect(ports.studioPort).toBeGreaterThanOrEqual(PROJECT_PORT_BAND_STUDIO);
      expect(ports.studioPort).toBeLessThan(
        PROJECT_PORT_BAND_STUDIO + PROJECT_PORT_BAND_SIZE,
      );
      expect(ports.vetraConnectPort).toBeGreaterThanOrEqual(
        PROJECT_PORT_BAND_VETRA_CONNECT,
      );
      expect(ports.vetraConnectPort).toBeLessThan(
        PROJECT_PORT_BAND_VETRA_CONNECT + PROJECT_PORT_BAND_SIZE,
      );
    }
  });

  // Regression guard. A listener parked in the OS ephemeral range can lose a
  // race to a transient outbound socket, which would surface as a
  // `--strictPort` failure blaming a project conflict that does not exist.
  // Linux allocates from 32768; macOS and Windows from 49152.
  it("never assigns a port inside the OS ephemeral range", () => {
    for (const name of NAMES) {
      for (const port of allPorts(name)) {
        expect(port).toBeLessThan(32768);
      }
    }
  });

  // ph-clint derives its own per-CLI ports by hashing into 10000-59900.
  // Staying under 10000 keeps the two schemes from ever contending.
  it("never assigns a port inside ph-clint's 10000-59900 range", () => {
    for (const name of NAMES) {
      for (const port of allPorts(name)) {
        expect(port).toBeLessThan(10000);
      }
    }
  });

  it("never assigns a denylisted port", () => {
    for (const name of NAMES) {
      for (const port of allPorts(name)) {
        expect(PROJECT_PORT_DENYLIST.has(port)).toBe(false);
      }
    }
  });

  it("never returns two identical ports", () => {
    for (const name of NAMES) {
      expect(new Set(allPorts(name)).size).toBe(3);
    }
  });

  it("keeps a project's three ports on the same offset", () => {
    const ports = deriveProjectPorts("my-package");
    const offsets = new Set([
      ports.switchboardPort - PROJECT_PORT_BAND_SWITCHBOARD,
      ports.studioPort - PROJECT_PORT_BAND_STUDIO,
      ports.vetraConnectPort - PROJECT_PORT_BAND_VETRA_CONNECT,
    ]);
    expect(offsets.size).toBe(1);
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

  it("stays clear of the standard Powerhouse ports", () => {
    const standard = new Set([3000, 3001, 4001, 4002, 4173, 5173]);
    for (const name of NAMES) {
      for (const port of allPorts(name)) {
        expect(standard.has(port)).toBe(false);
      }
    }
  });

  it("rejects an empty name", () => {
    expect(() => deriveProjectPorts("")).toThrow(/project name/i);
    expect(() => deriveProjectPorts("   ")).toThrow(/project name/i);
  });
});

describe("projectPortBands", () => {
  it("reports the three bands it can allocate from", () => {
    expect(projectPortBands()).toEqual([
      { from: 7000, to: 7999 },
      { from: 6000, to: 6999 },
      { from: 2000, to: 2999 },
    ]);
  });

  it("leaves most of the offset space usable after the denylist", () => {
    const usable = Array.from(
      { length: PROJECT_PORT_BAND_SIZE },
      (_, offset) => offset,
    ).filter(
      (offset) =>
        ![
          PROJECT_PORT_BAND_SWITCHBOARD,
          PROJECT_PORT_BAND_STUDIO,
          PROJECT_PORT_BAND_VETRA_CONNECT,
        ].some((base) => PROJECT_PORT_DENYLIST.has(base + offset)),
    ).length;
    // Guards against a future denylist addition quietly shrinking the space
    // and pushing up the odds of two projects sharing an offset.
    expect(usable).toBeGreaterThan(900);
  });
});
