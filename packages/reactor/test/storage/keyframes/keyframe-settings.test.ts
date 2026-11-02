import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYFRAME_RULE,
  parseKeyframeSettings,
  resolveKeyframeRule,
} from "../../../src/storage/keyframes/keyframe-settings.js";

describe("resolveKeyframeRule", () => {
  it("is today's behaviour with nothing configured", () => {
    expect(resolveKeyframeRule(undefined, "a/b")).toEqual({
      interval: 10,
      keep: null,
    });
    expect(resolveKeyframeRule({}, "a/b")).toEqual(DEFAULT_KEYFRAME_RULE);
  });

  it("takes the default over the built-in rule", () => {
    expect(resolveKeyframeRule({ default: { keep: 4 } }, "a/b")).toEqual({
      interval: 10,
      keep: 4,
    });
  });

  it("takes an exact type over the default, part by part", () => {
    const settings = {
      default: { interval: 25, keep: 4 },
      types: { "a/b": { keep: 1 }, "a/c": { interval: 50 } },
    };
    expect(resolveKeyframeRule(settings, "a/b")).toEqual({
      interval: 25,
      keep: 1,
    });
    expect(resolveKeyframeRule(settings, "a/c")).toEqual({
      interval: 50,
      keep: 4,
    });
    expect(resolveKeyframeRule(settings, "a/d")).toEqual({
      interval: 25,
      keep: 4,
    });
  });

  it("lets a type keep everything under a bounded default", () => {
    expect(
      resolveKeyframeRule(
        { default: { keep: 4 }, types: { "a/b": { keep: null } } },
        "a/b",
      ).keep,
    ).toBeNull();
  });
});

describe("parseKeyframeSettings", () => {
  it("returns valid settings unchanged", () => {
    const settings = {
      default: { interval: 10, keep: 4 },
      types: { "sektar/email": { interval: 50, keep: 1 } },
    };
    expect(parseKeyframeSettings(settings, "test")).toEqual(settings);
  });

  it("accepts an empty object", () => {
    expect(parseKeyframeSettings({}, "test")).toEqual({});
  });

  it.each([
    ["not an object", 3, "test must be an object"],
    ["an unknown key", { profile: {} }, "test has an unknown key: profile"],
    ["types of the wrong shape", { types: [] }, "test.types must be an object"],
    [
      "a zero interval",
      { default: { interval: 0 } },
      "test.default.interval must be a whole number from 1 up",
    ],
    [
      "a fractional interval",
      { types: { "a/b": { interval: 1.5 } } },
      "test.types[a/b].interval must be a whole number from 1 up",
    ],
    [
      "a zero keep",
      { default: { keep: 0 } },
      "test.default.keep must be a whole number from 1 up, or null to keep all",
    ],
    [
      "an unknown rule key",
      { default: { recent: 4 } },
      "test.default has an unknown key: recent",
    ],
  ])("refuses %s", (_name, raw, message) => {
    expect(() => parseKeyframeSettings(raw, "test")).toThrow(message);
  });
});
