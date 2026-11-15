import { parse } from "cmd-ts";
import { describe, expect, it } from "vitest";

describe("help listing", () => {
  it("lists run and host", async () => {
    const { phCliHelpCommands } =
      await import("@powerhousedao/shared/clis/args");
    const names = Object.keys(phCliHelpCommands);
    expect(names).toContain("run");
    expect(names).toContain("host");
    expect(names).toContain("generate");
  });
});

describe("ph host", () => {
  it.each(["check", "export"])("registers %s", async (name) => {
    const { host } = await import("../src/commands/host.js");
    expect(await parse(host, [name, "switchboard"])).toMatchObject({
      _tag: "ok",
      value: { command: name, args: { host: "switchboard" } },
    });
  });
});
