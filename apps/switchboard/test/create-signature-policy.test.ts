import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import { applySwitchboardReactorDefaults } from "../src/builder-defaults.mjs";
import { resolveCreateSignaturePolicy } from "../src/create-signature-policy.mjs";

describe("resolveCreateSignaturePolicy", () => {
  it("defaults to v2-required with a signer", () => {
    expect(resolveCreateSignaturePolicy({}, { hasSigner: true })).toBe(
      "v2-required",
    );
  });

  it("reads CREATE_SIGNATURE_POLICY", () => {
    expect(
      resolveCreateSignaturePolicy(
        { CREATE_SIGNATURE_POLICY: "legacy" },
        { hasSigner: true },
      ),
    ).toBe("legacy");
    expect(
      resolveCreateSignaturePolicy(
        { CREATE_SIGNATURE_POLICY: " v2-required " },
        { hasSigner: true },
      ),
    ).toBe("v2-required");
  });

  it("refuses an unknown value", () => {
    expect(() =>
      resolveCreateSignaturePolicy(
        { CREATE_SIGNATURE_POLICY: "v2" },
        { hasSigner: true },
      ),
    ).toThrow(/CREATE_SIGNATURE_POLICY/);
  });

  it("falls back to legacy with a warning when there is no signer", () => {
    const warn = vi.fn();

    expect(
      resolveCreateSignaturePolicy({}, { hasSigner: false, logger: { warn } }),
    ).toBe("legacy");
    expect(warn).toHaveBeenCalledOnce();

    warn.mockClear();
    expect(
      resolveCreateSignaturePolicy(
        { CREATE_SIGNATURE_POLICY: "legacy" },
        { hasSigner: false, logger: { warn } },
      ),
    ).toBe("legacy");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("applySwitchboardReactorDefaults", () => {
  it("hands the creation policy to the client builder", () => {
    const clientBuilder = new ReactorClientBuilder();
    const withPolicy = vi.spyOn(clientBuilder, "withCreateSignaturePolicy");

    applySwitchboardReactorDefaults(new ReactorBuilder(), clientBuilder, {
      includeBaseModels: false,
      signalHandlers: false,
      createSignaturePolicy: "legacy",
    });

    expect(withPolicy).toHaveBeenCalledWith("legacy");
  });
});
