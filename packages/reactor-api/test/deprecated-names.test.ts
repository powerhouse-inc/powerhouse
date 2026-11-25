/**
 * `CodeFirstSubgraphError` is the deprecated name of `SubgraphError`. tsc
 * checks the type assertions over the test sources.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { CodeFirstSubgraphError, SubgraphError } from "../index.mjs";

describe("CodeFirstSubgraphError", () => {
  it("is the SubgraphError class", () => {
    expect(CodeFirstSubgraphError).toBe(SubgraphError);
    expect(new SubgraphError("refused")).toBeInstanceOf(CodeFirstSubgraphError);
    expect(new CodeFirstSubgraphError("refused")).toBeInstanceOf(SubgraphError);
  });

  it("names its instances SubgraphError", () => {
    expect(new SubgraphError("refused").name).toBe("SubgraphError");
    expect(new CodeFirstSubgraphError("refused").name).toBe("SubgraphError");
  });

  it("is assignable to SubgraphError and back, as a class and as an instance", () => {
    const byOldName: CodeFirstSubgraphError = new SubgraphError("refused");
    const byNewName: SubgraphError = new CodeFirstSubgraphError("refused");

    expectTypeOf<CodeFirstSubgraphError>().toEqualTypeOf<SubgraphError>();
    expectTypeOf<typeof CodeFirstSubgraphError>().toEqualTypeOf<
      typeof SubgraphError
    >();
    expect([byOldName.message, byNewName.message]).toEqual([
      "refused",
      "refused",
    ]);
  });
});
