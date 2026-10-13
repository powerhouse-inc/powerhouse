import { describe, it, expect } from "vitest";
import net from "node:net";
import {
  defaultPort,
  resolvePort,
  resolveReactorDefaults,
} from "../src/integrations/powerhouse/ports.js";

describe("defaultPort", () => {
  it("is deterministic: same inputs produce same output", () => {
    const a = defaultPort("my-cli", "switchboard");
    const b = defaultPort("my-cli", "switchboard");
    expect(a).toBe(b);
  });

  it("different CLI names produce different ports", () => {
    const a = defaultPort("ph-rupert", "switchboard");
    const b = defaultPort("ph-mara", "switchboard");
    expect(a).not.toBe(b);
  });

  it("different salts produce different ports for same CLI name", () => {
    const a = defaultPort("my-cli", "switchboard");
    const b = defaultPort("my-cli", "connect");
    expect(a).not.toBe(b);
  });

  it("port is rounded to nearest multiple of 10", () => {
    const port = defaultPort("my-cli", "switchboard");
    expect(port % 10).toBe(0);
  });

  it("port is in range 10000–59900", () => {
    const names = [
      "a",
      "bb",
      "ccc",
      "ph-rupert",
      "ph-mara",
      "test-cli",
      "x".repeat(100),
    ];
    const salts = ["switchboard", "connect", "foo"];
    for (const name of names) {
      for (const salt of salts) {
        const port = defaultPort(name, salt);
        expect(port).toBeGreaterThanOrEqual(10000);
        expect(port).toBeLessThanOrEqual(59900);
      }
    }
  });
});

describe("resolvePort", () => {
  it("returns port when it is free", async () => {
    // Use a high port that is very likely free
    const port = 49152 + Math.floor(Math.random() * 10000);
    const result = await resolvePort(port, 1, "test");
    expect(result).toBe(port);
  });

  it("scans range and returns first free port", async () => {
    // Occupy a port, then resolve with range=2
    const basePort = 49152 + Math.floor(Math.random() * 10000);
    const server = net.createServer();
    await new Promise<void>((resolve) => {
      server.listen(basePort, "127.0.0.1", () => resolve());
    });

    try {
      const result = await resolvePort(basePort, 2, "test");
      expect(result).toBe(basePort + 1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("throws when entire range is occupied (range=1)", async () => {
    const basePort = 49152 + Math.floor(Math.random() * 10000);
    const server = net.createServer();
    await new Promise<void>((resolve) => {
      server.listen(basePort, "127.0.0.1", () => resolve());
    });

    try {
      await expect(resolvePort(basePort, 1, "Switchboard")).rejects.toThrow(
        /Switchboard port \d+ is already in use/,
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("throws when entire range is occupied (range>1)", async () => {
    const basePort = 49152 + Math.floor(Math.random() * 10000);
    const servers = [net.createServer(), net.createServer()];
    await Promise.all(
      servers.map(
        (s, i) =>
          new Promise<void>((resolve) =>
            s.listen(basePort + i, "127.0.0.1", () => resolve()),
          ),
      ),
    );

    try {
      await expect(resolvePort(basePort, 2, "test")).rejects.toThrow(
        /no free port in range/,
      );
    } finally {
      await Promise.all(
        servers.map(
          (s) => new Promise<void>((resolve) => s.close(() => resolve())),
        ),
      );
    }
  });
});

describe("resolveReactorDefaults", () => {
  it("stamps hash-derived port and namespaced name on switchboard", () => {
    const result = resolveReactorDefaults("my-cli", {
      switchboard: { enabled: true },
    });
    expect(result.switchboard!.port).toBe(defaultPort("my-cli", "switchboard"));
    expect(result.switchboard!.name).toBe("my-cli-api");
    expect(result.switchboard!.enabled).toBe(true);
  });

  it("stamps hash-derived port and namespaced name on connect", () => {
    const result = resolveReactorDefaults("my-cli", {
      connect: { enabled: true },
    });
    expect(result.connect!.port).toBe(defaultPort("my-cli", "connect"));
    expect(result.connect!.name).toBe("my-cli-studio");
    expect(result.connect!.enabled).toBe(true);
  });

  it("explicit port wins over hash-derived default", () => {
    const result = resolveReactorDefaults("my-cli", {
      switchboard: { enabled: true, port: 5555 },
    });
    expect(result.switchboard!.port).toBe(5555);
  });

  it("explicit name wins over derived default", () => {
    const result = resolveReactorDefaults("my-cli", {
      connect: { enabled: true, name: "custom-connect" },
    });
    expect(result.connect!.name).toBe("custom-connect");
  });

  it("mixed: explicit switchboard port, derived connect port", () => {
    const result = resolveReactorDefaults("my-cli", {
      switchboard: { enabled: true, port: 9000 },
      connect: { enabled: true },
    });
    expect(result.switchboard!.port).toBe(9000);
    expect(result.connect!.port).toBe(defaultPort("my-cli", "connect"));
  });

  it("returns empty when neither sub-config is present", () => {
    const result = resolveReactorDefaults("my-cli", {});
    expect(result.switchboard).toBeUndefined();
    expect(result.connect).toBeUndefined();
  });

  it("preserves other config fields", () => {
    const result = resolveReactorDefaults("my-cli", {
      switchboard: { enabled: true, host: "0.0.0.0", portRange: 5 },
      connect: { enabled: true, workdir: "/some/path" },
    });
    expect(result.switchboard!.host).toBe("0.0.0.0");
    expect(result.switchboard!.portRange).toBe(5);
    expect(result.connect!.workdir).toBe("/some/path");
  });
});
