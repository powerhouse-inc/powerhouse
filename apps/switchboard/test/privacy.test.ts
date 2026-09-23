import { describe, expect, it } from "vitest";
import {
  composePrivacySubgraph,
  PH_PRIVACY_ENABLED,
  PH_PRIVACY_SECRET,
  resolvePrivacyConfig,
} from "../src/privacy.mjs";

describe("privacy requests in switchboard", () => {
  it("are off unless the flag is set", () => {
    expect(resolvePrivacyConfig({})).toEqual({ enabled: false });
    expect(resolvePrivacyConfig({ [PH_PRIVACY_ENABLED]: "false" })).toEqual({
      enabled: false,
    });
  });

  it("need a deployment secret once enabled", () => {
    expect(() =>
      resolvePrivacyConfig({ [PH_PRIVACY_ENABLED]: "true" }),
    ).toThrow(PH_PRIVACY_SECRET);
    expect(
      resolvePrivacyConfig({
        [PH_PRIVACY_ENABLED]: "1",
        [PH_PRIVACY_SECRET]: " s3cret ",
      }),
    ).toEqual({ enabled: true, secret: "s3cret" });
  });

  it("serve nothing without an in-process reactor to purge", () => {
    expect(
      composePrivacySubgraph({
        clientModule: undefined,
        secret: "s",
        documentPermissionService: undefined,
      } as never),
    ).toBeUndefined();
  });
});
