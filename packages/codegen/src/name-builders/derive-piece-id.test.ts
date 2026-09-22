import { describe, expect, it } from "vitest";
import { derivePieceId } from "./derive-piece-id.js";

describe("derivePieceId", () => {
  it("lends a piece package its own name, which is the version-tied case", () => {
    expect(
      derivePieceId({
        packageName: "@acme/piece-crm",
        slug: "crm",
        hasOtherPieces: false,
      }),
    ).toEqual({ id: "@acme/piece-crm", needsConfirmation: false });
  });

  it("gives a second piece its own name, since the package name is spent", () => {
    expect(
      derivePieceId({
        packageName: "@acme/piece-crm",
        slug: "billing",
        hasOtherPieces: true,
      }),
    ).toEqual({ id: "@acme/piece-billing", needsConfirmation: false });
  });

  it("borrows the scope of any other scoped package", () => {
    expect(
      derivePieceId({
        packageName: "@acme/ledger",
        slug: "crm",
        hasOtherPieces: false,
      }),
    ).toEqual({ id: "@acme/piece-crm", needsConfirmation: false });
  });

  it("asks when the package is unscoped, because the scope is invented", () => {
    expect(
      derivePieceId({
        packageName: "umh-production-ledger",
        slug: "umh",
        hasOtherPieces: false,
      }),
    ).toEqual({
      id: "@umh-production-ledger/piece-umh",
      needsConfirmation: true,
    });
  });
});
