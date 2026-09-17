describe("pieces", () => {
  it("has a package entry point", async () => {
    await expect(import("../../src/pieces/index.js")).resolves.toBeDefined();
  });
});
