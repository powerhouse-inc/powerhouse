import { describe, expect, it } from "vitest";
import { resolveReactorNamespace } from "../../src/utils/reactor-namespace.js";

describe("resolveReactorNamespace", () => {
  it("returns the byte-identical root namespace with no override or endpoint", () => {
    expect(resolveReactorNamespace({ basePath: "/" })).toBe("reactor");
  });

  it("derives from the base path under a path prefix", () => {
    expect(resolveReactorNamespace({ basePath: "/team-a/" })).toBe(
      "reactor--team-a",
    );
  });

  it("appends a stable, name-safe hash when an endpoint is given", () => {
    const a = resolveReactorNamespace({
      basePath: "/",
      endpoint: "https://x.example",
    });
    const b = resolveReactorNamespace({
      basePath: "/",
      endpoint: "https://x.example",
    });
    const c = resolveReactorNamespace({
      basePath: "/",
      endpoint: "https://y.example",
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^reactor--[0-9a-z]+$/);
  });

  it("prefers an explicit namespace over base path and endpoint", () => {
    expect(
      resolveReactorNamespace({
        basePath: "/team-a/",
        endpoint: "https://x.example",
        explicit: "custom",
      }),
    ).toBe("custom");
  });

  it("ignores blank explicit and endpoint values", () => {
    expect(resolveReactorNamespace({ basePath: "/", explicit: "   " })).toBe(
      "reactor",
    );
    expect(resolveReactorNamespace({ basePath: "/", endpoint: "  " })).toBe(
      "reactor",
    );
  });
});
