import { describe, expect, it } from "vitest";
import { explainTestError } from "./step-test.js";

describe("explainTestError", () => {
  it("points an untested upstream step at that step, whatever the reason", () => {
    for (const suffix of [
      "",
      ": its last test failed",
      ": it changed since its last test",
      ": its last test is not visible to you",
    ]) {
      const error = `Test "fetch" first${suffix}`;
      expect(explainTestError(error)).toEqual({
        message: error,
        targets: [{ kind: "step", key: "fetch" }],
      });
    }
  });

  it("points at the trigger", () => {
    expect(explainTestError("Test the trigger first").targets).toEqual([
      { kind: "trigger" },
    ]);
    expect(
      explainTestError(
        "Test the trigger first: its last test returned no items",
      ).targets,
    ).toEqual([{ kind: "trigger" }]);
  });

  it("points a redacted read at every block it came from", () => {
    expect(
      explainTestError(
        '"post" reads a value redacted from the last test of "fetch", "login"',
      ).targets,
    ).toEqual([
      { kind: "step", key: "fetch" },
      { kind: "step", key: "login" },
    ]);
    expect(
      explainTestError(
        '"post" reads a value redacted from the last test of the trigger',
      ).targets,
    ).toEqual([{ kind: "trigger" }]);
  });

  it("points a variable type error at the variables", () => {
    for (const error of [
      'Variable "limit" is a NUMBER, but its value "x" is not a number',
      'Secret variable "token" could not be resolved: gone',
    ]) {
      expect(explainTestError(error).targets).toEqual([{ kind: "variables" }]);
    }
  });

  it("leaves any other failure as it is", () => {
    expect(explainTestError("HTTP 500 from example.com")).toEqual({
      message: "HTTP 500 from example.com",
      targets: [],
    });
  });
});
