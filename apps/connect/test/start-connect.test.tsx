// @vitest-environment happy-dom

import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const painted: ReactNode[] = [];

// The boot painted its skeleton; the app graph is Connect's, minus the heavy app.
vi.mock("../src/boot.js", () => ({
  bootConnect: () =>
    Promise.resolve({ render: (node: ReactNode) => painted.push(node) }),
}));
vi.mock("../src/components/index.js", () => ({
  loadLocalPackage: (pkg: unknown) => pkg,
  AppLoader: () => null,
}));

describe("startConnect", () => {
  it("renders the app into the painted root", async () => {
    const { startConnect } = await import("../start-connect.js");

    const pkg = { [Symbol.toStringTag]: "Module" } as const;
    startConnect(() => Promise.resolve(pkg));

    expect(painted).toHaveLength(1);
  });
});
