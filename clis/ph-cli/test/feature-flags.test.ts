import { describe, expect, it } from "vitest";
import {
  isUniformRunnersEnabled,
  UNIFORM_RUNNERS_FLAG,
} from "../src/utils/feature-flags.js";

describe("isUniformRunnersEnabled", () => {
  it("is off when the variable is unset", () => {
    expect(isUniformRunnersEnabled({})).toBe(false);
  });

  it.each(["1", "true", "TRUE", " true "])("is on for %j", (value) => {
    expect(isUniformRunnersEnabled({ [UNIFORM_RUNNERS_FLAG]: value })).toBe(
      true,
    );
  });

  it.each(["0", "false", "", "yes", "on", "enabled"])(
    "stays off for %j (strict values only)",
    (value) => {
      expect(isUniformRunnersEnabled({ [UNIFORM_RUNNERS_FLAG]: value })).toBe(
        false,
      );
    },
  );
});
