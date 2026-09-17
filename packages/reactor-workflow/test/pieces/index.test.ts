describe("reactor-connectors", () => {
  it("has a package entry point", async () => {
    await expect(import("../src/index.js")).resolves.toBeDefined();
  });
});
