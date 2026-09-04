import { describe, expect, it } from "vitest";
import { CoreBlockExecutor } from "../../src/engine/blocks.js";

const core = new CoreBlockExecutor();

const branch = (config: Record<string, unknown>) =>
  core.execute({
    blockType: "core#branch",
    stepId: "s",
    stepKey: "s",
    config,
  } as never);

describe("core#branch", () => {
  it("routes on truthiness when no equals is set", async () => {
    expect((await branch({ condition: "yes" })).port).toBe("true");
    expect((await branch({ condition: "" })).port).toBe("false");
    expect((await branch({ condition: "false" })).port).toBe("false");
    expect((await branch({ condition: "0" })).port).toBe("false");
  });

  it("compares against equals, trimmed and case-insensitively", async () => {
    const equals = "create";
    expect((await branch({ condition: "create", equals })).port).toBe("true");
    expect((await branch({ condition: " Create\n", equals })).port).toBe("true");
    // Both sides non-empty: truthiness alone could not tell these apart.
    expect((await branch({ condition: "edit", equals })).port).toBe("false");
    expect((await branch({ condition: "", equals })).port).toBe("false");
  });
});

const assert = (config: Record<string, unknown>) =>
  core.execute({
    blockType: "core#assert",
    stepId: "s",
    stepKey: "s",
    config,
  } as never);

describe("core#assert", () => {
  it("passes a usable value through", async () => {
    const result = await assert({ value: "It posts to Discord." });
    expect(result).toEqual({
      output: { value: "It posts to Discord." },
      port: "next",
    });
  });

  it("fails on a blank value unless allowEmpty is set", async () => {
    await expect(assert({ value: "" })).rejects.toThrow("value is empty");
    await expect(assert({ value: "  \n" })).rejects.toThrow("value is empty");
    await expect(assert({})).rejects.toThrow("value is empty");
    expect((await assert({ value: "", allowEmpty: true })).port).toBe("next");
  });

  it("fails on a rejected value, trimmed and case-insensitively", async () => {
    const rejectValues = ["User Safety: safe"];
    await expect(assert({ value: "User Safety: safe", rejectValues })).rejects
      .toThrow(/rejected value/);
    await expect(assert({ value: " user safety: SAFE ", rejectValues })).rejects
      .toThrow(/rejected value/);
    // A string is one rejected value, not a list.
    await expect(assert({ value: "nope", rejectValues: "nope" })).rejects
      .toThrow(/rejected value/);
    expect((await assert({ value: "A real answer.", rejectValues })).port).toBe(
      "next",
    );
  });

  it("uses the configured message when the assertion fails", async () => {
    await expect(
      assert({ value: "", message: "The model returned nothing" }),
    ).rejects.toThrow("The model returned nothing");
  });

  it("treats null and undefined as empty", async () => {
    await expect(assert({ value: null })).rejects.toThrow("value is empty");
  });

  it("stringifies a non-string value before comparing", async () => {
    expect((await assert({ value: { ok: true } })).port).toBe("next");
    await expect(
      assert({ value: { ok: true }, rejectValues: ['{"ok":true}'] }),
    ).rejects.toThrow(/rejected value/);
  });
});

describe("core#assert allowValues", () => {
  const allowValues = ["ENABLED", "DISABLED"];

  it("passes a value on the allow-list, trimmed and case-insensitively", async () => {
    expect((await assert({ value: "DISABLED", allowValues })).port).toBe("next");
    expect((await assert({ value: " disabled\n", allowValues })).port).toBe(
      "next",
    );
  });

  it("fails anything else, naming the allowed values", async () => {
    // The motivating case: a classifier answering a different question.
    await expect(assert({ value: "Safety:", allowValues })).rejects.toThrow(
      /not one of the allowed values \(enabled, disabled\)/,
    );
  });

  it("treats a string as a single allowed value", async () => {
    expect((await assert({ value: "ok", allowValues: "ok" })).port).toBe("next");
    await expect(assert({ value: "no", allowValues: "ok" })).rejects.toThrow(
      /allowed values/,
    );
  });

  it("still applies the reject-list and the blank check first", async () => {
    await expect(assert({ value: "", allowValues })).rejects.toThrow(
      "value is empty",
    );
    await expect(
      assert({ value: "ENABLED", allowValues, rejectValues: ["ENABLED"] }),
    ).rejects.toThrow(/rejected value/);
  });
});
