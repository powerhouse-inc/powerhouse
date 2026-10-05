// The registry as the host fills it: it holds what it is given and answers the
// three questions a resolver, a catalog and a block type ask of it.
import { describe, expect, it } from "vitest";
import type { LocalPiece } from "../pieces/index.js";
import { PieceRegistry } from "./piece-registry.js";

const bundled = (name: string, version: string): LocalPiece => ({
  name,
  version,
  bundleDir: `/pkg/dist/node/pieces/${name.split("/").pop()}`,
});

describe("PieceRegistry", () => {
  it("holds what the host gives it, by name", () => {
    const registry = new PieceRegistry();
    const piece = bundled("@powerhousedao/piece-reactor", "1.2.3");

    registry.setPieces([piece]);

    expect(registry.lookup("@powerhousedao/piece-reactor")).toEqual(piece);
    expect(registry.entries()).toEqual([piece]);
    // What an unversioned block type resolves against.
    expect(registry.versions()).toEqual({
      "@powerhousedao/piece-reactor": "1.2.3",
    });
  });

  it("keeps the first claim on a name", () => {
    const registry = new PieceRegistry();
    const project = bundled("@acme/piece-dup", "2.0.0");
    const dependency = bundled("@acme/piece-dup", "1.0.0");

    registry.setPieces([project, dependency]);

    expect(registry.lookup("@acme/piece-dup")).toEqual(project);
    expect(registry.entries()).toHaveLength(1);
  });

  it("replaces the whole set, so a removed package's piece goes", () => {
    const registry = new PieceRegistry();
    registry.setPieces([bundled("@acme/piece-one", "1.0.0")]);

    registry.setPieces([bundled("@acme/piece-two", "1.0.0")]);

    expect(registry.lookup("@acme/piece-one")).toBeUndefined();
    expect(registry.versions()).toEqual({ "@acme/piece-two": "1.0.0" });
  });

  it("answers empty until a host has filled it", () => {
    const registry = new PieceRegistry();

    expect(registry.entries()).toEqual([]);
    expect(registry.versions()).toEqual({});
    expect(registry.lookup("@acme/piece-anything")).toBeUndefined();
  });

  it("empties on reset", () => {
    const registry = new PieceRegistry();
    registry.setPieces([bundled("@acme/piece-one", "1.0.0")]);

    registry.reset();

    expect(registry.entries()).toEqual([]);
  });
});
