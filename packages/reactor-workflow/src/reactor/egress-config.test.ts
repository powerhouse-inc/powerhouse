// The one knob a co-hosted reactor has: which private addresses its pieces may
// reach. Everything here is about not widening more than was asked for.
import { afterEach, describe, expect, it } from "vitest";
import { configuredEgress } from "./lib.js";

const ENV = "WORKFLOW_EGRESS_ALLOW_ADDRESSES";

afterEach(() => {
  delete process.env[ENV];
});

describe("configuredEgress", () => {
  it("is absent when nothing is configured, leaving the deny-private default", () => {
    expect(configuredEgress()).toBeUndefined();
  });

  it("treats an empty or blank value as absent rather than as an empty allowlist", () => {
    process.env[ENV] = "   ";

    expect(configuredEgress()).toBeUndefined();
  });

  it("reads a comma-separated list, ignoring the spacing around it", () => {
    process.env[ENV] = " 127.0.0.1/32 , ::1/128 ";

    expect(configuredEgress()).toEqual({
      allowAddresses: ["127.0.0.1/32", "::1/128"],
    });
  });

  it("reads a bare address as that one host, not the network around it", () => {
    // 10.0.0.5 must not quietly become 10.0.0.0/8.
    process.env[ENV] = "127.0.0.1,10.0.0.5,::1";

    expect(configuredEgress()).toEqual({
      allowAddresses: ["127.0.0.1/32", "10.0.0.5/32", "::1/128"],
    });
  });

  it("widens nothing else: no hosts, no ports, and private space still denied", () => {
    process.env[ENV] = "127.0.0.1/32";

    const policy = configuredEgress();

    expect(policy).not.toHaveProperty("allowHosts");
    expect(policy).not.toHaveProperty("allowPorts");
    // The blunt switch stays off: only the named addresses are reachable.
    expect(policy).not.toHaveProperty("allowPrivateAddresses");
  });
});
